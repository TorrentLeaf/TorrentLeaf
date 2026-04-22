package handler

import (
	"context"
	"errors"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

// fakeReaderService implements service.ReaderService for handler tests.
type fakeReaderService struct {
	listFn    func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) ([]service.Page, error)
	resolveFn func(context.Context, uuid.UUID, uuid.UUID) (service.StreamTarget, error)
}

func (f *fakeReaderService) ListPages(ctx context.Context, u, s, only uuid.UUID) ([]service.Page, error) {
	if f.listFn != nil {
		return f.listFn(ctx, u, s, only)
	}
	return nil, errors.New("ListPages not implemented")
}

func (f *fakeReaderService) ResolveStreamTarget(ctx context.Context, u, fid uuid.UUID) (service.StreamTarget, error) {
	if f.resolveFn != nil {
		return f.resolveFn(ctx, u, fid)
	}
	return service.StreamTarget{}, errors.New("ResolveStreamTarget not implemented")
}

// TestStreamFilePathTraversalReturns400 — the :fileId segment must parse as a
// UUID; a path-traversal attempt is just a non-UUID and gets rejected at the
// handler before any service or engine call.
func TestStreamFilePathTraversalReturns400(t *testing.T) {
	var touched bool
	svc := &fakeReaderService{
		resolveFn: func(context.Context, uuid.UUID, uuid.UUID) (service.StreamTarget, error) {
			touched = true
			return service.StreamTarget{}, nil
		},
	}
	// engineURL irrelevant — these requests must never reach the proxy step.
	h := NewReaderHandler(zerolog.Nop(), svc, "http://should-never-be-called")

	app := newTestApp()
	app.Get("/api/v1/stream/:fileId", injectUser(uuid.New()), h.StreamFile)

	// Each of these is a non-UUID that should produce a 400 — the handler
	// never sees them as a path it could navigate on disk because the only
	// consumer of fileId is uuid.Parse. Raw "../../etc/passwd" is excluded
	// because HTTP path normalization resolves it before Fiber routes the
	// request (the router returns 404 for the resolved /etc/passwd path,
	// which is also a safe outcome but tests a different layer).
	payloads := []string{
		url.PathEscape("../../etc/passwd"),
		url.PathEscape(".."),
		"not-a-uuid",
		"00000000-0000-0000-0000-00000000000", // one char short
		"zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", // wrong charset
	}
	for _, p := range payloads {
		req := httptest.NewRequest("GET", "/api/v1/stream/"+p, nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("payload %q: %v", p, err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != fiber.StatusBadRequest {
			t.Fatalf("payload %q: expected 400, got %d", p, resp.StatusCode)
		}
	}
	if touched {
		t.Fatalf("service was invoked for a non-UUID fileId")
	}
}

// TestStreamFileOfAnotherUserReturns404 — ownership is checked inside
// ResolveStreamTarget; a stranger gets ErrNotFound, which maps to 404 via
// mapTorrentError. The test would also accept 403 per the task spec.
func TestStreamFileOfAnotherUserReturns404(t *testing.T) {
	attacker := uuid.New()
	fileID := uuid.New()
	svc := &fakeReaderService{
		resolveFn: func(_ context.Context, u, fid uuid.UUID) (service.StreamTarget, error) {
			if u != attacker {
				t.Errorf("unexpected user %s", u)
			}
			if fid != fileID {
				t.Errorf("unexpected file %s", fid)
			}
			return service.StreamTarget{}, domain.NewError(domain.ErrNotFound, "file not found", nil)
		},
	}
	h := NewReaderHandler(zerolog.Nop(), svc, "http://should-never-be-called")

	app := newTestApp()
	app.Get("/api/v1/stream/:fileId", injectUser(attacker), h.StreamFile)

	req := httptest.NewRequest("GET", "/api/v1/stream/"+fileID.String(), nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	code := resp.StatusCode
	if code != fiber.StatusNotFound && code != fiber.StatusForbidden {
		t.Fatalf("expected 403 or 404, got %d", code)
	}
}

// TestGetPagesOfAnotherUsersSessionReturns404 — same guarantee on the pages
// endpoint, which is a more common entry point than the raw stream route.
func TestGetPagesOfAnotherUsersSessionReturns404(t *testing.T) {
	attacker := uuid.New()
	sessionID := uuid.New()
	svc := &fakeReaderService{
		listFn: func(_ context.Context, u, s, _ uuid.UUID) ([]service.Page, error) {
			if u != attacker || s != sessionID {
				t.Errorf("unexpected args u=%s s=%s", u, s)
			}
			return nil, domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
		},
	}
	h := NewReaderHandler(zerolog.Nop(), svc, "http://unused")

	app := newTestApp()
	app.Get("/api/v1/reader/:id/pages", injectUser(attacker), h.GetPages)

	req := httptest.NewRequest("GET", "/api/v1/reader/"+sessionID.String()+"/pages", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	code := resp.StatusCode
	if code != fiber.StatusNotFound && code != fiber.StatusForbidden {
		t.Fatalf("expected 403 or 404, got %d", code)
	}
}
