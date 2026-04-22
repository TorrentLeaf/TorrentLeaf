package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

// fakeProgressRepo is an in-memory ProgressRepository for unit tests.
type fakeProgressRepo struct {
	mu      sync.Mutex
	entries map[progressKey]*domain.ReadingProgress
}

type progressKey struct{ user, file uuid.UUID }

func newFakeProgressRepo() *fakeProgressRepo {
	return &fakeProgressRepo{entries: map[progressKey]*domain.ReadingProgress{}}
}

func (r *fakeProgressRepo) Upsert(_ context.Context, p domain.ReadingProgress) (*domain.ReadingProgress, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := progressKey{p.UserID, p.FileID}
	existing, ok := r.entries[key]
	if !ok {
		p.ID = uuid.New()
	} else {
		p.ID = existing.ID
		if p.TotalPages == 0 {
			p.TotalPages = existing.TotalPages
		}
	}
	p.LastReadAt = time.Now()
	cp := p
	r.entries[key] = &cp
	return &cp, nil
}

func (r *fakeProgressRepo) Get(_ context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.entries[progressKey{userID, fileID}]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	return p, nil
}

func newTestProgressSvc(t *testing.T) (ProgressService, *fakeFileRepo, *fakeTorrentRepo, uuid.UUID, uuid.UUID) {
	t.Helper()
	files := newFakeFileRepo()
	sessions := newFakeTorrentRepo()
	svc := NewProgressService(newFakeProgressRepo(), files, sessions)

	userID := uuid.New()
	session, err := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   userID,
		InfoHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	fileID := uuid.New()
	if err := files.CreateBatch(context.Background(), []domain.TorrentFile{{
		ID:        fileID,
		SessionID: session.ID,
		Index:     0,
		Name:      "page-001.jpg",
		FileType:  domain.FileTypeImage,
	}}); err != nil {
		t.Fatalf("create file: %v", err)
	}
	return svc, files, sessions, userID, fileID
}

func TestProgressUpdateUpsertsAndValidates(t *testing.T) {
	svc, _, _, userID, fileID := newTestProgressSvc(t)
	ctx := context.Background()

	p, err := svc.Update(ctx, userID, fileID, UpdateProgress{CurrentPage: 5, TotalPages: 30, Mode: domain.ReadingModeWebtoon})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if p.CurrentPage != 5 || p.TotalPages != 30 || p.ReadingMode != domain.ReadingModeWebtoon {
		t.Errorf("upsert wrote wrong values: %+v", p)
	}

	// Idempotent update: next call overwrites currentPage, keeps totalPages.
	p2, err := svc.Update(ctx, userID, fileID, UpdateProgress{CurrentPage: 6, Mode: domain.ReadingModeWebtoon})
	if err != nil {
		t.Fatalf("second update: %v", err)
	}
	if p2.CurrentPage != 6 {
		t.Errorf("expected currentPage=6, got %d", p2.CurrentPage)
	}
	if p2.TotalPages != 30 {
		t.Errorf("expected totalPages preserved at 30, got %d", p2.TotalPages)
	}
}

func TestProgressUpdateRejectsInvalidInput(t *testing.T) {
	svc, _, _, userID, fileID := newTestProgressSvc(t)
	ctx := context.Background()

	cases := []struct {
		name                 string
		page, total          int
		mode                 domain.ReadingMode
	}{
		{"negative page", -1, 10, domain.ReadingModePaginated},
		{"page beyond total", 15, 10, domain.ReadingModePaginated},
		{"unknown mode", 0, 10, domain.ReadingMode("sideways")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := svc.Update(ctx, userID, fileID, UpdateProgress{CurrentPage: c.page, TotalPages: c.total, Mode: c.mode})
			var de *domain.Error
			if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
				t.Fatalf("expected ErrInvalidInput, got %v", err)
			}
		})
	}
}

func TestProgressEnforcesOwnership(t *testing.T) {
	svc, _, _, _, fileID := newTestProgressSvc(t)
	ctx := context.Background()
	stranger := uuid.New()

	_, err := svc.Update(ctx, stranger, fileID, UpdateProgress{CurrentPage: 0, TotalPages: 10, Mode: domain.ReadingModePaginated})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("stranger should get ErrNotFound, got %v", err)
	}
}

func TestProgressGetReturnsSavedRow(t *testing.T) {
	svc, _, _, userID, fileID := newTestProgressSvc(t)
	ctx := context.Background()

	if _, err := svc.Update(ctx, userID, fileID, UpdateProgress{CurrentPage: 3, TotalPages: 10, Mode: domain.ReadingModePaginated}); err != nil {
		t.Fatalf("seed update: %v", err)
	}

	got, err := svc.Get(ctx, userID, fileID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.CurrentPage != 3 || got.TotalPages != 10 {
		t.Errorf("unexpected row: %+v", got)
	}
}

func TestProgressGetEnforcesOwnership(t *testing.T) {
	svc, _, _, userID, fileID := newTestProgressSvc(t)
	ctx := context.Background()
	if _, err := svc.Update(ctx, userID, fileID, UpdateProgress{CurrentPage: 1, TotalPages: 10}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	_, err := svc.Get(ctx, uuid.New(), fileID)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("stranger should get ErrNotFound, got %v", err)
	}
}

func TestProgressGetMissingFile(t *testing.T) {
	svc, _, _, userID, _ := newTestProgressSvc(t)
	_, err := svc.Get(context.Background(), userID, uuid.New())
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestProgressDefaultMode(t *testing.T) {
	svc, _, _, userID, fileID := newTestProgressSvc(t)
	ctx := context.Background()
	p, err := svc.Update(ctx, userID, fileID, UpdateProgress{TotalPages: 10})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if p.ReadingMode != domain.ReadingModePaginated {
		t.Errorf("expected default paginated, got %s", p.ReadingMode)
	}
}
