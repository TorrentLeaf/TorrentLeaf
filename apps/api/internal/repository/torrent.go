package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type TorrentRepository interface {
	Create(ctx context.Context, session domain.TorrentSession) (*domain.TorrentSession, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TorrentSession, error)
	GetByInfoHash(ctx context.Context, infoHash string) (*domain.TorrentSession, error)
	ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.TorrentStatus) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type TorrentFileRepository interface {
	CreateBatch(ctx context.Context, files []domain.TorrentFile) error
	ListBySession(ctx context.Context, sessionID uuid.UUID) ([]domain.TorrentFile, error)
	UpdatePriority(ctx context.Context, id uuid.UUID, priority int) error
}
