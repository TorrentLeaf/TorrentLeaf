package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type TorrentService interface {
	Add(ctx context.Context, userID uuid.UUID, magnetURI string) (*domain.TorrentSession, error)
	List(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error)
	Get(ctx context.Context, id uuid.UUID) (*domain.TorrentSession, error)
	Delete(ctx context.Context, id uuid.UUID) error
	SetPriority(ctx context.Context, id uuid.UUID, fileIndex, priority int) error
}
