package handler

import (
	"io"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

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
	Index    int    `json:"index"`
	FileID   string `json:"fileId"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Length   int64  `json:"length"`
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
	pages, err := h.svc.ListPages(c.Context(), userID, sessionID)
	if err != nil {
		return mapTorrentError(err)
	}
	out := make([]pageDTO, 0, len(pages))
	for _, p := range pages {
		out = append(out, pageDTO{
			Index:    p.Index,
			FileID:   p.FileID.String(),
			Name:     p.Name,
			MimeType: p.MimeType,
			Length:   p.Length,
		})
	}
	return c.JSON(out)
}

// StreamFile proxies the image bytes from the torrent-engine. Forwards the
// Range header so browsers can seek within large images (rare for manga, but
// important for CBZ extraction once supported).
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

	infoHash, fileIndex, mimeType, err := h.svc.ResolveStreamTarget(c.Context(), userID, fileID)
	if err != nil {
		return mapTorrentError(err)
	}

	url := h.engineURL + "/engine/stream/" + infoHash + "/" + itoa(fileIndex)
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, url, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "build upstream request")
	}
	if r := c.Get("Range"); r != "" {
		req.Header.Set("Range", r)
	}

	resp, err := h.http.Do(req)
	if err != nil {
		h.log.Warn().Err(err).Str("url", url).Msg("engine stream failed")
		return fiber.NewError(fiber.StatusBadGateway, "engine unreachable")
	}
	defer resp.Body.Close()

	// Forward status + relevant headers.
	for _, k := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
		if v := resp.Header.Get(k); v != "" {
			c.Set(k, v)
		}
	}
	if mimeType != "" && c.Get(fiber.HeaderContentType) == "" {
		c.Set(fiber.HeaderContentType, mimeType)
	}
	c.Status(resp.StatusCode)

	_, err = io.Copy(c.Response().BodyWriter(), resp.Body)
	return err
}

// StreamPage is the legacy route: GET /api/v1/stream/:fileId/:page.
// Kept for archive-type readers that address pages within a file; for images
// it just delegates to StreamFile and ignores :page.
func (h *ReaderHandler) StreamPage(c *fiber.Ctx) error {
	return h.StreamFile(c)
}

func itoa(n int) string {
	// tiny allocation-free itoa for positive ints
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
