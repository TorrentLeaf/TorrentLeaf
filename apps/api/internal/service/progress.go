package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/repository"
)

type ProgressService interface {
	Get(ctx context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error)
	Update(ctx context.Context, userID, fileID uuid.UUID, currentPage, totalPages int, mode domain.ReadingMode) (*domain.ReadingProgress, error)
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
	currentPage, totalPages int,
	mode domain.ReadingMode,
) (*domain.ReadingProgress, error) {
	if currentPage < 0 {
		return nil, domain.NewError(domain.ErrInvalidInput, "currentPage must be non-negative", nil)
	}
	if totalPages > 0 && currentPage > totalPages {
		return nil, domain.NewError(domain.ErrInvalidInput, "currentPage cannot exceed totalPages", nil)
	}
	switch mode {
	case "", domain.ReadingModePaginated, domain.ReadingModeWebtoon, domain.ReadingModeDoublePage:
	default:
		return nil, domain.NewError(domain.ErrInvalidInput, "invalid reading mode", nil)
	}
	if mode == "" {
		mode = domain.ReadingModePaginated
	}
	if err := s.checkOwnership(ctx, userID, fileID); err != nil {
		return nil, err
	}
	return s.progress.Upsert(ctx, domain.ReadingProgress{
		UserID:      userID,
		FileID:      fileID,
		CurrentPage: currentPage,
		TotalPages:  totalPages,
		ReadingMode: mode,
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
