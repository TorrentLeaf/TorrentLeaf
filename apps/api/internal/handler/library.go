package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type LibraryHandler struct {
	log zerolog.Logger
}

func NewLibraryHandler(log zerolog.Logger) *LibraryHandler {
	return &LibraryHandler{log: log}
}

func (h *LibraryHandler) List(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *LibraryHandler) Add(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *LibraryHandler) Remove(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}
