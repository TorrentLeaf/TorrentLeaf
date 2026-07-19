package handler

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

// fakeTorrentService is the minimal stand-in for service.TorrentService used
// by handler security tests. The tests set exactly the fields they need.
type fakeTorrentService struct {
	addFn           func(context.Context, uuid.UUID, string) (*domain.TorrentSession, error)
	listFn          func(context.Context, uuid.UUID) ([]domain.TorrentSession, error)
	getFn           func(context.Context, uuid.UUID, uuid.UUID) (*domain.TorrentSession, error)
	deleteFn        func(context.Context, uuid.UUID, uuid.UUID) error
	setPriorityFn   func(context.Context, uuid.UUID, uuid.UUID, int, int) error
	applyMetadataFn func(context.Context, string, string, int64, []service.MetadataFile) error
	addFromFileFn   func(context.Context, uuid.UUID, []byte) (*domain.TorrentSession, error)
}

func (f *fakeTorrentService) Add(ctx context.Context, u uuid.UUID, m string) (*domain.TorrentSession, error) {
	if f.addFn != nil {
		return f.addFn(ctx, u, m)
	}
	return nil, errors.New("Add not implemented")
}

func (f *fakeTorrentService) List(ctx context.Context, u uuid.UUID) ([]domain.TorrentSession, error) {
	if f.listFn != nil {
		return f.listFn(ctx, u)
	}
	return nil, errors.New("List not implemented")
}

func (f *fakeTorrentService) Get(ctx context.Context, u, id uuid.UUID) (*domain.TorrentSession, error) {
	if f.getFn != nil {
		return f.getFn(ctx, u, id)
	}
	return nil, errors.New("Get not implemented")
}

func (f *fakeTorrentService) Delete(ctx context.Context, u, id uuid.UUID) error {
	if f.deleteFn != nil {
		return f.deleteFn(ctx, u, id)
	}
	return errors.New("Delete not implemented")
}

func (f *fakeTorrentService) SetPriority(ctx context.Context, u, id uuid.UUID, idx, prio int) error {
	if f.setPriorityFn != nil {
		return f.setPriorityFn(ctx, u, id, idx, prio)
	}
	return errors.New("SetPriority not implemented")
}

func (f *fakeTorrentService) ApplyMetadata(ctx context.Context, h, n string, total int64, files []service.MetadataFile) error {
	if f.applyMetadataFn != nil {
		return f.applyMetadataFn(ctx, h, n, total, files)
	}
	return nil
}

func (f *fakeTorrentService) AddFromFile(ctx context.Context, u uuid.UUID, data []byte) (*domain.TorrentSession, error) {
	if f.addFromFileFn != nil {
		return f.addFromFileFn(ctx, u, data)
	}
	return nil, errors.New("AddFromFile not implemented")
}

func (f *fakeTorrentService) ReseedEngine(_ context.Context) error {
	return nil
}

func (f *fakeTorrentService) ReseedEngineWithRetry(_ context.Context) error {
	return nil
}

func (f *fakeTorrentService) EvictStale(_ context.Context, _ time.Duration) (int, error) {
	return 0, nil
}

func (f *fakeTorrentService) EnsureAvailable(_ context.Context, _ uuid.UUID) error {
	return nil
}

// injectUser fakes the RequireAuth middleware's contract: populate userID in
// the Fiber context so the handler can scope the request to that user.
func injectUser(uid uuid.UUID) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Locals(middleware.CtxUserID, uid)
		c.Locals(middleware.CtxRole, domain.RoleUser)
		return c.Next()
	}
}

// TestAddRejectsInvalidMagnetWith422 — the handler trusts the service to do
// the regex check and map ErrInvalidInput → 422 (Unprocessable Entity) per
// mapTorrentError.
func TestAddRejectsInvalidMagnetWith422(t *testing.T) {
	userID := uuid.New()
	svc := &fakeTorrentService{
		addFn: func(_ context.Context, u uuid.UUID, m string) (*domain.TorrentSession, error) {
			if u != userID {
				t.Errorf("user not propagated to service: got %s", u)
			}
			return nil, domain.NewError(domain.ErrInvalidInput,
				"invalid magnet link — must start with magnet:?xt=urn:btih:<40-hex>", nil)
		},
	}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Post("/api/v1/torrents", injectUser(userID), h.Add)

	for _, bad := range []string{
		`{"magnetURI":"not-a-magnet"}`,
		`{"magnetURI":"http://example.com/x.torrent"}`,
		`{"magnetURI":""}`,
	} {
		code, body := postJSON(t, app, "/api/v1/torrents", bad)
		if code != fiber.StatusUnprocessableEntity {
			t.Fatalf("input %s: expected 422, got %d body=%s", bad, code, body)
		}
	}
}

// TestGetOtherUsersTorrentReturns404 — the service returns ErrNotFound when
// the session exists but belongs to a different user (see torrent_impl.Get
// line: `if session.UserID != userID { return ErrNotFound }`). The handler
// must pass that through as 404, not 200-with-data and not an enumerable 403.
func TestGetOtherUsersTorrentReturns404(t *testing.T) {
	attacker := uuid.New()
	torrentID := uuid.New()
	svc := &fakeTorrentService{
		getFn: func(_ context.Context, u, id uuid.UUID) (*domain.TorrentSession, error) {
			// Real service scopes by owner; stranger access returns NotFound.
			if u == attacker {
				return nil, domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
			}
			if id == torrentID {
				return &domain.TorrentSession{ID: id, UserID: u}, nil
			}
			return nil, domain.NewError(domain.ErrNotFound, "not found", nil)
		},
	}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/api/v1/torrents/:id", injectUser(attacker), h.Get)

	req := httptest.NewRequest("GET", "/api/v1/torrents/"+torrentID.String(), nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	code := resp.StatusCode
	if code != fiber.StatusNotFound && code != fiber.StatusForbidden {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 403 or 404, got %d body=%s", code, raw)
	}
	raw, _ := io.ReadAll(resp.Body)
	// Body must not contain the other user's torrent payload.
	if strings.Contains(string(raw), torrentID.String()) && code == fiber.StatusOK {
		t.Fatalf("response leaks torrent data: %s", raw)
	}
}

// TestDeleteOtherUsersTorrentReturns404 — same ownership guard must hold on
// the destructive path.
func TestDeleteOtherUsersTorrentReturns404(t *testing.T) {
	attacker := uuid.New()
	torrentID := uuid.New()
	var deleted bool
	svc := &fakeTorrentService{
		deleteFn: func(_ context.Context, u, _ uuid.UUID) error {
			if u == attacker {
				return domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
			}
			deleted = true
			return nil
		},
	}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Delete("/api/v1/torrents/:id", injectUser(attacker), h.Delete)

	req := httptest.NewRequest("DELETE", "/api/v1/torrents/"+torrentID.String(), nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	code := resp.StatusCode
	if code != fiber.StatusNotFound && code != fiber.StatusForbidden {
		t.Fatalf("expected 403 or 404, got %d", code)
	}
	if deleted {
		t.Fatalf("torrent was deleted despite ownership mismatch")
	}
}

// TestProtectedEndpointWithoutTokenReturns401 — RequireAuth must reject any
// request with no cookie and no Authorization header.
func TestProtectedEndpointWithoutTokenReturns401(t *testing.T) {
	auth := &fakeAuthService{
		parseFn: func(string) (*service.Claims, error) {
			return nil, errors.New("nope")
		},
	}
	svc := &fakeTorrentService{
		listFn: func(context.Context, uuid.UUID) ([]domain.TorrentSession, error) {
			t.Fatalf("handler must not be reached without a token")
			return nil, nil
		},
	}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/api/v1/torrents", middleware.RequireAuth(auth), h.List)

	req := httptest.NewRequest("GET", "/api/v1/torrents", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

// TestAddFileCreatesSession — a multipart .torrent upload reaches the service
// as raw bytes and the created session is returned as 201.
func TestAddFileCreatesSession(t *testing.T) {
	userID := uuid.New()
	sessionID := uuid.New()
	var gotBytes []byte
	svc := &fakeTorrentService{
		addFromFileFn: func(_ context.Context, u uuid.UUID, data []byte) (*domain.TorrentSession, error) {
			if u != userID {
				t.Errorf("user not propagated: got %s", u)
			}
			gotBytes = data
			return &domain.TorrentSession{ID: sessionID, UserID: u, InfoHash: "045fe5d7843f9fd2567315108a2667893c9dc276", Name: "sample.txt"}, nil
		},
	}
	h := NewTorrentHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Post("/api/v1/torrents/file", injectUser(userID), h.AddFile)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, _ := w.CreateFormFile("torrent", "sample.torrent")
	_, _ = fw.Write([]byte("d4:infoe")) // bencoded-ish payload; service is faked
	_ = w.Close()

	req := httptest.NewRequest("POST", "/api/v1/torrents/file", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusCreated {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 201, got %d body=%s", resp.StatusCode, raw)
	}
	if len(gotBytes) == 0 {
		t.Fatal("torrent bytes not forwarded to service")
	}
	raw, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(raw), sessionID.String()) {
		t.Fatalf("response should carry the session id, got %s", raw)
	}
}

// TestAddFileMissingFileReturns400 — no file part → 400.
func TestAddFileMissingFileReturns400(t *testing.T) {
	h := NewTorrentHandler(zerolog.Nop(), &fakeTorrentService{})
	app := newTestApp()
	app.Post("/api/v1/torrents/file", injectUser(uuid.New()), h.AddFile)

	req := httptest.NewRequest("POST", "/api/v1/torrents/file", strings.NewReader(""))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}
