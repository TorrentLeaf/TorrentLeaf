package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type TorrentRepository interface {
	Create(ctx context.Context, session domain.TorrentSession) (*domain.TorrentSession, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TorrentSession, error)
	GetByInfoHash(ctx context.Context, infoHash string) (*domain.TorrentSession, error)
	GetByUserAndInfoHash(ctx context.Context, userID uuid.UUID, infoHash string) (*domain.TorrentSession, error)
	ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error)
	ListAll(ctx context.Context) ([]domain.TorrentSession, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.TorrentStatus) error
	UpdateMetadata(ctx context.Context, infoHash, name string, totalSize int64) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type TorrentFileRepository interface {
	CreateBatch(ctx context.Context, files []domain.TorrentFile) error
	ListBySession(ctx context.Context, sessionID uuid.UUID) ([]domain.TorrentFile, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.TorrentFile, error)
	UpdatePriority(ctx context.Context, id uuid.UUID, priority int) error
}
