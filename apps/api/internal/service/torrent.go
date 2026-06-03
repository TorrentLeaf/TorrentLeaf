package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type TorrentService interface {
	Add(ctx context.Context, userID uuid.UUID, magnetURI string) (*domain.TorrentSession, error)
	List(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error)
	Get(ctx context.Context, userID, id uuid.UUID) (*domain.TorrentSession, error)
	Delete(ctx context.Context, userID, id uuid.UUID) error
	SetPriority(ctx context.Context, userID, id uuid.UUID, fileIndex, priority int) error

	// ApplyMetadata is called by the engine metadata webhook once the swarm
	// has yielded the file list. It persists the files and transitions the
	// session from fetching_metadata → downloading.
	ApplyMetadata(ctx context.Context, infoHash, name string, totalSize int64, files []MetadataFile) error

	// ReseedEngine re-adds all active torrent sessions (downloading/seeding)
	// to the engine. Called at API startup so that readers and streaming
	// continue to work after an engine restart.
	ReseedEngine(ctx context.Context) error
}

type MetadataFile struct {
	Index    int
	Name     string
	Path     string
	Length   int64
	MimeType string
	FileType string
}
