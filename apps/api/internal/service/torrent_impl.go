package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

var magnetRE = regexp.MustCompile(`^magnet:\?xt=urn:btih:([a-fA-F0-9]{40})`)

type torrentService struct {
	sessions repository.TorrentRepository
	files    repository.TorrentFileRepository
	library  repository.LibraryRepository
	settings repository.SettingsRepository
	engine   EngineClient
}

func NewTorrentService(
	sessions repository.TorrentRepository,
	files repository.TorrentFileRepository,
	library repository.LibraryRepository,
	settings repository.SettingsRepository,
	engine EngineClient,
) TorrentService {
	return &torrentService{sessions: sessions, files: files, library: library, settings: settings, engine: engine}
}

// maxMagnetURILength bounds the magnet URI an API client may submit. The
// BitTorrent spec has no hard cap but real-world magnets rarely exceed 1 KB;
// the ceiling blocks trivial request-bloat DoS without rejecting legit links.
const maxMagnetURILength = 2048

// mapEngineAddError translates an engine add failure into a domain error.
// A machine-readable EngineAddError (disk full, invalid magnet, etc.) is
// surfaced with the real reason; any other error is a transport/unknown
// failure and is hidden behind a generic "unavailable" so internal details
// (engine URLs, connection strings) never leak into the API response.
func mapEngineAddError(err error) error {
	var ae *EngineAddError
	if errors.As(err, &ae) {
		switch ae.Code {
		case "insufficient_disk", "disk_budget":
			return domain.NewError(domain.ErrInsufficientStorage, ae.Message, err)
		case "max_torrents":
			return domain.NewError(domain.ErrUnavailable, ae.Message, err)
		case "invalid_magnet", "invalid_path", "invalid_upload":
			return domain.NewError(domain.ErrInvalidInput, ae.Message, err)
		}
	}
	return domain.NewError(domain.ErrUnavailable, "torrent engine unavailable", err)
}

// safeDownloadPath returns the user's stored download path only if it is a
// valid relative subfolder; legacy/invalid values (e.g. the old absolute
// "/data/torrents" default) fall back to "" so the engine uses its default
// instead of rejecting the add with invalid_path.
func safeDownloadPath(p string) string {
	if validDownloadSubpath(p) {
		return strings.TrimSpace(p)
	}
	return ""
}

func (s *torrentService) Add(ctx context.Context, userID uuid.UUID, magnetURI string) (*domain.TorrentSession, error) {
	magnetURI = strings.TrimSpace(magnetURI)
	if len(magnetURI) > maxMagnetURILength {
		return nil, domain.NewError(domain.ErrInvalidInput, "magnet URI too long", nil)
	}
	m := magnetRE.FindStringSubmatch(magnetURI)
	if m == nil {
		return nil, domain.NewError(domain.ErrInvalidInput,
			"invalid magnet link — must start with magnet:?xt=urn:btih:<40-hex>", nil)
	}
	infoHash := strings.ToLower(m[1])

	// Idempotent re-add: if THIS user already owns a session for this hash,
	// return it instead of creating a duplicate.
	if existing, err := s.sessions.GetByUserAndInfoHash(ctx, userID, infoHash); err == nil {
		return existing, nil
	} else if !isNotFound(err) {
		return nil, err
	}

	session, err := s.sessions.Create(ctx, domain.TorrentSession{
		UserID:    userID,
		InfoHash:  infoHash,
		MagnetURI: magnetURI,
		Status:    domain.StatusFetchingMetadata,
	})
	if err != nil {
		return nil, err
	}

	// Fire engine call in the request context. If the engine is unreachable
	// we roll back the DB row so the user can retry cleanly. The underlying
	// error is wrapped (not exposed) so upstream URLs / connection strings
	// never leak into the API response.
	// Fetch the user's download path from settings (best-effort; fallback to
	// engine default if settings lookup fails).
	downloadPath := ""
	if userSettings, err := s.settings.GetByUserID(ctx, userID); err == nil {
		downloadPath = safeDownloadPath(userSettings.DownloadPath)
	}

	if _, err := s.engine.Add(ctx, magnetURI, downloadPath, false); err != nil {
		_ = s.sessions.Delete(ctx, session.ID)
		return nil, mapEngineAddError(err)
	}

	if err := s.autoShelf(ctx, userID, session); err != nil {
		return nil, err
	}
	return session, nil
}

// autoShelf creates a library row for the session (title = infoHash placeholder;
// the real name lands via ApplyMetadata once metadata arrives). Gated by the
// user's autoAddLibrary setting. Conflicts are swallowed (idempotency).
func (s *torrentService) autoShelf(ctx context.Context, userID uuid.UUID, session *domain.TorrentSession) error {
	autoAdd := true
	if userSettings, err := s.settings.GetByUserID(ctx, userID); err == nil {
		autoAdd = userSettings.AutoAddLibrary
	}
	if !autoAdd {
		return nil
	}
	if _, err := s.library.Create(ctx, domain.LibraryItem{
		UserID:    userID,
		SessionID: session.ID,
		Title:     session.InfoHash,
		Type:      domain.LibraryTypeOther,
	}); err != nil {
		if de := (*domain.Error)(nil); !errors.As(err, &de) || de.Code != domain.ErrConflict {
			return err
		}
	}
	return nil
}

// AddFromFile adds a torrent from a raw .torrent file. The infoHash/name come
// from the engine's parse of the file (the engine derives the hash), then the
// session is created just like the magnet flow (idempotent per user).
func (s *torrentService) AddFromFile(ctx context.Context, userID uuid.UUID, torrentFile []byte) (*domain.TorrentSession, error) {
	if len(torrentFile) == 0 {
		return nil, domain.NewError(domain.ErrInvalidInput, "empty torrent file", nil)
	}

	downloadPath := ""
	if userSettings, err := s.settings.GetByUserID(ctx, userID); err == nil {
		downloadPath = safeDownloadPath(userSettings.DownloadPath)
	}

	status, err := s.engine.AddFile(ctx, torrentFile, downloadPath)
	if err != nil {
		return nil, mapEngineAddError(err)
	}
	infoHash := strings.ToLower(status.InfoHash)
	if infoHash == "" {
		return nil, domain.NewError(domain.ErrUnavailable, "torrent metadata not available yet", nil)
	}

	// Idempotent per user: reuse an existing session for this hash.
	if existing, err := s.sessions.GetByUserAndInfoHash(ctx, userID, infoHash); err == nil {
		return existing, nil
	} else if !isNotFound(err) {
		return nil, err
	}

	session, err := s.sessions.Create(ctx, domain.TorrentSession{
		UserID:    userID,
		InfoHash:  infoHash,
		MagnetURI: "magnet:?xt=urn:btih:" + infoHash,
		Status:    domain.StatusFetchingMetadata,
	})
	if err != nil {
		return nil, err
	}

	if err := s.autoShelf(ctx, userID, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *torrentService) List(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error) {
	sessions, err := s.sessions.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	overlayLiveState(sessions, s.engine, ctx)
	return sessions, nil
}

// overlayLiveState merges the engine's live progress/peers/speeds onto the
// persisted sessions (the DB stores only zeros for these). Best-effort: if the
// engine is unreachable, sessions are returned unchanged.
func overlayLiveState(sessions []domain.TorrentSession, engine EngineClient, ctx context.Context) {
	live, err := engine.List(ctx)
	if err != nil || len(live) == 0 {
		return
	}
	byHash := make(map[string]EngineTorrentStatus, len(live))
	for _, t := range live {
		byHash[strings.ToLower(t.InfoHash)] = t
	}
	for i := range sessions {
		t, ok := byHash[strings.ToLower(sessions[i].InfoHash)]
		if !ok {
			continue
		}
		sessions[i].DownloadedBytes = t.Downloaded
		sessions[i].PeersCount = t.Peers
		sessions[i].DownloadSpeed = t.DownloadSpeed
		sessions[i].UploadSpeed = t.UploadSpeed
		if sessions[i].TotalSize == 0 && t.Length > 0 {
			sessions[i].TotalSize = t.Length
		}
		// The DB keeps a stale "downloading"; derive a live status instead.
		// Don't override an explicit paused/error state.
		if sessions[i].Status != domain.StatusPaused && sessions[i].Status != domain.StatusError {
			if t.Progress >= 1 {
				sessions[i].Status = domain.StatusSeeding
			} else {
				sessions[i].Status = domain.StatusDownloading
			}
		}
	}
}

func (s *torrentService) Get(ctx context.Context, userID, id uuid.UUID) (*domain.TorrentSession, error) {
	session, err := s.sessions.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if session.UserID != userID {
		return nil, domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}
	files, err := s.files.ListBySession(ctx, session.ID)
	if err != nil {
		return nil, err
	}
	session.Files = files
	return session, nil
}

func (s *torrentService) Delete(ctx context.Context, userID, id uuid.UUID) error {
	session, err := s.sessions.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if session.UserID != userID {
		return domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}
	if err := s.engine.Remove(ctx, session.InfoHash); err != nil {
		// Engine-level removal is best-effort — proceed with DB cleanup.
		_ = err
	}
	return s.sessions.Delete(ctx, id)
}

func (s *torrentService) SetPriority(ctx context.Context, userID, id uuid.UUID, fileIndex, priority int) error {
	if priority < 0 || priority > 2 {
		return domain.NewError(domain.ErrInvalidInput, "priority must be 0, 1, or 2", nil)
	}
	session, err := s.sessions.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if session.UserID != userID {
		return domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}
	return s.engine.SetPriority(ctx, session.InfoHash, fileIndex, priority)
}

func (s *torrentService) ApplyMetadata(
	ctx context.Context,
	infoHash, name string,
	totalSize int64,
	files []MetadataFile,
) error {
	infoHash = strings.ToLower(strings.TrimSpace(infoHash))
	session, err := s.sessions.GetByInfoHash(ctx, infoHash)
	if err != nil {
		return err
	}

	domainFiles := make([]domain.TorrentFile, 0, len(files))
	for _, f := range files {
		domainFiles = append(domainFiles, domain.TorrentFile{
			SessionID: session.ID,
			Index:     f.Index,
			Name:      f.Name,
			Path:      f.Path,
			Length:    f.Length,
			MimeType:  f.MimeType,
			FileType:  normalizeFileTypeWithName(f.FileType, f.Name),
			Priority:  1,
		})
	}
	if err := s.files.CreateBatch(ctx, domainFiles); err != nil {
		return err
	}
	if err := s.sessions.UpdateMetadata(ctx, infoHash, name, totalSize); err != nil {
		return err
	}
	// Infer the library item type from the dominant file type.
	inferredType := inferLibraryType(domainFiles)
	if err := s.library.UpdateTypeBySession(ctx, session.ID, inferredType); err != nil {
		// Non-critical — log but don't fail the metadata update.
		_ = err
	}
	if name != "" {
		if err := s.library.UpdateTitleBySession(ctx, session.ID, name); err != nil {
			return err
		}
	}
	return nil
}

func normalizeFileType(t string) domain.FileType {
	switch strings.ToLower(t) {
	case "image":
		return domain.FileTypeImage
	case "pdf":
		return domain.FileTypePDF
	case "epub":
		return domain.FileTypeEPUB
	case "cbz", "zip":
		// A plain .zip from the swarm is treated as CBZ — the archive route
		// only surfaces image entries, so a non-comic ZIP just renders as
		// an empty page list rather than failing.
		return domain.FileTypeCBZ
	case "cbr", "sevenz":
		// 7z is stored as 'cbr' in the DB (the schema constraint predates 7z
		// support). The engine archive route inspects the actual file
		// extension and picks the right extractor, so the type alias is
		// transparent to readers.
		return domain.FileTypeCBR
	case "video":
		return domain.FileTypeVideo
	default:
		return domain.FileTypeUnknown
	}
}

// normalizeFileTypeWithName falls back to file extension detection when the
// engine reports "unknown". This prevents video/image files from being
// permanently stored as "unknown" if the engine's detector missed them.
func normalizeFileTypeWithName(t, name string) domain.FileType {
	ft := normalizeFileType(t)
	if ft != domain.FileTypeUnknown {
		return ft
	}
	// Fallback: detect by extension
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".mkv"), strings.HasSuffix(lower, ".mp4"),
		strings.HasSuffix(lower, ".avi"), strings.HasSuffix(lower, ".wmv"),
		strings.HasSuffix(lower, ".flv"), strings.HasSuffix(lower, ".webm"),
		strings.HasSuffix(lower, ".mov"), strings.HasSuffix(lower, ".m4v"):
		return domain.FileTypeVideo
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"),
		strings.HasSuffix(lower, ".png"), strings.HasSuffix(lower, ".gif"),
		strings.HasSuffix(lower, ".webp"):
		return domain.FileTypeImage
	case strings.HasSuffix(lower, ".pdf"):
		return domain.FileTypePDF
	case strings.HasSuffix(lower, ".epub"):
		return domain.FileTypeEPUB
	case strings.HasSuffix(lower, ".cbz"), strings.HasSuffix(lower, ".zip"):
		return domain.FileTypeCBZ
	case strings.HasSuffix(lower, ".cbr"), strings.HasSuffix(lower, ".rar"),
		strings.HasSuffix(lower, ".7z"):
		return domain.FileTypeCBR
	}
	return domain.FileTypeUnknown
}

// inferLibraryType determines the library item content type from the dominant
// file type among the torrent's files.
func inferLibraryType(files []domain.TorrentFile) domain.LibraryItemType {
	counts := make(map[domain.FileType]int)
	for _, f := range files {
		counts[f.FileType]++
	}

	// Manga-like: images, CBZ, CBR
	mangaCount := counts[domain.FileTypeImage] + counts[domain.FileTypeCBZ] + counts[domain.FileTypeCBR]
	epubCount := counts[domain.FileTypeEPUB]
	pdfCount := counts[domain.FileTypePDF]
	videoCount := counts[domain.FileTypeVideo]

	max := mangaCount
	result := domain.LibraryTypeManga

	if epubCount > max {
		max = epubCount
		result = domain.LibraryTypeBook
	}
	if pdfCount > max {
		max = pdfCount
		result = domain.LibraryTypeDocument
	}
	if videoCount > max {
		max = videoCount
		result = domain.LibraryTypeVideo
	}

	if max == 0 {
		return domain.LibraryTypeOther
	}
	return result
}

func isNotFound(err error) bool {
	var de *domain.Error
	return errors.As(err, &de) && de.Code == domain.ErrNotFound
}

// InfoHashFromMagnet is exported for tests / handler debugging.
func InfoHashFromMagnet(magnetURI string) (string, error) {
	m := magnetRE.FindStringSubmatch(strings.TrimSpace(magnetURI))
	if m == nil {
		return "", fmt.Errorf("invalid magnet uri")
	}
	return strings.ToLower(m[1]), nil
}

// ReseedEngine re-adds all active torrents to the engine. This is
// called at API startup to recover from engine restarts (the engine
// stores no state and loses all torrents on process exit).
func (s *torrentService) ReseedEngine(ctx context.Context) error {
	sessions, err := s.sessions.ListAll(ctx)
	if err != nil {
		return fmt.Errorf("reseed: list sessions: %w", err)
	}

	var added, skipped int
	var failures []string
	for _, sess := range sessions {
		// Only re-add torrents that were actively downloading/seeding.
		if sess.Status == domain.StatusPaused || sess.MagnetURI == "" {
			skipped++
			continue
		}

		// Fetch the user's download path (best-effort; use default on error).
		downloadPath := ""
		if userSettings, settErr := s.settings.GetByUserID(ctx, sess.UserID); settErr == nil {
			downloadPath = safeDownloadPath(userSettings.DownloadPath)
		}

		if _, err := s.engine.Add(ctx, sess.MagnetURI, downloadPath, true); err != nil {
			// Record which torrent failed and why (engine code when available)
			// so the aggregate log is legible instead of an opaque "failed N/M".
			reason := "engine unavailable"
			var ae *EngineAddError
			if errors.As(err, &ae) {
				reason = ae.Code
			}
			failures = append(failures, fmt.Sprintf("%s(%s)", sess.InfoHash, reason))
			continue
		}
		added++
	}

	if len(failures) > 0 {
		return fmt.Errorf("reseed: added %d, skipped %d, failed %d/%d: %s",
			added, skipped, len(failures), len(sessions), strings.Join(failures, ", "))
	}
	return nil
}

