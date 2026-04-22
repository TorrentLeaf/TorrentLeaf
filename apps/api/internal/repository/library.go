package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

// LibraryListFilter narrows down ListByUser results. Zero value ("any type",
// FavoritesOnly=false) returns every item owned by the user.
type LibraryListFilter struct {
	Type          domain.LibraryItemType // empty = any
	FavoritesOnly bool
}

// LibraryItemWithMeta enriches a library item with per-user derived state
// (favorite flag + last-read progress) so the list endpoint can render cards
// in a single query.
type LibraryItemWithMeta struct {
	Item          domain.LibraryItem
	IsFavorite    bool
	LastReadPage  *int
	LastReadTotal *int
	LastReadAt    *time.Time
}

type LibraryRepository interface {
	Create(ctx context.Context, item domain.LibraryItem) (*domain.LibraryItem, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.LibraryItem, error)
	ListByUser(ctx context.Context, userID uuid.UUID, filter LibraryListFilter) ([]LibraryItemWithMeta, error)
	Delete(ctx context.Context, id uuid.UUID) error
	// UpdateTitleBySession refreshes the display title for every library row
	// pointing at this session. Used when metadata arrives and we finally know
	// the torrent's real name (initial inserts use the infoHash as placeholder).
	UpdateTitleBySession(ctx context.Context, sessionID uuid.UUID, title string) error
}

type FavoritesRepository interface {
	Add(ctx context.Context, userID, sessionID uuid.UUID) error
	Remove(ctx context.Context, userID, sessionID uuid.UUID) error
}
