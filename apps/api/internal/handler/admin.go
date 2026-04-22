package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/service"
)

type AdminHandler struct {
	log zerolog.Logger
	svc service.AdminService
}

func NewAdminHandler(log zerolog.Logger, svc service.AdminService) *AdminHandler {
	return &AdminHandler{log: log, svc: svc}
}

type adminTorrentDTO struct {
	ID              string  `json:"id"`
	UserID          string  `json:"userId"`
	InfoHash        string  `json:"infoHash"`
	Name            string  `json:"name"`
	Status          string  `json:"status"`
	TotalSize       int64   `json:"totalSize"`
	DownloadedBytes int64   `json:"downloadedBytes"`
	PeersCount      int     `json:"peersCount"`
	DownloadSpeed   float64 `json:"downloadSpeed"`
	UploadSpeed     float64 `json:"uploadSpeed"`
	CreatedAt       string  `json:"createdAt"`
}

func (h *AdminHandler) ListTorrents(c *fiber.Ctx) error {
	sessions, err := h.svc.ListAllTorrents(c.Context())
	if err != nil {
		return mapTorrentError(err)
	}
	out := make([]adminTorrentDTO, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, adminTorrentDTO{
			ID:              s.ID.String(),
			UserID:          s.UserID.String(),
			InfoHash:        s.InfoHash,
			Name:            s.Name,
			Status:          string(s.Status),
			TotalSize:       s.TotalSize,
			DownloadedBytes: s.DownloadedBytes,
			PeersCount:      s.PeersCount,
			DownloadSpeed:   s.DownloadSpeed,
			UploadSpeed:     s.UploadSpeed,
			CreatedAt:       s.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return c.JSON(out)
}

func (h *AdminHandler) PauseTorrent(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.PauseTorrent(c.Context(), id); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *AdminHandler) ResumeTorrent(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.ResumeTorrent(c.Context(), id); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *AdminHandler) DeleteTorrent(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.DeleteTorrent(c.Context(), id); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}
