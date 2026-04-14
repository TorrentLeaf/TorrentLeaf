package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type ReaderHandler struct {
	log zerolog.Logger
}

func NewReaderHandler(log zerolog.Logger) *ReaderHandler {
	return &ReaderHandler{log: log}
}

func (h *ReaderHandler) GetPages(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *ReaderHandler) StreamPage(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}
