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
	engine   EngineClient
}

func NewTorrentService(
	sessions repository.TorrentRepository,
	files repository.TorrentFileRepository,
	library repository.LibraryRepository,
	engine EngineClient,
) TorrentService {
	return &torrentService{sessions: sessions, files: files, library: library, engine: engine}
}

// maxMagnetURILength bounds the magnet URI an API client may submit. The
// BitTorrent spec has no hard cap but real-world magnets rarely exceed 1 KB;
// the ceiling blocks trivial request-bloat DoS without rejecting legit links.
const maxMagnetURILength = 2048

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

	// Idempotent re-add: if the user already owns a session for this hash,
	// return it instead of creating a duplicate.
	if existing, err := s.sessions.GetByInfoHash(ctx, infoHash); err == nil {
		if existing.UserID == userID {
			return existing, nil
		}
		return nil, domain.NewError(domain.ErrConflict, "torrent already added by another user", nil)
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
	if _, err := s.engine.Add(ctx, magnetURI); err != nil {
		_ = s.sessions.Delete(ctx, session.ID)
		return nil, domain.NewError(domain.ErrUnavailable, "torrent engine unavailable", err)
	}

	// Auto-shelf: create a library row with the infoHash as placeholder title.
	// The real name lands via ApplyMetadata once the swarm delivers metadata.
	// Conflicts (user re-added the same torrent) are swallowed — idempotency.
	if _, err := s.library.Create(ctx, domain.LibraryItem{
		UserID:    userID,
		SessionID: session.ID,
		Title:     session.InfoHash,
		Type:      domain.LibraryTypeOther,
	}); err != nil {
		if de := (*domain.Error)(nil); !errors.As(err, &de) || de.Code != domain.ErrConflict {
			return nil, err
		}
	}

	return session, nil
}

func (s *torrentService) List(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error) {
	return s.sessions.ListByUser(ctx, userID)
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
			FileType:  normalizeFileType(f.FileType),
			Priority:  1,
		})
	}
	if err := s.files.CreateBatch(ctx, domainFiles); err != nil {
		return err
	}
	if err := s.sessions.UpdateMetadata(ctx, infoHash, name, totalSize); err != nil {
		return err
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
	case "cbz":
		return domain.FileTypeCBZ
	case "cbr":
		return domain.FileTypeCBR
	default:
		return domain.FileTypeUnknown
	}
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
