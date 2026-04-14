package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

type AuthHandler struct {
	log zerolog.Logger
}

func NewAuthHandler(log zerolog.Logger) *AuthHandler {
	return &AuthHandler{log: log}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	return fiber.ErrNotImplemented
}
