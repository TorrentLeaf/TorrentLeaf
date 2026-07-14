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

type TorrentHandler struct {
	log zerolog.Logger
	svc service.TorrentService
}

func NewTorrentHandler(log zerolog.Logger, svc service.TorrentService) *TorrentHandler {
	return &TorrentHandler{log: log, svc: svc}
}

type addTorrentRequest struct {
	MagnetURI string `json:"magnetURI"`
}

type setPriorityRequest struct {
	FileIndex int `json:"fileIndex"`
	Priority  int `json:"priority"`
}

type torrentFileDTO struct {
	ID       string `json:"id"`
	Index    int    `json:"index"`
	Name     string `json:"name"`
	Length   int64  `json:"length"`
	MimeType string `json:"mimeType"`
	FileType string `json:"fileType"`
	Priority int    `json:"priority"`
}

type torrentSessionDTO struct {
	ID              string           `json:"id"`
	InfoHash        string           `json:"infoHash"`
	Name            string           `json:"name"`
	Status          string           `json:"status"`
	TotalSize       int64            `json:"totalSize"`
	DownloadedBytes int64            `json:"downloadedBytes"`
	PeersCount      int              `json:"peersCount"`
	DownloadSpeed   float64          `json:"downloadSpeed"`
	UploadSpeed     float64          `json:"uploadSpeed"`
	Files           []torrentFileDTO `json:"files,omitempty"`
	CreatedAt       string           `json:"createdAt"`
}

func toSessionDTO(s *domain.TorrentSession) torrentSessionDTO {
	dto := torrentSessionDTO{
		ID:              s.ID.String(),
		InfoHash:        s.InfoHash,
		Name:            s.Name,
		Status:          string(s.Status),
		TotalSize:       s.TotalSize,
		DownloadedBytes: s.DownloadedBytes,
		PeersCount:      s.PeersCount,
		DownloadSpeed:   s.DownloadSpeed,
		UploadSpeed:     s.UploadSpeed,
		CreatedAt:       s.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
	for _, f := range s.Files {
		dto.Files = append(dto.Files, torrentFileDTO{
			ID:       f.ID.String(),
			Index:    f.Index,
			Name:     f.Name,
			Length:   f.Length,
			MimeType: f.MimeType,
			FileType: string(f.FileType),
			Priority: f.Priority,
		})
	}
	return dto
}

func (h *TorrentHandler) Add(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}

	var req addTorrentRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	session, err := h.svc.Add(c.Context(), userID, req.MagnetURI)
	if err != nil {
		return mapTorrentError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(toSessionDTO(session))
}

func (h *TorrentHandler) List(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	sessions, err := h.svc.List(c.Context(), userID)
	if err != nil {
		return mapTorrentError(err)
	}
	out := make([]torrentSessionDTO, 0, len(sessions))
	for i := range sessions {
		out = append(out, toSessionDTO(&sessions[i]))
	}
	return c.JSON(out)
}

func (h *TorrentHandler) Get(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	session, err := h.svc.Get(c.Context(), userID, id)
	if err != nil {
		return mapTorrentError(err)
	}
	return c.JSON(toSessionDTO(session))
}

func (h *TorrentHandler) Delete(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.Delete(c.Context(), userID, id); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *TorrentHandler) SetPriority(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var req setPriorityRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if err := h.svc.SetPriority(c.Context(), userID, id, req.FileIndex, req.Priority); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func mapTorrentError(err error) error {
	var de *domain.Error
	if !errors.As(err, &de) {
		return err
	}
	switch de.Code {
	case domain.ErrInvalidInput:
		return fiber.NewError(fiber.StatusUnprocessableEntity, de.Message)
	case domain.ErrNotFound:
		return fiber.NewError(fiber.StatusNotFound, de.Message)
	case domain.ErrConflict:
		return fiber.NewError(fiber.StatusConflict, de.Message)
	case domain.ErrUnavailable:
		return fiber.NewError(fiber.StatusServiceUnavailable, de.Message)
	case domain.ErrInsufficientStorage:
		return fiber.NewError(fiber.StatusInsufficientStorage, de.Message)
	case domain.ErrForbidden:
		return fiber.NewError(fiber.StatusForbidden, de.Message)
	case domain.ErrUnauthorized:
		return fiber.NewError(fiber.StatusUnauthorized, de.Message)
	default:
		// ErrInternal and unknown codes must not leak the underlying message
		// (it may include engine errors, SQL fragments, or upstream URLs).
		return fiber.NewError(fiber.StatusInternalServerError, "internal error")
	}
}
