package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type AdminHandler struct {
	log zerolog.Logger
}

func NewAdminHandler(log zerolog.Logger) *AdminHandler {
	return &AdminHandler{log: log}
}

func (h *AdminHandler) ListTorrents(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}
