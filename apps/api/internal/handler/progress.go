package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type ProgressHandler struct {
	log zerolog.Logger
}

func NewProgressHandler(log zerolog.Logger) *ProgressHandler {
	return &ProgressHandler{log: log}
}

func (h *ProgressHandler) Get(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *ProgressHandler) Update(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}
