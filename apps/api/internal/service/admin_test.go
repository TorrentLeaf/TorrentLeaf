package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

func newTestAdminSvc(t *testing.T) (AdminService, *fakeTorrentRepo, *fakeEngine, uuid.UUID) {
	t.Helper()
	repo := newFakeTorrentRepo()
	engine := &fakeEngine{}
	svc := NewAdminService(repo, engine)

	userID := uuid.New()
	_, err := repo.Create(context.Background(), domain.TorrentSession{
		UserID:    userID,
		InfoHash:  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		MagnetURI: "magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Name:      "Test Torrent",
		Status:    domain.StatusDownloading,
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return svc, repo, engine, userID
}

func TestAdminListAll(t *testing.T) {
	svc, repo, _, _ := newTestAdminSvc(t)
	ctx := context.Background()

	// Add a second session.
	_, _ = repo.Create(ctx, domain.TorrentSession{
		UserID:   uuid.New(),
		InfoHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Name:     "Second Torrent",
		Status:   domain.StatusSeeding,
	})

	sessions, err := svc.ListAllTorrents(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(sessions) != 2 {
		t.Errorf("expected 2, got %d", len(sessions))
	}
}

func TestAdminPause(t *testing.T) {
	svc, repo, engine, _ := newTestAdminSvc(t)
	ctx := context.Background()

	// Get the session id.
	all, _ := repo.ListAll(ctx)
	id := all[0].ID

	if err := svc.PauseTorrent(ctx, id); err != nil {
		t.Fatalf("pause: %v", err)
	}

	s, _ := repo.GetByID(ctx, id)
	if s.Status != domain.StatusPaused {
		t.Errorf("expected paused, got %s", s.Status)
	}
	if len(engine.removeCalls) != 1 {
		t.Errorf("expected 1 engine remove call, got %d", len(engine.removeCalls))
	}

	// Idempotent.
	if err := svc.PauseTorrent(ctx, id); err != nil {
		t.Fatalf("idempotent pause: %v", err)
	}
}

func TestAdminResume(t *testing.T) {
	svc, repo, engine, _ := newTestAdminSvc(t)
	ctx := context.Background()

	all, _ := repo.ListAll(ctx)
	id := all[0].ID

	_ = svc.PauseTorrent(ctx, id)
	if err := svc.ResumeTorrent(ctx, id); err != nil {
		t.Fatalf("resume: %v", err)
	}

	s, _ := repo.GetByID(ctx, id)
	if s.Status != domain.StatusDownloading {
		t.Errorf("expected downloading, got %s", s.Status)
	}
	if len(engine.addCalls) != 1 {
		t.Errorf("expected 1 engine add call, got %d", len(engine.addCalls))
	}
}

func TestAdminResumeNonPaused(t *testing.T) {
	svc, repo, _, _ := newTestAdminSvc(t)
	ctx := context.Background()

	all, _ := repo.ListAll(ctx)
	id := all[0].ID

	err := svc.ResumeTorrent(ctx, id)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestAdminDelete(t *testing.T) {
	svc, repo, engine, _ := newTestAdminSvc(t)
	ctx := context.Background()

	all, _ := repo.ListAll(ctx)
	id := all[0].ID

	if err := svc.DeleteTorrent(ctx, id); err != nil {
		t.Fatalf("delete: %v", err)
	}

	remaining, _ := repo.ListAll(ctx)
	if len(remaining) != 0 {
		t.Errorf("expected 0, got %d", len(remaining))
	}
	if len(engine.removeCalls) != 1 {
		t.Errorf("expected engine remove call")
	}
}
