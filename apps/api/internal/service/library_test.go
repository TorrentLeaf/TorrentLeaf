package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

// ─── fake library repo ──────────────────────────────────────────────────────

type fakeLibraryRepo struct {
	mu    sync.Mutex
	items map[uuid.UUID]*domain.LibraryItem
}

func newFakeLibraryRepo() *fakeLibraryRepo {
	return &fakeLibraryRepo{items: make(map[uuid.UUID]*domain.LibraryItem)}
}

func (r *fakeLibraryRepo) Create(_ context.Context, item domain.LibraryItem) (*domain.LibraryItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.items {
		if existing.UserID == item.UserID && existing.SessionID == item.SessionID {
			return nil, domain.NewError(domain.ErrConflict, "already in library", nil)
		}
	}
	item.ID = uuid.New()
	item.AddedAt = time.Now()
	cp := item
	r.items[item.ID] = &cp
	return &cp, nil
}

func (r *fakeLibraryRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.LibraryItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item, ok := r.items[id]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	cp := *item
	return &cp, nil
}

func (r *fakeLibraryRepo) ListByUser(_ context.Context, userID uuid.UUID, filter repository.LibraryListFilter) ([]repository.LibraryItemWithMeta, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []repository.LibraryItemWithMeta
	for _, item := range r.items {
		if item.UserID != userID {
			continue
		}
		if filter.Type != "" && item.Type != filter.Type {
			continue
		}
		out = append(out, repository.LibraryItemWithMeta{Item: *item})
	}
	return out, nil
}

func (r *fakeLibraryRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.items[id]; !ok {
		return domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	delete(r.items, id)
	return nil
}

func (r *fakeLibraryRepo) UpdateTitleBySession(_ context.Context, sessionID uuid.UUID, title string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, item := range r.items {
		if item.SessionID == sessionID {
			item.Title = title
		}
	}
	return nil
}

func (r *fakeLibraryRepo) UpdateTypeBySession(_ context.Context, sessionID uuid.UUID, itemType domain.LibraryItemType) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, item := range r.items {
		if item.SessionID == sessionID {
			item.Type = itemType
		}
	}
	return nil
}

// ─── fake favorites repo ────────────────────────────────────────────────────

type fakeFavoritesRepo struct {
	mu    sync.Mutex
	favs  map[[2]uuid.UUID]bool
}

func newFakeFavoritesRepo() *fakeFavoritesRepo {
	return &fakeFavoritesRepo{favs: make(map[[2]uuid.UUID]bool)}
}

func (r *fakeFavoritesRepo) Add(_ context.Context, userID, sessionID uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.favs[[2]uuid.UUID{userID, sessionID}] = true
	return nil
}

func (r *fakeFavoritesRepo) Remove(_ context.Context, userID, sessionID uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.favs, [2]uuid.UUID{userID, sessionID})
	return nil
}

func (r *fakeFavoritesRepo) Has(userID, sessionID uuid.UUID) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.favs[[2]uuid.UUID{userID, sessionID}]
}

// ─── helpers ────────────────────────────────────────────────────────────────

func newTestLibrarySvc(t *testing.T) (LibraryService, *fakeLibraryRepo, *fakeFavoritesRepo, *fakeTorrentRepo, uuid.UUID, uuid.UUID) {
	t.Helper()
	libRepo := newFakeLibraryRepo()
	favRepo := newFakeFavoritesRepo()
	sessRepo := newFakeTorrentRepo()
	svc := NewLibraryService(libRepo, favRepo, sessRepo)

	userID := uuid.New()
	session, err := sessRepo.Create(context.Background(), domain.TorrentSession{
		UserID:   userID,
		InfoHash: "dddddddddddddddddddddddddddddddddddddddd",
		Name:     "Cool Manga Vol 1",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return svc, libRepo, favRepo, sessRepo, userID, session.ID
}

// ─── tests ──────────────────────────────────────────────────────────────────

func TestLibraryAddAndList(t *testing.T) {
	svc, _, _, _, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	item, err := svc.Add(ctx, userID, sessionID, domain.LibraryTypeManga, "")
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if item.Title != "Cool Manga Vol 1" {
		t.Errorf("title should default to session name, got %s", item.Title)
	}
	if item.Type != domain.LibraryTypeManga {
		t.Errorf("expected manga, got %s", item.Type)
	}

	cards, err := svc.List(ctx, userID, ListFilter{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(cards) != 1 {
		t.Fatalf("expected 1 card, got %d", len(cards))
	}
	if cards[0].Title != "Cool Manga Vol 1" {
		t.Errorf("card title: %s", cards[0].Title)
	}
}

func TestLibraryAddDuplicate(t *testing.T) {
	svc, _, _, _, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	_, err := svc.Add(ctx, userID, sessionID, "", "")
	if err != nil {
		t.Fatalf("first add: %v", err)
	}
	_, err = svc.Add(ctx, userID, sessionID, "", "")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrConflict {
		t.Fatalf("expected ErrConflict, got %v", err)
	}
}

func TestLibraryAddEnforcesOwnership(t *testing.T) {
	svc, _, _, _, _, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()
	stranger := uuid.New()

	_, err := svc.Add(ctx, stranger, sessionID, "", "")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestLibraryTypeFilter(t *testing.T) {
	svc, _, _, sessRepo, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	_, err := svc.Add(ctx, userID, sessionID, domain.LibraryTypeManga, "")
	if err != nil {
		t.Fatalf("add manga: %v", err)
	}

	// Add a second session as "document".
	s2, err := sessRepo.Create(ctx, domain.TorrentSession{
		UserID:   userID,
		InfoHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		Name:     "Tech Paper",
	})
	if err != nil {
		t.Fatalf("create s2: %v", err)
	}
	_, err = svc.Add(ctx, userID, s2.ID, domain.LibraryTypeDocument, "")
	if err != nil {
		t.Fatalf("add document: %v", err)
	}

	manga, err := svc.List(ctx, userID, ListFilter{Type: domain.LibraryTypeManga})
	if err != nil {
		t.Fatalf("list manga: %v", err)
	}
	if len(manga) != 1 {
		t.Errorf("expected 1 manga, got %d", len(manga))
	}

	all, err := svc.List(ctx, userID, ListFilter{})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 items, got %d", len(all))
	}
}

func TestLibraryRemove(t *testing.T) {
	svc, _, _, _, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	item, _ := svc.Add(ctx, userID, sessionID, "", "")
	if err := svc.Remove(ctx, userID, item.ID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	cards, _ := svc.List(ctx, userID, ListFilter{})
	if len(cards) != 0 {
		t.Errorf("library should be empty")
	}
}

func TestLibraryRemoveByStranger(t *testing.T) {
	svc, _, _, _, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	item, _ := svc.Add(ctx, userID, sessionID, "", "")
	err := svc.Remove(ctx, uuid.New(), item.ID)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestLibraryFavorite(t *testing.T) {
	svc, _, favRepo, _, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	item, _ := svc.Add(ctx, userID, sessionID, "", "")
	if err := svc.SetFavorite(ctx, userID, item.ID, true); err != nil {
		t.Fatalf("set favorite: %v", err)
	}
	if !favRepo.Has(userID, sessionID) {
		t.Error("expected favorite to be added")
	}

	if err := svc.SetFavorite(ctx, userID, item.ID, false); err != nil {
		t.Fatalf("unset favorite: %v", err)
	}
	if favRepo.Has(userID, sessionID) {
		t.Error("expected favorite to be removed")
	}
}

func TestLibraryInvalidType(t *testing.T) {
	svc, _, _, _, userID, sessionID := newTestLibrarySvc(t)
	ctx := context.Background()

	_, err := svc.Add(ctx, userID, sessionID, domain.LibraryItemType("invalid"), "")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestFormatFromFileType(t *testing.T) {
	cases := map[string]string{
		"image": "comics", "cbz": "comics", "cbr": "comics",
		"epub":    "books",
		"pdf":     "pdfs",
		"video":   "video",
		"unknown": "other", "": "other", "weird": "other",
	}
	for in, want := range cases {
		if got := formatFromFileType(in); got != want {
			t.Fatalf("formatFromFileType(%q) = %q, want %q", in, got, want)
		}
	}
}
