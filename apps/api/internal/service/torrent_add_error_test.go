package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

func TestAdd_DiskFull_MapsToInsufficientStorage(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	e.addErr = &EngineAddError{
		Code:    "insufficient_disk",
		Message: "not enough free disk space (2.5 GB free, minimum 5 GB)",
	}

	_, err := svc.Add(context.Background(), uuid.New(), validMagnet)

	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want domain.Error, got %T: %v", err, err)
	}
	if de.Code != domain.ErrInsufficientStorage {
		t.Fatalf("want ErrInsufficientStorage, got %s", de.Code)
	}
	if de.Message != e.addErr.(*EngineAddError).Message {
		t.Fatalf("want the real disk message surfaced, got %q", de.Message)
	}
	// The rolled-back session must not linger.
	if all, _ := sr.ListAll(context.Background()); len(all) != 0 {
		t.Fatalf("session should have been rolled back, found %d", len(all))
	}
}

func TestAdd_InvalidMagnetFromEngine_MapsToInvalidInput(t *testing.T) {
	svc, _, _, e := newTestTorrentSvc()
	e.addErr = &EngineAddError{Code: "invalid_magnet", Message: "invalid magnet uri"}

	_, err := svc.Add(context.Background(), uuid.New(), validMagnet)

	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("want ErrInvalidInput, got %v", err)
	}
}

func TestReseedEngine_ReportsPerTorrentReason(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	ctx := context.Background()
	if _, err := sr.Create(ctx, domain.TorrentSession{
		UserID:    uuid.New(),
		InfoHash:  "0123456789abcdef0123456789abcdef01234567",
		MagnetURI: validMagnet,
		Status:    domain.StatusSeeding,
	}); err != nil {
		t.Fatal(err)
	}
	e.addErr = &EngineAddError{Code: "insufficient_disk", Message: "disk full"}

	err := svc.ReseedEngine(ctx)
	if err == nil {
		t.Fatal("want an aggregate error when a reseed fails")
	}
	if !strings.Contains(err.Error(), "0123456789abcdef0123456789abcdef01234567") ||
		!strings.Contains(err.Error(), "insufficient_disk") {
		t.Fatalf("reseed error should name the torrent + reason, got %q", err.Error())
	}
}

func TestReseedEngineWithRetry_WaitsForHealth(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	ts := svc.(*torrentService)
	ts.sleepFn = func(time.Duration) {} // no real waiting
	e.healthErrs = []error{errors.New("down"), errors.New("down")} // healthy on 3rd

	ctx := context.Background()
	if _, err := sr.Create(ctx, domain.TorrentSession{
		UserID:    uuid.New(),
		InfoHash:  "0123456789abcdef0123456789abcdef01234567",
		MagnetURI: validMagnet,
		Status:    domain.StatusSeeding,
	}); err != nil {
		t.Fatal(err)
	}

	if err := ts.ReseedEngineWithRetry(ctx); err != nil {
		t.Fatalf("want success once healthy, got %v", err)
	}
	if e.healthCalls != 3 {
		t.Fatalf("want 3 health checks, got %d", e.healthCalls)
	}
	if len(e.addReseeds) != 1 || !e.addReseeds[0] {
		t.Fatalf("want one reseed add after becoming healthy, got %v", e.addReseeds)
	}
}

func TestReseedEngine_MarksAddsAsReseed(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	ctx := context.Background()
	if _, err := sr.Create(ctx, domain.TorrentSession{
		UserID:    uuid.New(),
		InfoHash:  "0123456789abcdef0123456789abcdef01234567",
		MagnetURI: validMagnet,
		Status:    domain.StatusSeeding,
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.ReseedEngine(ctx); err != nil {
		t.Fatalf("reseed: %v", err)
	}
	if len(e.addReseeds) != 1 || !e.addReseeds[0] {
		t.Fatalf("reseed should call engine.Add with reseed=true, got %v", e.addReseeds)
	}
}

func TestEvictStale_EvictsAndFreesDiskOnLastReference(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	e.removeDestroy = map[string]bool{}
	ctx := context.Background()
	old, _ := sr.Create(ctx, domain.TorrentSession{
		UserID: uuid.New(), InfoHash: "stalehash", MagnetURI: validMagnet, Status: domain.StatusSeeding,
	})
	// Force it stale.
	old.LastTouchedAt = time.Now().Add(-100 * time.Hour)
	sr.sessions[old.ID] = old

	n, err := svc.EvictStale(ctx, 72*time.Hour)
	if err != nil {
		t.Fatalf("EvictStale: %v", err)
	}
	if n != 1 {
		t.Fatalf("want 1 evicted, got %d", n)
	}
	if !e.removeDestroy["stalehash"] {
		t.Fatal("last reference should destroy the store")
	}
	if got := sr.sessions[old.ID].Status; got != domain.StatusEvicted {
		t.Fatalf("want status evicted, got %s", got)
	}
}

// Two users share one info_hash and both go stale in the same pass. The engine
// removal must happen exactly once and carry destroyStore=true — the old
// per-session loop issued a destroyStore=false remove first (taking the torrent
// out of the engine) then a destroyStore=true remove that no-op'd, leaking the
// files. Both sessions must end up evicted.
func TestEvictStale_SharedHash_SingleDestroyingRemove(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	e.removeDestroy = map[string]bool{}
	ctx := context.Background()

	var ids []uuid.UUID
	for i := 0; i < 2; i++ {
		s, _ := sr.Create(ctx, domain.TorrentSession{
			UserID: uuid.New(), InfoHash: "sharedhash", MagnetURI: validMagnet, Status: domain.StatusSeeding,
		})
		s.LastTouchedAt = time.Now().Add(-100 * time.Hour)
		sr.sessions[s.ID] = s
		ids = append(ids, s.ID)
	}

	n, err := svc.EvictStale(ctx, 72*time.Hour)
	if err != nil {
		t.Fatalf("EvictStale: %v", err)
	}
	if n != 2 {
		t.Fatalf("want 2 evicted, got %d", n)
	}
	if len(e.removeCalls) != 1 {
		t.Fatalf("shared hash must be removed exactly once, got %d calls: %v", len(e.removeCalls), e.removeCalls)
	}
	if !e.removeDestroy["sharedhash"] {
		t.Fatal("last-reference removal must destroy the store")
	}
	for _, id := range ids {
		if got := sr.sessions[id].Status; got != domain.StatusEvicted {
			t.Fatalf("session %s: want evicted, got %s", id, got)
		}
	}
}

// A session outside the stale set still references the hash → files must be
// kept (destroyStore=false); only the stale session is evicted.
func TestEvictStale_SharedHash_KeepsFilesWhenOutsideReferenceActive(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	e.removeDestroy = map[string]bool{}
	ctx := context.Background()

	stale, _ := sr.Create(ctx, domain.TorrentSession{
		UserID: uuid.New(), InfoHash: "sharedhash", MagnetURI: validMagnet, Status: domain.StatusSeeding,
	})
	stale.LastTouchedAt = time.Now().Add(-100 * time.Hour)
	sr.sessions[stale.ID] = stale

	active, _ := sr.Create(ctx, domain.TorrentSession{
		UserID: uuid.New(), InfoHash: "sharedhash", MagnetURI: validMagnet, Status: domain.StatusDownloading,
	})
	active.LastTouchedAt = time.Now() // fresh → not stale
	sr.sessions[active.ID] = active

	n, err := svc.EvictStale(ctx, 72*time.Hour)
	if err != nil {
		t.Fatalf("EvictStale: %v", err)
	}
	if n != 1 {
		t.Fatalf("want 1 evicted, got %d", n)
	}
	if e.removeDestroy["sharedhash"] {
		t.Fatal("outside reference still active — files must NOT be destroyed")
	}
	if got := sr.sessions[active.ID].Status; got != domain.StatusDownloading {
		t.Fatalf("active session must be untouched, got %s", got)
	}
}

// If a session can't be flagged evicted, the store must not be destroyed —
// otherwise the files vanish while the session still reads as downloading and
// EnsureAvailable refuses to recover it.
func TestEvictStale_MarkFailure_PreservesStore(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	e.removeDestroy = map[string]bool{}
	ctx := context.Background()

	s, _ := sr.Create(ctx, domain.TorrentSession{
		UserID: uuid.New(), InfoHash: "stalehash", MagnetURI: validMagnet, Status: domain.StatusSeeding,
	})
	s.LastTouchedAt = time.Now().Add(-100 * time.Hour)
	sr.sessions[s.ID] = s
	sr.markEvictedFail = map[uuid.UUID]bool{s.ID: true}

	n, err := svc.EvictStale(ctx, 72*time.Hour)
	if err != nil {
		t.Fatalf("EvictStale: %v", err)
	}
	if n != 0 {
		t.Fatalf("mark failed → nothing counted as evicted, got %d", n)
	}
	if e.removeDestroy["stalehash"] {
		t.Fatal("mark failed → store must be preserved, not destroyed")
	}
}

func TestEnsureAvailable_ReAddsEvicted(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	ctx := context.Background()
	s, _ := sr.Create(ctx, domain.TorrentSession{
		UserID: uuid.New(), InfoHash: "h", MagnetURI: validMagnet, Status: domain.StatusEvicted,
	})
	if err := svc.EnsureAvailable(ctx, s.ID); err != nil {
		t.Fatalf("EnsureAvailable: %v", err)
	}
	if len(e.addCalls) != 1 {
		t.Fatalf("want 1 re-add, got %d", len(e.addCalls))
	}
	if got := sr.sessions[s.ID].Status; got != domain.StatusDownloading {
		t.Fatalf("want status downloading after re-add, got %s", got)
	}
}

func TestEnsureAvailable_NoopWhenActive(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	ctx := context.Background()
	s, _ := sr.Create(ctx, domain.TorrentSession{
		UserID: uuid.New(), InfoHash: "h", MagnetURI: validMagnet, Status: domain.StatusDownloading,
	})
	if err := svc.EnsureAvailable(ctx, s.ID); err != nil {
		t.Fatalf("EnsureAvailable: %v", err)
	}
	if len(e.addCalls) != 0 {
		t.Fatalf("active session must not be re-added, got %d adds", len(e.addCalls))
	}
}

func TestAdd_EngineDown_StaysUnavailableAndHidesDetail(t *testing.T) {
	svc, _, _, e := newTestTorrentSvc()
	e.addErr = errors.New("dial tcp torrent-engine:9000: connect: connection refused")

	_, err := svc.Add(context.Background(), uuid.New(), validMagnet)

	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrUnavailable {
		t.Fatalf("want ErrUnavailable, got %v", err)
	}
	if de.Message != "torrent engine unavailable" {
		t.Fatalf("must not leak transport detail, got %q", de.Message)
	}
}
