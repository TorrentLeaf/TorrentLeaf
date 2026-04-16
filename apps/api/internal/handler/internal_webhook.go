package handler

import (
	"crypto/subtle"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/seuuser/torrentleaf/api/internal/service"
)

// InternalWebhookHandler handles callbacks from the torrent-engine. Authenticated
// via the X-Webhook-Secret header; this endpoint group is NOT exposed to end
// users — only to the engine on the internal Docker network.
type InternalWebhookHandler struct {
	log    zerolog.Logger
	svc    service.TorrentService
	secret string
}

func NewInternalWebhookHandler(log zerolog.Logger, svc service.TorrentService, secret string) *InternalWebhookHandler {
	return &InternalWebhookHandler{log: log, svc: svc, secret: secret}
}

// RequireSecret returns a middleware that validates the shared webhook secret.
// Uses constant-time comparison to avoid timing leaks.
func (h *InternalWebhookHandler) RequireSecret() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if h.secret == "" {
			return fiber.NewError(fiber.StatusServiceUnavailable, "webhooks disabled: no secret configured")
		}
		got := c.Get("X-Webhook-Secret")
		if subtle.ConstantTimeCompare([]byte(got), []byte(h.secret)) != 1 {
			return fiber.ErrUnauthorized
		}
		return c.Next()
	}
}

type metadataFileDTO struct {
	Index    int    `json:"index"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	Length   int64  `json:"length"`
	MimeType string `json:"mimeType"`
	FileType string `json:"fileType"`
}

type metadataRequest struct {
	Name        string            `json:"name"`
	TotalLength int64             `json:"totalLength"`
	Files       []metadataFileDTO `json:"files"`
}

// Metadata is called by the engine once the swarm has yielded metadata and the
// file list is known. Path: POST /internal/torrents/:infoHash/metadata
func (h *InternalWebhookHandler) Metadata(c *fiber.Ctx) error {
	infoHash := c.Params("infoHash")
	if infoHash == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing infoHash")
	}

	var req metadataRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	files := make([]service.MetadataFile, 0, len(req.Files))
	for _, f := range req.Files {
		files = append(files, service.MetadataFile{
			Index:    f.Index,
			Name:     f.Name,
			Path:     f.Path,
			Length:   f.Length,
			MimeType: f.MimeType,
			FileType: f.FileType,
		})
	}

	if err := h.svc.ApplyMetadata(c.Context(), infoHash, req.Name, req.TotalLength, files); err != nil {
		h.log.Error().Err(err).Str("infoHash", infoHash).Msg("apply metadata failed")
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}
