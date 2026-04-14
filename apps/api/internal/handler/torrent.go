package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type TorrentHandler struct {
	log zerolog.Logger
}

func NewTorrentHandler(log zerolog.Logger) *TorrentHandler {
	return &TorrentHandler{log: log}
}

func (h *TorrentHandler) Add(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *TorrentHandler) List(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *TorrentHandler) Get(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *TorrentHandler) Delete(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *TorrentHandler) SetPriority(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}
