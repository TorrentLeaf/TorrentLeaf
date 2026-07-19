package handler

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

func TestTorrentHandler_ListGetDelete(t *testing.T) {
	sid := uuid.New()
	svc := &fakeTorrentService{
		listFn: func(context.Context, uuid.UUID) ([]domain.TorrentSession, error) {
			return []domain.TorrentSession{{ID: sid, InfoHash: "abc", Name: "OP", Status: domain.StatusDownloading, CreatedAt: time.Now()}}, nil
		},
		getFn:    func(context.Context, uuid.UUID, uuid.UUID) (*domain.TorrentSession, error) { return &domain.TorrentSession{ID: sid, InfoHash: "abc", Status: domain.StatusSeeding, CreatedAt: time.Now()}, nil },
		deleteFn: func(context.Context, uuid.UUID, uuid.UUID) error { return nil },
	}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	uid := uuid.New()
	app.Get("/torrents", withUser(uid), h.List)
	app.Get("/torrents/:id", withUser(uid), h.Get)
	app.Delete("/torrents/:id", withUser(uid), h.Delete)

	if code, body := doReq(t, app, "GET", "/torrents", ""); code != 200 || !strings.Contains(body, `"infoHash":"abc"`) {
		t.Fatalf("list got %d body=%s", code, body)
	}
	if code, _ := doReq(t, app, "GET", "/torrents/"+sid.String(), ""); code != 200 {
		t.Fatalf("get want 200, got %d", code)
	}
	if code, _ := doReq(t, app, "GET", "/torrents/bad", ""); code != fiber.StatusBadRequest {
		t.Fatalf("get bad id want 400, got %d", code)
	}
	if code, _ := doReq(t, app, "DELETE", "/torrents/"+sid.String(), ""); code != fiber.StatusNoContent {
		t.Fatalf("delete want 204, got %d", code)
	}
	if code, _ := doReq(t, app, "DELETE", "/torrents/bad", ""); code != fiber.StatusBadRequest {
		t.Fatalf("delete bad id want 400, got %d", code)
	}
}

func TestTorrentHandler_SetPriority(t *testing.T) {
	svc := &fakeTorrentService{setPriorityFn: func(context.Context, uuid.UUID, uuid.UUID, int, int) error { return nil }}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Post("/torrents/:id/priority", withUser(uuid.New()), h.SetPriority)
	id := uuid.New().String()
	if code, _ := doReq(t, app, "POST", "/torrents/"+id+"/priority", `{"fileIndex":0,"priority":2}`); code != fiber.StatusNoContent {
		t.Fatalf("want 204, got %d", code)
	}
	if code, _ := doReq(t, app, "POST", "/torrents/bad/priority", `{}`); code != fiber.StatusBadRequest {
		t.Fatalf("bad id want 400, got %d", code)
	}
	if code, _ := doReq(t, app, "POST", "/torrents/"+id+"/priority", `notjson`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
}

// TestMapTorrentError_AllBranches drives every domain code → HTTP status
// mapping through the List handler (which forwards service errors verbatim).
func TestMapTorrentError_AllBranches(t *testing.T) {
	cases := []struct {
		code domain.ErrCode
		want int
	}{
		{domain.ErrInvalidInput, fiber.StatusUnprocessableEntity},
		{domain.ErrNotFound, fiber.StatusNotFound},
		{domain.ErrConflict, fiber.StatusConflict},
		{domain.ErrUnavailable, fiber.StatusServiceUnavailable},
		{domain.ErrInsufficientStorage, fiber.StatusInsufficientStorage},
		{domain.ErrForbidden, fiber.StatusForbidden},
		{domain.ErrUnauthorized, fiber.StatusUnauthorized},
		{domain.ErrInternal, fiber.StatusInternalServerError},
	}
	for _, tc := range cases {
		svc := &fakeTorrentService{listFn: func(context.Context, uuid.UUID) ([]domain.TorrentSession, error) {
			return nil, domain.NewError(tc.code, "boom", nil)
		}}
		h := NewTorrentHandler(zerolog.Nop(), svc)
		app := newTestApp()
		app.Get("/torrents", withUser(uuid.New()), h.List)
		code, body := doReq(t, app, "GET", "/torrents", "")
		if code != tc.want {
			t.Fatalf("code %s: want %d, got %d", tc.code, tc.want, code)
		}
		// internal errors must not leak the raw message
		if tc.code == domain.ErrInternal && strings.Contains(body, "boom") {
			t.Fatalf("internal error leaked message: %s", body)
		}
	}
}

// TestMapTorrentError_NonDomainPassthrough: a plain error is returned as-is
// (Fiber's ErrorHandler turns it into a 500).
func TestMapTorrentError_NonDomainPassthrough(t *testing.T) {
	svc := &fakeTorrentService{listFn: func(context.Context, uuid.UUID) ([]domain.TorrentSession, error) {
		return nil, context.DeadlineExceeded
	}}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/torrents", withUser(uuid.New()), h.List)
	if code, _ := doReq(t, app, "GET", "/torrents", ""); code != fiber.StatusInternalServerError {
		t.Fatalf("want 500, got %d", code)
	}
}
