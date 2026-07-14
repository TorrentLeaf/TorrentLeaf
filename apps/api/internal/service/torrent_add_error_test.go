package service

import (
	"context"
	"errors"
	"strings"
	"testing"

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
