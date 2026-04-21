package handler

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/middleware"
	"github.com/seuuser/torrentleaf/api/internal/service"
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
	url := fmt.Sprintf("%s/engine/stream/%s/%d", h.engineURL, target.InfoHash, target.FileIndex)
	return h.proxyUpstream(c, url, target.MimeType, true)
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

	if target.FileType != domain.FileTypeCBZ {
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

	for _, k := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
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
