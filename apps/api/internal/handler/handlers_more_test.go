package handler

import (
	"context"
	"io"
	"net/http"
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

// withUser injects an authenticated user id into the Fiber context, mimicking
// what middleware.RequireAuth does on protected routes.
func withUser(uid uuid.UUID) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Locals(middleware.CtxUserID, uid)
		return c.Next()
	}
}

func doReq(t *testing.T, app *fiber.App, method, path, body string) (int, string) {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	resp, err := app.Test(r)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(raw)
}

// ─── Library handler ────────────────────────────────────────────────────────

type fakeLibrarySvc struct {
	listFn   func(context.Context, uuid.UUID, service.ListFilter) ([]service.LibraryCard, error)
	addFn    func(context.Context, uuid.UUID, uuid.UUID, domain.LibraryItemType, string) (*domain.LibraryItem, error)
	removeFn func(context.Context, uuid.UUID, uuid.UUID) error
	favFn    func(context.Context, uuid.UUID, uuid.UUID, bool) error
}

func (f *fakeLibrarySvc) List(ctx context.Context, u uuid.UUID, fl service.ListFilter) ([]service.LibraryCard, error) {
	return f.listFn(ctx, u, fl)
}
func (f *fakeLibrarySvc) Add(ctx context.Context, u, s uuid.UUID, ty domain.LibraryItemType, ti string) (*domain.LibraryItem, error) {
	return f.addFn(ctx, u, s, ty, ti)
}
func (f *fakeLibrarySvc) Remove(ctx context.Context, u, id uuid.UUID) error { return f.removeFn(ctx, u, id) }
func (f *fakeLibrarySvc) SetFavorite(ctx context.Context, u, id uuid.UUID, fav bool) error {
	return f.favFn(ctx, u, id, fav)
}

func TestLibraryHandler_List(t *testing.T) {
	now := time.Now()
	svc := &fakeLibrarySvc{listFn: func(_ context.Context, _ uuid.UUID, fl service.ListFilter) ([]service.LibraryCard, error) {
		if fl.Type != "" { // "all" must be normalized to empty
			t.Fatalf("type should be empty, got %q", fl.Type)
		}
		return []service.LibraryCard{{ID: uuid.New(), SessionID: uuid.New(), Title: "One Piece", Type: domain.LibraryTypeManga, Format: "comics", AddedAt: now, LastReadAt: &now}}, nil
	}}
	h := NewLibraryHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/library", withUser(uuid.New()), h.List)
	code, body := doReq(t, app, "GET", "/library?type=all", "")
	if code != 200 || !strings.Contains(body, `"format":"comics"`) {
		t.Fatalf("got %d body=%s", code, body)
	}
}

func TestLibraryHandler_List_Unauthorized(t *testing.T) {
	h := NewLibraryHandler(zerolog.Nop(), &fakeLibrarySvc{})
	app := newTestApp()
	app.Get("/library", h.List) // no withUser → no locals
	if code, _ := doReq(t, app, "GET", "/library", ""); code != fiber.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

func TestLibraryHandler_List_Error(t *testing.T) {
	svc := &fakeLibrarySvc{listFn: func(context.Context, uuid.UUID, service.ListFilter) ([]service.LibraryCard, error) {
		return nil, domain.NewError(domain.ErrInvalidInput, "bad filter", nil)
	}}
	h := NewLibraryHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/library", withUser(uuid.New()), h.List)
	if code, _ := doReq(t, app, "GET", "/library", ""); code != fiber.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d", code)
	}
}

func TestLibraryHandler_Add(t *testing.T) {
	h := NewLibraryHandler(zerolog.Nop(), &fakeLibrarySvc{addFn: func(_ context.Context, u, s uuid.UUID, ty domain.LibraryItemType, ti string) (*domain.LibraryItem, error) {
		return &domain.LibraryItem{ID: uuid.New(), SessionID: s, Title: ti, Type: ty, AddedAt: time.Now()}, nil
	}})
	app := newTestApp()
	app.Post("/library", withUser(uuid.New()), h.Add)

	sid := uuid.New().String()
	code, _ := doReq(t, app, "POST", "/library", `{"sessionId":"`+sid+`","type":"manga","title":"OP"}`)
	if code != fiber.StatusCreated {
		t.Fatalf("want 201, got %d", code)
	}
	// bad body
	if code, _ := doReq(t, app, "POST", "/library", `not json`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
	// bad sessionId
	if code, _ := doReq(t, app, "POST", "/library", `{"sessionId":"nope"}`); code != fiber.StatusUnprocessableEntity {
		t.Fatalf("bad sessionId want 422, got %d", code)
	}
}

func TestLibraryHandler_RemoveAndFavorite(t *testing.T) {
	h := NewLibraryHandler(zerolog.Nop(), &fakeLibrarySvc{
		removeFn: func(context.Context, uuid.UUID, uuid.UUID) error { return nil },
		favFn:    func(context.Context, uuid.UUID, uuid.UUID, bool) error { return nil },
	})
	app := newTestApp()
	uid := uuid.New()
	app.Delete("/library/:id", withUser(uid), h.Remove)
	app.Post("/library/:id/favorite", withUser(uid), h.AddFavorite)
	app.Delete("/library/:id/favorite", withUser(uid), h.RemoveFavorite)

	id := uuid.New().String()
	if code, _ := doReq(t, app, "DELETE", "/library/"+id, ""); code != fiber.StatusNoContent {
		t.Fatalf("remove want 204, got %d", code)
	}
	if code, _ := doReq(t, app, "DELETE", "/library/bad-uuid", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad id want 400, got %d", code)
	}
	if code, _ := doReq(t, app, "POST", "/library/"+id+"/favorite", ""); code != fiber.StatusNoContent {
		t.Fatalf("add fav want 204, got %d", code)
	}
	if code, _ := doReq(t, app, "DELETE", "/library/"+id+"/favorite", ""); code != fiber.StatusNoContent {
		t.Fatalf("remove fav want 204, got %d", code)
	}
}

// ─── Progress handler ───────────────────────────────────────────────────────

type fakeProgressSvc struct {
	getFn func(context.Context, uuid.UUID, uuid.UUID) (*domain.ReadingProgress, error)
	updFn func(context.Context, uuid.UUID, uuid.UUID, service.UpdateProgress) (*domain.ReadingProgress, error)
}

func (f *fakeProgressSvc) Get(ctx context.Context, u, fid uuid.UUID) (*domain.ReadingProgress, error) {
	return f.getFn(ctx, u, fid)
}
func (f *fakeProgressSvc) Update(ctx context.Context, u, fid uuid.UUID, in service.UpdateProgress) (*domain.ReadingProgress, error) {
	return f.updFn(ctx, u, fid, in)
}

func TestProgressHandler_Get(t *testing.T) {
	fid := uuid.New()
	svc := &fakeProgressSvc{getFn: func(_ context.Context, _, id uuid.UUID) (*domain.ReadingProgress, error) {
		return &domain.ReadingProgress{FileID: id, CurrentPage: 5, TotalPages: 20, ReadingMode: domain.ReadingModePaginated, LastReadAt: time.Now()}, nil
	}}
	h := NewProgressHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/progress/:fileId", withUser(uuid.New()), h.Get)
	code, body := doReq(t, app, "GET", "/progress/"+fid.String(), "")
	if code != 200 || !strings.Contains(body, `"currentPage":5`) {
		t.Fatalf("got %d body=%s", code, body)
	}
	// bad fileId
	if code, _ := doReq(t, app, "GET", "/progress/bad", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad fileId want 400, got %d", code)
	}
}

func TestProgressHandler_Get_NotFoundReturnsEmpty(t *testing.T) {
	svc := &fakeProgressSvc{getFn: func(context.Context, uuid.UUID, uuid.UUID) (*domain.ReadingProgress, error) {
		return nil, domain.NewError(domain.ErrNotFound, "no progress", nil)
	}}
	h := NewProgressHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/progress/:fileId", withUser(uuid.New()), h.Get)
	code, body := doReq(t, app, "GET", "/progress/"+uuid.New().String(), "")
	if code != 200 || !strings.Contains(body, `"currentPage":0`) {
		t.Fatalf("no-progress should be 200 empty, got %d body=%s", code, body)
	}
}

func TestProgressHandler_Update(t *testing.T) {
	svc := &fakeProgressSvc{updFn: func(_ context.Context, _, fid uuid.UUID, in service.UpdateProgress) (*domain.ReadingProgress, error) {
		return &domain.ReadingProgress{FileID: fid, CurrentPage: in.CurrentPage, TotalPages: in.TotalPages, ReadingMode: in.Mode, LastReadAt: time.Now()}, nil
	}}
	h := NewProgressHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Put("/progress/:fileId", withUser(uuid.New()), h.Update)
	fid := uuid.New().String()
	code, body := doReq(t, app, "PUT", "/progress/"+fid, `{"currentPage":10,"totalPages":30,"readingMode":"webtoon"}`)
	if code != 200 || !strings.Contains(body, `"currentPage":10`) {
		t.Fatalf("got %d body=%s", code, body)
	}
	if code, _ := doReq(t, app, "PUT", "/progress/bad", `{}`); code != fiber.StatusBadRequest {
		t.Fatalf("bad fileId want 400, got %d", code)
	}
	if code, _ := doReq(t, app, "PUT", "/progress/"+fid, `notjson`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
}

// ─── Settings handler ───────────────────────────────────────────────────────

type fakeSettingsSvc struct {
	getFn func(context.Context, uuid.UUID) (*domain.UserSettings, error)
	updFn func(context.Context, uuid.UUID, service.SettingsUpdate) (*domain.UserSettings, error)
}

func (f *fakeSettingsSvc) Get(ctx context.Context, u uuid.UUID) (*domain.UserSettings, error) {
	return f.getFn(ctx, u)
}
func (f *fakeSettingsSvc) Update(ctx context.Context, u uuid.UUID, p service.SettingsUpdate) (*domain.UserSettings, error) {
	return f.updFn(ctx, u, p)
}

func TestSettingsHandler_GetAndUpdate(t *testing.T) {
	base := &domain.UserSettings{DownloadPath: "manga", DefaultReadingMode: "paginated", ReaderBackground: "#000000"}
	svc := &fakeSettingsSvc{
		getFn: func(context.Context, uuid.UUID) (*domain.UserSettings, error) { return base, nil },
		updFn: func(_ context.Context, _ uuid.UUID, p service.SettingsUpdate) (*domain.UserSettings, error) { return base, nil },
	}
	h := NewSettingsHandler(zerolog.Nop(), svc)
	app := newTestApp()
	uid := uuid.New()
	app.Get("/settings", withUser(uid), h.Get)
	app.Put("/settings", withUser(uid), h.Update)

	if code, body := doReq(t, app, "GET", "/settings", ""); code != 200 || !strings.Contains(body, `"downloadPath":"manga"`) {
		t.Fatalf("get got %d body=%s", code, body)
	}
	if code, _ := doReq(t, app, "PUT", "/settings", `{"downloadPath":"books"}`); code != 200 {
		t.Fatalf("update want 200, got %d", code)
	}
	if code, _ := doReq(t, app, "PUT", "/settings", `notjson`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
}

func TestSettingsHandler_GetError(t *testing.T) {
	svc := &fakeSettingsSvc{getFn: func(context.Context, uuid.UUID) (*domain.UserSettings, error) {
		return nil, domain.NewError(domain.ErrInternal, "boom", nil)
	}}
	h := NewSettingsHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/settings", withUser(uuid.New()), h.Get)
	if code, _ := doReq(t, app, "GET", "/settings", ""); code != fiber.StatusInternalServerError {
		t.Fatalf("want 500, got %d", code)
	}
}

// ─── Admin handler ──────────────────────────────────────────────────────────

type fakeAdminSvc struct {
	listFn                    func(context.Context) ([]domain.TorrentSession, error)
	pauseFn, resumeFn, delFn func(context.Context, uuid.UUID) error
}

func (f *fakeAdminSvc) ListAllTorrents(ctx context.Context) ([]domain.TorrentSession, error) {
	return f.listFn(ctx)
}
func (f *fakeAdminSvc) PauseTorrent(ctx context.Context, id uuid.UUID) error  { return f.pauseFn(ctx, id) }
func (f *fakeAdminSvc) ResumeTorrent(ctx context.Context, id uuid.UUID) error { return f.resumeFn(ctx, id) }
func (f *fakeAdminSvc) DeleteTorrent(ctx context.Context, id uuid.UUID) error { return f.delFn(ctx, id) }

func TestAdminHandler(t *testing.T) {
	ok := func(context.Context, uuid.UUID) error { return nil }
	svc := &fakeAdminSvc{
		listFn: func(context.Context) ([]domain.TorrentSession, error) {
			return []domain.TorrentSession{{ID: uuid.New(), UserID: uuid.New(), InfoHash: "abc", Name: "T", Status: domain.StatusDownloading, CreatedAt: time.Now()}}, nil
		},
		pauseFn: ok, resumeFn: ok, delFn: ok,
	}
	h := NewAdminHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/admin/torrents", h.ListTorrents)
	app.Post("/admin/torrents/:id/pause", h.PauseTorrent)
	app.Post("/admin/torrents/:id/resume", h.ResumeTorrent)
	app.Delete("/admin/torrents/:id", h.DeleteTorrent)

	if code, body := doReq(t, app, "GET", "/admin/torrents", ""); code != 200 || !strings.Contains(body, `"infoHash":"abc"`) {
		t.Fatalf("list got %d body=%s", code, body)
	}
	id := uuid.New().String()
	for _, tc := range []struct{ method, path string }{
		{"POST", "/admin/torrents/" + id + "/pause"},
		{"POST", "/admin/torrents/" + id + "/resume"},
		{"DELETE", "/admin/torrents/" + id},
	} {
		if code, _ := doReq(t, app, tc.method, tc.path, ""); code != fiber.StatusNoContent {
			t.Fatalf("%s %s want 204, got %d", tc.method, tc.path, code)
		}
	}
	// bad id on pause
	if code, _ := doReq(t, app, "POST", "/admin/torrents/bad/pause", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad id want 400, got %d", code)
	}
}

func TestAdminHandler_ErrorsMapped(t *testing.T) {
	svc := &fakeAdminSvc{
		listFn:  func(context.Context) ([]domain.TorrentSession, error) { return nil, domain.NewError(domain.ErrInternal, "x", nil) },
		delFn:   func(context.Context, uuid.UUID) error { return domain.NewError(domain.ErrNotFound, "nope", nil) },
	}
	h := NewAdminHandler(zerolog.Nop(), svc)
	app := newTestApp()
	app.Get("/admin/torrents", h.ListTorrents)
	app.Delete("/admin/torrents/:id", h.DeleteTorrent)
	if code, _ := doReq(t, app, "GET", "/admin/torrents", ""); code != fiber.StatusInternalServerError {
		t.Fatalf("list err want 500, got %d", code)
	}
	if code, _ := doReq(t, app, "DELETE", "/admin/torrents/"+uuid.New().String(), ""); code != fiber.StatusNotFound {
		t.Fatalf("delete err want 404, got %d", code)
	}
}

// ─── Internal webhook handler ───────────────────────────────────────────────

func TestWebhook_RequireSecret(t *testing.T) {
	// disabled (no secret)
	hNo := NewInternalWebhookHandler(zerolog.Nop(), &fakeTorrentService{}, "")
	app := newTestApp()
	app.Post("/internal/x", hNo.RequireSecret(), func(c *fiber.Ctx) error { return c.SendStatus(200) })
	if code, _ := doReq(t, app, "POST", "/internal/x", ""); code != fiber.StatusServiceUnavailable {
		t.Fatalf("no secret want 503, got %d", code)
	}

	h := NewInternalWebhookHandler(zerolog.Nop(), &fakeTorrentService{}, "shh")
	app2 := newTestApp()
	app2.Post("/internal/x", h.RequireSecret(), func(c *fiber.Ctx) error { return c.SendStatus(200) })
	// wrong secret
	r := httptest.NewRequest("POST", "/internal/x", nil)
	r.Header.Set("X-Webhook-Secret", "wrong")
	resp, _ := app2.Test(r)
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("wrong secret want 401, got %d", resp.StatusCode)
	}
	// right secret
	r2 := httptest.NewRequest("POST", "/internal/x", nil)
	r2.Header.Set("X-Webhook-Secret", "shh")
	resp2, _ := app2.Test(r2)
	if resp2.StatusCode != 200 {
		t.Fatalf("right secret want 200, got %d", resp2.StatusCode)
	}
}

func TestWebhook_Metadata(t *testing.T) {
	var gotHash string
	svc := &fakeTorrentService{
		applyMetadataFn: func(_ context.Context, h, _ string, _ int64, _ []service.MetadataFile) error {
			gotHash = h
			return nil
		},
	}
	h := NewInternalWebhookHandler(zerolog.Nop(), svc, "shh")
	app := newTestApp()
	app.Post("/internal/torrents/:infoHash/metadata", h.Metadata)

	body := `{"name":"OP","totalLength":100,"files":[{"index":0,"name":"a.cbz","path":"a.cbz","length":100,"mimeType":"application/zip","fileType":"cbz"}]}`
	if code, _ := doReq(t, app, "POST", "/internal/torrents/abc123/metadata", body); code != fiber.StatusNoContent {
		t.Fatalf("metadata want 204, got %d", code)
	}
	if gotHash != "abc123" {
		t.Fatalf("infoHash not passed through, got %q", gotHash)
	}
	// bad body
	if code, _ := doReq(t, app, "POST", "/internal/torrents/abc/metadata", `notjson`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
}

func TestWebhook_Metadata_ServiceError(t *testing.T) {
	svc := &fakeTorrentService{applyMetadataFn: func(context.Context, string, string, int64, []service.MetadataFile) error {
		return domain.NewError(domain.ErrNotFound, "no session", nil)
	}}
	h := NewInternalWebhookHandler(zerolog.Nop(), svc, "shh")
	app := newTestApp()
	app.Post("/internal/torrents/:infoHash/metadata", h.Metadata)
	if code, _ := doReq(t, app, "POST", "/internal/torrents/abc/metadata", `{"name":"x"}`); code != fiber.StatusNotFound {
		t.Fatalf("service err want 404, got %d", code)
	}
}

