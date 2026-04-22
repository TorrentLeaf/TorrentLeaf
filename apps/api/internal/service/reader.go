package service

import (
	"context"
	"errors"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

// Page is a single readable page within a manga/comic session.
//
// A loose image file becomes one Page with EntryIndex == nil. A CBZ file
// becomes N Pages (one per image entry) sharing the same FileID but with
// EntryIndex set to the entry's ordinal position. Other types (pdf, epub)
// are handled by their own readers and are not materialized into Pages.
type Page struct {
	Index      int       `json:"index"`
	FileID     uuid.UUID `json:"fileId"`
	EntryIndex *int      `json:"entryIndex,omitempty"`
	Name       string    `json:"name"`
	MimeType   string    `json:"mimeType"`
	Length     int64     `json:"length"`
}

// ArchiveLister is the slice of EngineClient that the reader needs. Narrow
// interface = cheap to fake in tests, no engine HTTP plumbing required.
type ArchiveLister interface {
	ListArchiveEntries(ctx context.Context, infoHash string, fileIndex int) ([]EngineArchiveEntry, error)
}

// StreamTarget carries everything the handler needs to build an upstream URL
// to the torrent-engine. FileType lets the handler pick between /engine/stream
// (image, pdf, epub) and /engine/archive (cbz).
type StreamTarget struct {
	InfoHash  string
	FileIndex int
	FileType  domain.FileType
	MimeType  string
}

type ReaderService interface {
	// ListPages returns the pages for a torrent session, scoped to the owner.
	// When onlyFileID is a non-zero UUID, pages are materialized from that
	// file alone — useful for CBZ-per-chapter torrents where the user picks
	// one chapter at a time.
	ListPages(ctx context.Context, userID, sessionID uuid.UUID, onlyFileID uuid.UUID) ([]Page, error)

	// ResolveStreamTarget returns the session's info hash and the file's
	// index on the engine, for streaming proxy purposes. Ownership is
	// checked against userID.
	ResolveStreamTarget(ctx context.Context, userID, fileID uuid.UUID) (StreamTarget, error)
}

type readerService struct {
	sessions repository.TorrentRepository
	files    repository.TorrentFileRepository
	archive  ArchiveLister
}

func NewReaderService(
	sessions repository.TorrentRepository,
	files repository.TorrentFileRepository,
	archive ArchiveLister,
) ReaderService {
	return &readerService{sessions: sessions, files: files, archive: archive}
}

func (s *readerService) ListPages(ctx context.Context, userID, sessionID, onlyFileID uuid.UUID) ([]Page, error) {
	session, err := s.sessions.GetByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session.UserID != userID {
		return nil, domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}

	files, err := s.files.ListBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	// Sort the parent files naturally so CBZ chapters appear in order before
	// we expand their internal entries.
	sort.SliceStable(files, func(i, j int) bool {
		return naturalLess(files[i].Name, files[j].Name)
	})

	if onlyFileID != uuid.Nil {
		filtered := files[:0]
		for _, f := range files {
			if f.ID == onlyFileID {
				filtered = append(filtered, f)
			}
		}
		files = filtered
		if len(files) == 0 {
			return nil, domain.NewError(domain.ErrNotFound, "file not found in session", nil)
		}
	}

	pages := make([]Page, 0, len(files))
	for _, f := range files {
		switch f.FileType {
		case domain.FileTypeImage:
			pages = append(pages, Page{
				FileID:   f.ID,
				Name:     f.Name,
				MimeType: f.MimeType,
				Length:   f.Length,
			})
		case domain.FileTypeCBZ:
			if s.archive == nil {
				continue
			}
			entries, err := s.archive.ListArchiveEntries(ctx, session.InfoHash, f.Index)
			if err != nil {
				if errors.Is(err, ErrArchiveNotReady) {
					return nil, domain.NewError(domain.ErrUnavailable,
						"archive "+f.Name+" not ready yet, retry shortly", err)
				}
				return nil, domain.NewError(domain.ErrInternal,
					"failed to read archive "+f.Name, err)
			}
			for _, e := range entries {
				idx := e.Index
				pages = append(pages, Page{
					FileID:     f.ID,
					EntryIndex: &idx,
					Name:       e.Name,
					MimeType:   e.MimeType,
					Length:     e.Size,
				})
			}
		default:
			// pdf/epub/cbr/unknown — not materialized as Pages.
		}
	}

	for i := range pages {
		pages[i].Index = i
	}
	return pages, nil
}

func (s *readerService) ResolveStreamTarget(ctx context.Context, userID, fileID uuid.UUID) (StreamTarget, error) {
	file, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return StreamTarget{}, err
	}
	session, err := s.sessions.GetByID(ctx, file.SessionID)
	if err != nil {
		return StreamTarget{}, err
	}
	if session.UserID != userID {
		return StreamTarget{}, domain.NewError(domain.ErrNotFound, "file not found", nil)
	}
	return StreamTarget{
		InfoHash:  session.InfoHash,
		FileIndex: file.Index,
		FileType:  file.FileType,
		MimeType:  file.MimeType,
	}, nil
}

// naturalLess compares two strings with numeric chunks treated as numbers,
// so "page10.jpg" sorts after "page2.jpg". Lightweight, no allocations per
// digit run; good enough for filename ordering.
func naturalLess(a, b string) bool {
	a, b = strings.ToLower(a), strings.ToLower(b)
	i, j := 0, 0
	for i < len(a) && j < len(b) {
		if isDigit(a[i]) && isDigit(b[j]) {
			ai, aj := i, j
			for i < len(a) && isDigit(a[i]) {
				i++
			}
			for j < len(b) && isDigit(b[j]) {
				j++
			}
			na, nb := a[ai:i], b[aj:j]
			// trim leading zeros for numeric compare
			na = strings.TrimLeft(na, "0")
			nb = strings.TrimLeft(nb, "0")
			if len(na) != len(nb) {
				return len(na) < len(nb)
			}
			if na != nb {
				return na < nb
			}
			continue
		}
		if a[i] != b[j] {
			return a[i] < b[j]
		}
		i++
		j++
	}
	return len(a) < len(b)
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }
