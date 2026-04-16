package handler

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/service"
)

type AuthHandler struct {
	log  zerolog.Logger
	auth service.AuthService
}

func NewAuthHandler(log zerolog.Logger, auth service.AuthService) *AuthHandler {
	return &AuthHandler{log: log, auth: auth}
}

type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type userDTO struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type loginResponse struct {
	AccessToken  string  `json:"accessToken"`
	RefreshToken string  `json:"refreshToken"`
	User         userDTO `json:"user"`
}

func toUserDTO(u *domain.User) userDTO {
	return userDTO{
		ID:       u.ID.String(),
		Username: u.Username,
		Email:    u.Email,
		Role:     string(u.Role),
	}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	u, err := h.auth.Register(c.Context(), req.Username, req.Email, req.Password)
	if err != nil {
		return mapAuthError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(toUserDTO(u))
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}

	access, refresh, u, err := h.auth.Login(c.Context(), req.Email, req.Password)
	if err != nil {
		return mapAuthError(err)
	}
	return c.JSON(loginResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toUserDTO(u),
	})
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req refreshRequest
	if err := c.BodyParser(&req); err != nil || req.RefreshToken == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing refresh token")
	}

	access, err := h.auth.Refresh(c.Context(), req.RefreshToken)
	if err != nil {
		return mapAuthError(err)
	}
	return c.JSON(fiber.Map{"accessToken": access})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// Stateless JWT: client discards tokens. A server-side blocklist via Redis
	// can be added later when we need revoke-on-logout semantics.
	return c.SendStatus(fiber.StatusNoContent)
}

func mapAuthError(err error) error {
	var de *domain.Error
	if !errors.As(err, &de) {
		return err
	}
	switch de.Code {
	case domain.ErrInvalidInput:
		return fiber.NewError(fiber.StatusUnprocessableEntity, de.Message)
	case domain.ErrUnauthorized:
		return fiber.NewError(fiber.StatusUnauthorized, de.Message)
	case domain.ErrConflict:
		return fiber.NewError(fiber.StatusConflict, de.Message)
	case domain.ErrNotFound:
		return fiber.NewError(fiber.StatusNotFound, de.Message)
	default:
		return err
	}
}
