package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

// UpdateProgress groups the fields a caller can send when updating reading
// progress. EPUB callers set Location (a CFI); image/pdf callers set the
// numeric CurrentPage. Leaving Location empty preserves any previously
// stored value, so a paginated update won't wipe a CFI from an EPUB session.
type UpdateProgress struct {
	CurrentPage int
	TotalPages  int
	Mode        domain.ReadingMode
	Location    string
}

type ProgressService interface {
	Get(ctx context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error)
	Update(ctx context.Context, userID, fileID uuid.UUID, in UpdateProgress) (*domain.ReadingProgress, error)
}

type progressService struct {
	progress repository.ProgressRepository
	files    repository.TorrentFileRepository
	sessions repository.TorrentRepository
}

func NewProgressService(
	progress repository.ProgressRepository,
	files repository.TorrentFileRepository,
	sessions repository.TorrentRepository,
) ProgressService {
	return &progressService{progress: progress, files: files, sessions: sessions}
}

func (s *progressService) Get(ctx context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error) {
	if err := s.checkOwnership(ctx, userID, fileID); err != nil {
		return nil, err
	}
	return s.progress.Get(ctx, userID, fileID)
}

func (s *progressService) Update(
	ctx context.Context,
	userID, fileID uuid.UUID,
	in UpdateProgress,
) (*domain.ReadingProgress, error) {
	if in.CurrentPage < 0 {
		return nil, domain.NewError(domain.ErrInvalidInput, "currentPage must be non-negative", nil)
	}
	if in.TotalPages > 0 && in.CurrentPage > in.TotalPages {
		return nil, domain.NewError(domain.ErrInvalidInput, "currentPage cannot exceed totalPages", nil)
	}
	switch in.Mode {
	case "", domain.ReadingModePaginated, domain.ReadingModeWebtoon, domain.ReadingModeDoublePage:
	default:
		return nil, domain.NewError(domain.ErrInvalidInput, "invalid reading mode", nil)
	}
	if in.Mode == "" {
		in.Mode = domain.ReadingModePaginated
	}
	if err := s.checkOwnership(ctx, userID, fileID); err != nil {
		return nil, err
	}
	if file, err := s.files.GetByID(ctx, fileID); err == nil {
		_ = s.sessions.Touch(ctx, file.SessionID)
	}
	return s.progress.Upsert(ctx, domain.ReadingProgress{
		UserID:      userID,
		FileID:      fileID,
		CurrentPage: in.CurrentPage,
		TotalPages:  in.TotalPages,
		ReadingMode: in.Mode,
		Location:    in.Location,
	})
}

// checkOwnership verifies that the file belongs to a session owned by userID.
// Returns ErrNotFound (not ErrForbidden) to avoid leaking existence.
func (s *progressService) checkOwnership(ctx context.Context, userID, fileID uuid.UUID) error {
	file, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return err
	}
	session, err := s.sessions.GetByID(ctx, file.SessionID)
	if err != nil {
		return err
	}
	if session.UserID != userID {
		return domain.NewError(domain.ErrNotFound, "file not found", nil)
	}
	return nil
}
