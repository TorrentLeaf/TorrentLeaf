package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type ProgressRepository interface {
	Upsert(ctx context.Context, p domain.ReadingProgress) (*domain.ReadingProgress, error)
	Get(ctx context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error)
}
