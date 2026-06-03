package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

type SettingsHandler struct {
	log zerolog.Logger
	svc service.SettingsService
}

func NewSettingsHandler(log zerolog.Logger, svc service.SettingsService) *SettingsHandler {
	return &SettingsHandler{log: log, svc: svc}
}

type settingsDTO struct {
	DownloadPath       string `json:"downloadPath"`
	DefaultReadingMode string `json:"defaultReadingMode"`
	DefaultFitMode     string `json:"defaultFitMode"`
	ReadingDirection   string `json:"readingDirection"`
	AutoAddLibrary     bool   `json:"autoAddLibrary"`
	ReaderBackground   string `json:"readerBackground"`
}

func (h *SettingsHandler) Get(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	s, err := h.svc.Get(c.Context(), userID)
	if err != nil {
		return mapTorrentError(err)
	}
	return c.JSON(settingsDTO{
		DownloadPath:       s.DownloadPath,
		DefaultReadingMode: s.DefaultReadingMode,
		DefaultFitMode:     s.DefaultFitMode,
		ReadingDirection:   s.ReadingDirection,
		AutoAddLibrary:     s.AutoAddLibrary,
		ReaderBackground:   s.ReaderBackground,
	})
}

func (h *SettingsHandler) Update(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	var req service.SettingsUpdate
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	s, err := h.svc.Update(c.Context(), userID, req)
	if err != nil {
		return mapTorrentError(err)
	}
	return c.JSON(settingsDTO{
		DownloadPath:       s.DownloadPath,
		DefaultReadingMode: s.DefaultReadingMode,
		DefaultFitMode:     s.DefaultFitMode,
		ReadingDirection:   s.ReadingDirection,
		AutoAddLibrary:     s.AutoAddLibrary,
		ReaderBackground:   s.ReaderBackground,
	})
}
