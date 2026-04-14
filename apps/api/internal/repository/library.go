package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type LibraryRepository interface {
	Create(ctx context.Context, item domain.LibraryItem) (*domain.LibraryItem, error)
	ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.LibraryItem, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type ReadingProgressRepository interface {
	Get(ctx context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error)
	Upsert(ctx context.Context, progress domain.ReadingProgress) error
}
