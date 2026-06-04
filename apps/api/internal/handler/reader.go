package handler

import (
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

type ReaderHandler struct {
	log       zerolog.Logger
	svc       service.ReaderService
	engineURL string
	http      *http.Client
}

func NewReaderHandler(log zerolog.Logger, svc service.ReaderService, engineURL string) *ReaderHandler {
	return &ReaderHandler{
		log:       log,
		svc:       svc,
		engineURL: engineURL,
		http:      &http.Client{Timeout: 60 * time.Second},
	}
}

type pageDTO struct {
	Index      int    `json:"index"`
	FileID     string `json:"fileId"`
	EntryIndex *int   `json:"entryIndex,omitempty"`
	Name       string `json:"name"`
	MimeType   string `json:"mimeType"`
	Length     int64  `json:"length"`
}

// GetPages is mounted at GET /api/v1/reader/:id/pages where :id is a
// torrent session id. Returns the ordered list of renderable pages.
func (h *ReaderHandler) GetPages(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var onlyFileID uuid.UUID
	if raw := c.Query("fileId"); raw != "" {
		onlyFileID, err = uuid.Parse(raw)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
		}
	}
	pages, err := h.svc.ListPages(c.Context(), userID, sessionID, onlyFileID)
	if err != nil {
		return mapTorrentError(err)
	}
	out := make([]pageDTO, 0, len(pages))
	for _, p := range pages {
		out = append(out, pageDTO{
			Index:      p.Index,
			FileID:     p.FileID.String(),
			EntryIndex: p.EntryIndex,
			Name:       p.Name,
			MimeType:   p.MimeType,
			Length:     p.Length,
		})
	}
	return c.JSON(out)
}

// StreamFile proxies the full file bytes from the torrent-engine. Forwards
// the Range header so browsers/PDF.js can seek.
// For MKV/AVI/WMV files, it proxies through the engine's transmux endpoint
// which converts to fragmented MP4 on-the-fly via ffmpeg.
// Mounted at GET /api/v1/stream/:fileId
func (h *ReaderHandler) StreamFile(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	target, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}

	// MKV/AVI/WMV need transmuxing — browsers can't play them natively
	if needsTransmux(target.FileType, target.MimeType) {
		url := fmt.Sprintf("%s/engine/transmux/%s/%d", h.engineURL, target.InfoHash, target.FileIndex)
		// Forward the audio track selection (?audio=<absoluteStreamIndex>) so
		// multi-language MKVs play the chosen track instead of always the first.
		if a := c.Query("audio"); a != "" {
			url += "?audio=" + neturl.QueryEscape(a)
		}
		// The engine transcodes to a complete faststart MP4 and serves it with
		// Range support, so forward the browser's Range header for seeking.
		return h.proxyUpstream(c, url, "video/mp4", true)
	}

	url := fmt.Sprintf("%s/engine/stream/%s/%d", h.engineURL, target.InfoHash, target.FileIndex)
	return h.proxyUpstream(c, url, target.MimeType, true)
}

// needsTransmux returns true for video files that may not play natively in
// browsers. Since we can't reliably detect codec (H.265/HEVC, EAC3, FLAC,
// DTS, etc.) from the container alone, ALL video files are routed through
// ffmpeg transmux. The ffmpeg call uses -c:v copy so there's no re-encoding
// overhead — only the container is repackaged to fMP4.
func needsTransmux(fileType domain.FileType, _ string) bool {
	return fileType == domain.FileTypeVideo
}

// isArchive reports whether the file is a comic archive whose individual
// images should be streamed through /engine/archive rather than the whole
// file through /engine/stream. CBZ uses a ZIP container, CBR a RAR
// container; both expose the same per-entry endpoint shape.
func isArchive(t domain.FileType) bool {
	return t == domain.FileTypeCBZ || t == domain.FileTypeCBR
}

// StreamPage is mounted at GET /api/v1/stream/:fileId/:page.
//
// For CBZ files, :page is the zero-based index of an archive entry and we
// proxy to the engine's /engine/archive endpoint. For other file types the
// page segment is ignored and we fall back to the whole-file stream.
func (h *ReaderHandler) StreamPage(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	target, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}

	if !isArchive(target.FileType) {
		// Legacy behavior: non-archive files ignore :page and stream whole.
		url := fmt.Sprintf("%s/engine/stream/%s/%d", h.engineURL, target.InfoHash, target.FileIndex)
		return h.proxyUpstream(c, url, target.MimeType, true)
	}

	entryIdx, err := strconv.Atoi(c.Params("page"))
	if err != nil || entryIdx < 0 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid page index")
	}
	url := fmt.Sprintf("%s/engine/archive/%s/%d/entry/%d",
		h.engineURL, target.InfoHash, target.FileIndex, entryIdx)
	// Archive entries are decompressed on the engine side; Range is not
	// supported there (yet), so forward without it.
	return h.proxyUpstream(c, url, "", false)
}

// ProbeFile returns the audio/subtitle stream layout of a video file so the
// player can render selectors. Mounted at GET /api/v1/probe/:fileId.
func (h *ReaderHandler) ProbeFile(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	target, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}
	if target.FileType != domain.FileTypeVideo {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "file is not a video")
	}
	url := fmt.Sprintf("%s/engine/probe/%s/%d", h.engineURL, target.InfoHash, target.FileIndex)
	return h.proxyUpstream(c, url, "application/json", false)
}

// StreamSubtitle proxies a single subtitle track converted to WebVTT. The
// player wires this URL into a <track> element. Mounted at
// GET /api/v1/subtitles/:fileId/:streamIndex.
func (h *ReaderHandler) StreamSubtitle(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	streamIdx, err := strconv.Atoi(c.Params("streamIndex"))
	if err != nil || streamIdx < 0 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid streamIndex")
	}
	target, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}
	if target.FileType != domain.FileTypeVideo {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "file is not a video")
	}
	url := fmt.Sprintf("%s/engine/subtitles/%s/%d/%d",
		h.engineURL, target.InfoHash, target.FileIndex, streamIdx)
	return h.proxyUpstream(c, url, "text/vtt; charset=utf-8", false)
}

// HLSPlaylist proxies the engine's HLS media playlist for videos that need
// re-encoding. Each relative segment URI is rewritten to carry the auth token
// (and audio selection) because hls.js can't set headers on segment requests,
// and relative URIs drop the playlist's query string. Mounted at
// GET /api/v1/hls/:fileId/playlist.m3u8.
func (h *ReaderHandler) HLSPlaylist(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	target, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}
	if target.FileType != domain.FileTypeVideo {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "file is not a video")
	}

	url := fmt.Sprintf("%s/engine/hls/%s/%d/playlist.m3u8", h.engineURL, target.InfoHash, target.FileIndex)
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, url, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "build upstream request")
	}
	resp, err := h.http.Do(req)
	if err != nil {
		h.log.Warn().Err(err).Str("url", url).Msg("engine playlist failed")
		return fiber.NewError(fiber.StatusBadGateway, "engine unreachable")
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, "read engine playlist")
	}
	if resp.StatusCode != http.StatusOK {
		// Pass through 503 + Retry-After while the file is still downloading.
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			c.Set("Retry-After", ra)
		}
		c.Status(resp.StatusCode)
		return c.Send(body)
	}

	// Append ?token=&audio= to each segment URI (non-comment, non-empty line).
	q := "?token=" + neturl.QueryEscape(c.Query("token"))
	if a := c.Query("audio"); a != "" {
		q += "&audio=" + neturl.QueryEscape(a)
	}
	var b strings.Builder
	for _, line := range strings.Split(string(body), "\n") {
		if t := strings.TrimSpace(line); t != "" && !strings.HasPrefix(t, "#") {
			b.WriteString(t + q + "\n")
		} else {
			b.WriteString(line + "\n")
		}
	}
	c.Set("Content-Type", "application/vnd.apple.mpegurl")
	c.Set("Cache-Control", "no-cache")
	return c.SendString(b.String())
}

// HLSSegment proxies one MPEG-TS segment encoded on-demand by the engine.
// Mounted at GET /api/v1/hls/:fileId/seg/:seg.
func (h *ReaderHandler) HLSSegment(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	seg, err := strconv.Atoi(c.Params("seg"))
	if err != nil || seg < 0 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid segment")
	}
	target, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}
	url := fmt.Sprintf("%s/engine/hls/%s/%d/seg/%d", h.engineURL, target.InfoHash, target.FileIndex, seg)
	if a := c.Query("audio"); a != "" {
		url += "?audio=" + neturl.QueryEscape(a)
	}
	return h.proxyUpstream(c, url, "video/mp2t", false)
}

// proxyUpstream performs the HTTP proxy to the engine, forwarding the body
// and relevant headers. If forwardRange is true, the client's Range header
// is copied upstream.
func (h *ReaderHandler) proxyUpstream(c *fiber.Ctx, url, fallbackMime string, forwardRange bool) error {
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, url, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "build upstream request")
	}
	if forwardRange {
		if r := c.Get("Range"); r != "" {
			req.Header.Set("Range", r)
		}
	}

	resp, err := h.http.Do(req)
	if err != nil {
		h.log.Warn().Err(err).Str("url", url).Msg("engine stream failed")
		return fiber.NewError(fiber.StatusBadGateway, "engine unreachable")
	}
	defer resp.Body.Close()

	for _, k := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Transfer-Encoding", "Cache-Control", "Retry-After"} {
		if v := resp.Header.Get(k); v != "" {
			c.Set(k, v)
		}
	}
	if fallbackMime != "" && c.Get(fiber.HeaderContentType) == "" {
		c.Set(fiber.HeaderContentType, fallbackMime)
	}
	c.Status(resp.StatusCode)

	_, err = io.Copy(c.Response().BodyWriter(), resp.Body)
	return err
}
