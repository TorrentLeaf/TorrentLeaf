package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

type ProgressHandler struct {
	log zerolog.Logger
	svc service.ProgressService
}

func NewProgressHandler(log zerolog.Logger, svc service.ProgressService) *ProgressHandler {
	return &ProgressHandler{log: log, svc: svc}
}

type progressDTO struct {
	FileID      string `json:"fileId"`
	CurrentPage int    `json:"currentPage"`
	TotalPages  int    `json:"totalPages"`
	ReadingMode string `json:"readingMode"`
	Location    string `json:"location,omitempty"`
	LastReadAt  string `json:"lastReadAt"`
}

type updateProgressRequest struct {
	CurrentPage int    `json:"currentPage"`
	TotalPages  int    `json:"totalPages"`
	ReadingMode string `json:"readingMode"`
	Location    string `json:"location"`
}

func toProgressDTO(p *domain.ReadingProgress) progressDTO {
	return progressDTO{
		FileID:      p.FileID.String(),
		CurrentPage: p.CurrentPage,
		TotalPages:  p.TotalPages,
		ReadingMode: string(p.ReadingMode),
		Location:    p.Location,
		LastReadAt:  p.LastReadAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

func (h *ProgressHandler) Get(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	p, err := h.svc.Get(c.Context(), userID, fileID)
	if err != nil {
		// 404 on no-progress-yet is noisy for the client; surface an empty body.
		var de *domain.Error
		if errors.As(err, &de) && de.Code == domain.ErrNotFound {
			return c.Status(fiber.StatusOK).JSON(progressDTO{
				FileID:      fileID.String(),
				CurrentPage: 0,
				ReadingMode: string(domain.ReadingModePaginated),
			})
		}
		return mapTorrentError(err)
	}
	return c.JSON(toProgressDTO(p))
}

func (h *ProgressHandler) Update(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	fileID, err := uuid.Parse(c.Params("fileId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid fileId")
	}
	var req updateProgressRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	p, err := h.svc.Update(c.Context(), userID, fileID, service.UpdateProgress{
		CurrentPage: req.CurrentPage,
		TotalPages:  req.TotalPages,
		Mode:        domain.ReadingMode(req.ReadingMode),
		Location:    req.Location,
	})
	if err != nil {
		return mapTorrentError(err)
	}
	return c.JSON(toProgressDTO(p))
}
