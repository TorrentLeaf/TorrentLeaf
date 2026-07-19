package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

// fakeEngine spins up an httptest server standing in for the torrent-engine.
// It records the last path hit so tests can assert the handler built the right
// upstream URL, and echoes a body so proxyUpstream has something to copy.
func fakeEngine(t *testing.T, status int) (*httptest.Server, *string) {
	t.Helper()
	last := new(string)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*last = r.URL.Path
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(status)
		_, _ = w.Write([]byte("engine-bytes"))
	}))
	t.Cleanup(srv.Close)
	return srv, last
}

func readerApp(t *testing.T, target service.StreamTarget, engineURL string) (*fiber.App, uuid.UUID) {
	svc := &fakeReaderService{
		resolveFn: func(context.Context, uuid.UUID, uuid.UUID) (service.StreamTarget, error) { return target, nil },
		listFn: func(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) ([]service.Page, error) {
			return []service.Page{{Index: 0, FileID: uuid.New(), Name: "p0", MimeType: "image/jpeg", Length: 10}}, nil
		},
	}
	h := NewReaderHandler(zerolog.Nop(), svc, engineURL)
	uid := uuid.New()
	app := newTestApp()
	app.Get("/api/v1/reader/:id/pages", withUser(uid), h.GetPages)
	app.Get("/api/v1/stream/:fileId", withUser(uid), h.StreamFile)
	app.Get("/api/v1/stream/:fileId/:page", withUser(uid), h.StreamPage)
	app.Get("/api/v1/probe/:fileId", withUser(uid), h.ProbeFile)
	app.Get("/api/v1/subtitles/:fileId/:streamIndex", withUser(uid), h.StreamSubtitle)
	app.Get("/api/v1/hls/:fileId/playlist.m3u8", withUser(uid), h.HLSPlaylist)
	app.Get("/api/v1/hls/:fileId/seg/:seg", withUser(uid), h.HLSSegment)
	return app, uid
}

func TestReader_HLS(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 0, FileType: domain.FileTypeVideo}, srv.URL)
	fid := uuid.New().String()
	if code, _ := doReq(t, app, "GET", "/api/v1/hls/"+fid+"/playlist.m3u8", ""); code != 200 {
		t.Fatalf("playlist got %d", code)
	}
	if !strings.Contains(*last, "/engine/hls/h/0/playlist.m3u8") {
		t.Fatalf("upstream = %q, want hls playlist", *last)
	}
	if code, _ := doReq(t, app, "GET", "/api/v1/hls/"+fid+"/seg/7", ""); code != 200 {
		t.Fatalf("segment got %d", code)
	}
	if !strings.Contains(*last, "/engine/hls/h/0/seg/7") {
		t.Fatalf("upstream = %q, want hls seg", *last)
	}
	// bad segment index
	if code, _ := doReq(t, app, "GET", "/api/v1/hls/"+fid+"/seg/bad", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad seg want 400, got %d", code)
	}
}

func TestReader_GetPages(t *testing.T) {
	app, _ := readerApp(t, service.StreamTarget{}, "http://unused")
	sid := uuid.New().String()
	code, body := doReq(t, app, "GET", "/api/v1/reader/"+sid+"/pages", "")
	if code != 200 || !strings.Contains(body, `"name":"p0"`) {
		t.Fatalf("got %d body=%s", code, body)
	}
	// bad session id
	if code, _ := doReq(t, app, "GET", "/api/v1/reader/bad/pages", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad id want 400, got %d", code)
	}
	// bad fileId query
	if code, _ := doReq(t, app, "GET", "/api/v1/reader/"+sid+"/pages?fileId=nope", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad fileId want 400, got %d", code)
	}
}

func TestReader_StreamFile_Image(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "hash", FileIndex: 2, FileType: domain.FileTypeImage, MimeType: "image/jpeg"}, srv.URL)
	code, body := doReq(t, app, "GET", "/api/v1/stream/"+uuid.New().String(), "")
	if code != 200 || body != "engine-bytes" {
		t.Fatalf("got %d body=%s", code, body)
	}
	if !strings.Contains(*last, "/engine/stream/hash/2") {
		t.Fatalf("upstream path = %q, want /engine/stream/hash/2", *last)
	}
}

func TestReader_StreamFile_VideoTransmux(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 0, FileType: domain.FileTypeVideo, MimeType: "video/x-matroska"}, srv.URL)
	code, _ := doReq(t, app, "GET", "/api/v1/stream/"+uuid.New().String()+"?audio=3", "")
	if code != 200 {
		t.Fatalf("got %d", code)
	}
	if !strings.Contains(*last, "/engine/transmux/h/0") {
		t.Fatalf("upstream = %q, want transmux", *last)
	}
}

func TestReader_StreamPage_Archive(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 1, FileType: domain.FileTypeCBZ, MimeType: "application/zip"}, srv.URL)
	code, _ := doReq(t, app, "GET", "/api/v1/stream/"+uuid.New().String()+"/5", "")
	if code != 200 {
		t.Fatalf("got %d", code)
	}
	if !strings.Contains(*last, "/engine/archive/h/1/entry/5") {
		t.Fatalf("upstream = %q, want archive entry", *last)
	}
	// bad page index
	if code, _ := doReq(t, app, "GET", "/api/v1/stream/"+uuid.New().String()+"/-1", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad page want 400, got %d", code)
	}
}

func TestReader_StreamPage_NonArchiveWhole(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 4, FileType: domain.FileTypePDF, MimeType: "application/pdf"}, srv.URL)
	code, _ := doReq(t, app, "GET", "/api/v1/stream/"+uuid.New().String()+"/0", "")
	if code != 200 {
		t.Fatalf("got %d", code)
	}
	if !strings.Contains(*last, "/engine/stream/h/4") {
		t.Fatalf("upstream = %q, want whole stream", *last)
	}
}

func TestReader_Probe(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 0, FileType: domain.FileTypeVideo}, srv.URL)
	if code, _ := doReq(t, app, "GET", "/api/v1/probe/"+uuid.New().String(), ""); code != 200 {
		t.Fatalf("probe got %d", code)
	}
	if !strings.Contains(*last, "/engine/probe/h/0") {
		t.Fatalf("upstream = %q, want probe", *last)
	}
}

func TestReader_Subtitle(t *testing.T) {
	srv, last := fakeEngine(t, 200)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 0, FileType: domain.FileTypeVideo}, srv.URL)
	if code, _ := doReq(t, app, "GET", "/api/v1/subtitles/"+uuid.New().String()+"/2", ""); code != 200 {
		t.Fatalf("subtitle got %d", code)
	}
	if !strings.Contains(*last, "/engine/subtitles/h/0/2") {
		t.Fatalf("upstream = %q, want subtitles", *last)
	}
	// bad stream index
	if code, _ := doReq(t, app, "GET", "/api/v1/subtitles/"+uuid.New().String()+"/bad", ""); code != fiber.StatusBadRequest {
		t.Fatalf("bad streamIndex want 400, got %d", code)
	}
}

func TestReader_ProxyUpstreamError(t *testing.T) {
	// Engine returns 503 → the handler forwards the upstream status.
	srv, _ := fakeEngine(t, http.StatusServiceUnavailable)
	app, _ := readerApp(t, service.StreamTarget{InfoHash: "h", FileIndex: 0, FileType: domain.FileTypeImage, MimeType: "image/jpeg"}, srv.URL)
	code, _ := doReq(t, app, "GET", "/api/v1/stream/"+uuid.New().String(), "")
	if code != http.StatusServiceUnavailable {
		t.Fatalf("want 503 forwarded, got %d", code)
	}
}
