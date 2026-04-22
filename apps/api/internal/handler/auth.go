package handler

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

// Cookie names — shared by the handler (write side) and the auth middleware
// (read side via middleware.CookieAccessToken).
const (
	CookieAccessToken  = "access_token"
	CookieRefreshToken = "refresh_token"
)

type AuthHandler struct {
	log        zerolog.Logger
	auth       service.AuthService
	production bool
	accessTTL  time.Duration
	refreshTTL time.Duration
}

type AuthHandlerOptions struct {
	Production bool
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

func NewAuthHandler(log zerolog.Logger, auth service.AuthService, opts AuthHandlerOptions) *AuthHandler {
	if opts.AccessTTL == 0 {
		opts.AccessTTL = 15 * time.Minute
	}
	if opts.RefreshTTL == 0 {
		opts.RefreshTTL = 7 * 24 * time.Hour
	}
	return &AuthHandler{
		log:        log,
		auth:       auth,
		production: opts.Production,
		accessTTL:  opts.AccessTTL,
		refreshTTL: opts.RefreshTTL,
	}
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

	h.setAuthCookies(c, access, refresh)
	// Tokens are still returned in the JSON body so non-browser API clients
	// (mobile, CLI) that cannot keep cookies can use the Authorization header.
	return c.JSON(loginResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		User:         toUserDTO(u),
	})
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	refresh := h.readRefreshToken(c)
	if refresh == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing refresh token")
	}

	result, err := h.auth.Refresh(c.Context(), refresh)
	if err != nil {
		// A rejected refresh should also clear the browser's cookie copy so
		// the client stops replaying a bad token.
		h.clearAuthCookies(c)
		return mapAuthError(err)
	}

	h.setAuthCookies(c, result.Access, result.Refresh)
	return c.JSON(fiber.Map{
		"accessToken":  result.Access,
		"refreshToken": result.Refresh,
	})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// Revoke the refresh token in the DB so it can't be replayed.
	if refresh := h.readRefreshToken(c); refresh != "" {
		if err := h.auth.Logout(c.Context(), refresh); err != nil {
			h.log.Warn().Err(err).Msg("logout revoke failed")
		}
	}
	h.clearAuthCookies(c)
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *AuthHandler) readRefreshToken(c *fiber.Ctx) string {
	if v := c.Cookies(CookieRefreshToken); v != "" {
		return v
	}
	var req refreshRequest
	if err := c.BodyParser(&req); err == nil && req.RefreshToken != "" {
		return req.RefreshToken
	}
	return ""
}

func (h *AuthHandler) setAuthCookies(c *fiber.Ctx, access, refresh string) {
	c.Cookie(&fiber.Cookie{
		Name:     CookieAccessToken,
		Value:    access,
		Path:     "/",
		HTTPOnly: true,
		Secure:   h.production,
		SameSite: "Strict",
		MaxAge:   int(h.accessTTL.Seconds()),
	})
	c.Cookie(&fiber.Cookie{
		Name:     CookieRefreshToken,
		Value:    refresh,
		// Scoped to the auth endpoints — the cookie never rides on normal API
		// requests, reducing exposure if a downstream handler ever logs headers.
		Path:     "/api/v1/auth",
		HTTPOnly: true,
		Secure:   h.production,
		SameSite: "Strict",
		MaxAge:   int(h.refreshTTL.Seconds()),
	})
}

func (h *AuthHandler) clearAuthCookies(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     CookieAccessToken,
		Value:    "",
		Path:     "/",
		HTTPOnly: true,
		Secure:   h.production,
		SameSite: "Strict",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
	c.Cookie(&fiber.Cookie{
		Name:     CookieRefreshToken,
		Value:    "",
		Path:     "/api/v1/auth",
		HTTPOnly: true,
		Secure:   h.production,
		SameSite: "Strict",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
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
		return fiber.NewError(fiber.StatusInternalServerError, "internal error")
	}
}
