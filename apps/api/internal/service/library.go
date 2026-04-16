package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/repository"
)

// LibraryCard is the read-model returned by List. It flattens the enriched
// repository row into the shape that handlers serialize straight to JSON.
type LibraryCard struct {
	ID            uuid.UUID
	SessionID     uuid.UUID
	Title         string
	CoverURL      string
	Type          domain.LibraryItemType
	AddedAt       time.Time
	IsFavorite    bool
	CurrentPage   int
	TotalPages    int
	LastReadAt    *time.Time
}

// ListFilter mirrors repository.LibraryListFilter but lives at the service
// layer so handlers don't import the repository package.
type ListFilter struct {
	Type          domain.LibraryItemType
	FavoritesOnly bool
}

type LibraryService interface {
	List(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]LibraryCard, error)
	Add(ctx context.Context, userID, sessionID uuid.UUID, itemType domain.LibraryItemType, title string) (*domain.LibraryItem, error)
	Remove(ctx context.Context, userID, id uuid.UUID) error
	SetFavorite(ctx context.Context, userID, id uuid.UUID, favorite bool) error
}

type libraryService struct {
	library   repository.LibraryRepository
	favorites repository.FavoritesRepository
	sessions  repository.TorrentRepository
}

func NewLibraryService(
	lib repository.LibraryRepository,
	fav repository.FavoritesRepository,
	sessions repository.TorrentRepository,
) LibraryService {
	return &libraryService{library: lib, favorites: fav, sessions: sessions}
}

func (s *libraryService) List(ctx context.Context, userID uuid.UUID, filter ListFilter) ([]LibraryCard, error) {
	if filter.Type != "" && !validLibraryType(filter.Type) {
		return nil, domain.NewError(domain.ErrInvalidInput, "invalid type filter", nil)
	}

	rows, err := s.library.ListByUser(ctx, userID, repository.LibraryListFilter{
		Type:          filter.Type,
		FavoritesOnly: filter.FavoritesOnly,
	})
	if err != nil {
		return nil, err
	}

	out := make([]LibraryCard, 0, len(rows))
	for _, r := range rows {
		card := LibraryCard{
			ID:         r.Item.ID,
			SessionID:  r.Item.SessionID,
			Title:      r.Item.Title,
			CoverURL:   r.Item.CoverURL,
			Type:       r.Item.Type,
			AddedAt:    r.Item.AddedAt,
			IsFavorite: r.IsFavorite,
			LastReadAt: r.LastReadAt,
		}
		if r.LastReadPage != nil {
			card.CurrentPage = *r.LastReadPage
		}
		if r.LastReadTotal != nil {
			card.TotalPages = *r.LastReadTotal
		}
		out = append(out, card)
	}
	return out, nil
}

// Add enrolls a torrent session into the user's library. `itemType` defaults
// to "other" when empty. Title defaults to the session name. Ownership of the
// session is enforced (users cannot shelf torrents they did not add).
func (s *libraryService) Add(
	ctx context.Context,
	userID, sessionID uuid.UUID,
	itemType domain.LibraryItemType,
	title string,
) (*domain.LibraryItem, error) {
	if itemType == "" {
		itemType = domain.LibraryTypeOther
	}
	if !validLibraryType(itemType) {
		return nil, domain.NewError(domain.ErrInvalidInput, "invalid library type", nil)
	}

	session, err := s.sessions.GetByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session.UserID != userID {
		return nil, domain.NewError(domain.ErrNotFound, "session not found", nil)
	}

	title = strings.TrimSpace(title)
	if title == "" {
		title = session.Name
	}
	if title == "" {
		title = session.InfoHash
	}

	return s.library.Create(ctx, domain.LibraryItem{
		UserID:    userID,
		SessionID: sessionID,
		Title:     title,
		Type:      itemType,
	})
}

// Remove deletes the library row if owned by the user. Favorites row, if any,
// cascades via FK.
func (s *libraryService) Remove(ctx context.Context, userID, id uuid.UUID) error {
	item, err := s.library.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if item.UserID != userID {
		return domain.NewError(domain.ErrNotFound, "library item not found", nil)
	}
	return s.library.Delete(ctx, id)
}

// SetFavorite toggles the favorite flag by upserting/deleting in the
// favorites table scoped to the session of this library item.
func (s *libraryService) SetFavorite(ctx context.Context, userID, id uuid.UUID, favorite bool) error {
	item, err := s.library.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if item.UserID != userID {
		return domain.NewError(domain.ErrNotFound, "library item not found", nil)
	}
	if favorite {
		return s.favorites.Add(ctx, userID, item.SessionID)
	}
	return s.favorites.Remove(ctx, userID, item.SessionID)
}

func validLibraryType(t domain.LibraryItemType) bool {
	switch t {
	case domain.LibraryTypeManga,
		domain.LibraryTypeBook,
		domain.LibraryTypeDocument,
		domain.LibraryTypeOther:
		return true
	}
	return false
}

