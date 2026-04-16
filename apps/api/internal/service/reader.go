package service

import (
	"context"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/repository"
)

// Page is a single readable page within a manga/comic session.
//
// For an image-set torrent (typical manga release: one image per chapter page)
// each image file in the session becomes one Page. For archive/pdf files we
// would expand the internal pages — that is out of scope for now and callers
// will get an empty list.
type Page struct {
	Index    int       `json:"index"`
	FileID   uuid.UUID `json:"fileId"`
	Name     string    `json:"name"`
	MimeType string    `json:"mimeType"`
	Length   int64     `json:"length"`
}

type ReaderService interface {
	// ListPages returns the pages for a torrent session, scoped to the owner.
	ListPages(ctx context.Context, userID, sessionID uuid.UUID) ([]Page, error)

	// ResolveStreamTarget returns the session's info hash and the file's
	// index on the engine, for streaming proxy purposes. Ownership is
	// checked against userID.
	ResolveStreamTarget(ctx context.Context, userID, fileID uuid.UUID) (infoHash string, fileIndex int, mimeType string, err error)
}

type readerService struct {
	sessions repository.TorrentRepository
	files    repository.TorrentFileRepository
}

func NewReaderService(sessions repository.TorrentRepository, files repository.TorrentFileRepository) ReaderService {
	return &readerService{sessions: sessions, files: files}
}

func (s *readerService) ListPages(ctx context.Context, userID, sessionID uuid.UUID) ([]Page, error) {
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

	pages := make([]Page, 0, len(files))
	for _, f := range files {
		if f.FileType != domain.FileTypeImage {
			continue
		}
		pages = append(pages, Page{
			FileID:   f.ID,
			Name:     f.Name,
			MimeType: f.MimeType,
			Length:   f.Length,
		})
	}

	// Sort image pages by their natural filename order so chapter 001, 002…
	// stays in order even if the torrent happens to have mixed indices.
	sort.SliceStable(pages, func(i, j int) bool {
		return naturalLess(pages[i].Name, pages[j].Name)
	})
	for i := range pages {
		pages[i].Index = i
	}
	return pages, nil
}

func (s *readerService) ResolveStreamTarget(ctx context.Context, userID, fileID uuid.UUID) (string, int, string, error) {
	file, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return "", 0, "", err
	}
	session, err := s.sessions.GetByID(ctx, file.SessionID)
	if err != nil {
		return "", 0, "", err
	}
	if session.UserID != userID {
		return "", 0, "", domain.NewError(domain.ErrNotFound, "file not found", nil)
	}
	return session.InfoHash, file.Index, file.MimeType, nil
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
