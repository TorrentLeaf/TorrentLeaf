package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

type LibraryHandler struct {
	log zerolog.Logger
	svc service.LibraryService
}

func NewLibraryHandler(log zerolog.Logger, svc service.LibraryService) *LibraryHandler {
	return &LibraryHandler{log: log, svc: svc}
}

type libraryCardDTO struct {
	ID          string  `json:"id"`
	SessionID   string  `json:"sessionId"`
	Title       string  `json:"title"`
	CoverURL    string  `json:"coverUrl,omitempty"`
	Type        string  `json:"type"`
	AddedAt     string  `json:"addedAt"`
	IsFavorite  bool    `json:"isFavorite"`
	CurrentPage int     `json:"currentPage"`
	TotalPages  int     `json:"totalPages"`
	LastReadAt  *string `json:"lastReadAt,omitempty"`
}

type addLibraryRequest struct {
	SessionID string `json:"sessionId"`
	Type      string `json:"type"`
	Title     string `json:"title"`
}

func (h *LibraryHandler) List(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	filter := service.ListFilter{
		Type:          domain.LibraryItemType(c.Query("type")),
		FavoritesOnly: c.Query("favorites") == "true",
	}
	if filter.Type == "all" {
		filter.Type = ""
	}
	cards, err := h.svc.List(c.Context(), userID, filter)
	if err != nil {
		return mapTorrentError(err)
	}
	out := make([]libraryCardDTO, 0, len(cards))
	for _, card := range cards {
		out = append(out, toLibraryCardDTO(card))
	}
	return c.JSON(out)
}

func (h *LibraryHandler) Add(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	var req addLibraryRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	sessionID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "invalid sessionId")
	}
	item, err := h.svc.Add(c.Context(), userID, sessionID, domain.LibraryItemType(req.Type), req.Title)
	if err != nil {
		return mapTorrentError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(libraryCardDTO{
		ID:        item.ID.String(),
		SessionID: item.SessionID.String(),
		Title:     item.Title,
		CoverURL:  item.CoverURL,
		Type:      string(item.Type),
		AddedAt:   item.AddedAt.UTC().Format(time.RFC3339),
	})
}

func (h *LibraryHandler) Remove(c *fiber.Ctx) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.Remove(c.Context(), userID, id); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *LibraryHandler) AddFavorite(c *fiber.Ctx) error {
	return h.setFavorite(c, true)
}

func (h *LibraryHandler) RemoveFavorite(c *fiber.Ctx) error {
	return h.setFavorite(c, false)
}

func (h *LibraryHandler) setFavorite(c *fiber.Ctx, favorite bool) error {
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.SetFavorite(c.Context(), userID, id, favorite); err != nil {
		return mapTorrentError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func toLibraryCardDTO(c service.LibraryCard) libraryCardDTO {
	dto := libraryCardDTO{
		ID:          c.ID.String(),
		SessionID:   c.SessionID.String(),
		Title:       c.Title,
		CoverURL:    c.CoverURL,
		Type:        string(c.Type),
		AddedAt:     c.AddedAt.UTC().Format(time.RFC3339),
		IsFavorite:  c.IsFavorite,
		CurrentPage: c.CurrentPage,
		TotalPages:  c.TotalPages,
	}
	if c.LastReadAt != nil {
		s := c.LastReadAt.UTC().Format(time.RFC3339)
		dto.LastReadAt = &s
	}
	return dto
}
