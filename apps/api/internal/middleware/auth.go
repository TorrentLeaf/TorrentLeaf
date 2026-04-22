package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

const (
	CtxUserID = "auth.userID"
	CtxRole   = "auth.role"

	// CookieAccessToken is the cookie name the auth handler writes on login.
	// Duplicated here (instead of imported from handler) to avoid a handler →
	// middleware import cycle via RequireAuth.
	CookieAccessToken = "access_token"
)

// RequireAuth validates the access token from either the
// Authorization: Bearer <token> header (non-browser clients) or the
// httpOnly access_token cookie (browser clients) and injects the authenticated
// user ID and role into the Fiber context.
func RequireAuth(auth service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := tokenFromCookieOrHeader(c)
		if token == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
		}
		claims, err := auth.ParseAccessToken(token)
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired token")
		}
		c.Locals(CtxUserID, claims.UserID)
		c.Locals(CtxRole, claims.Role)
		return c.Next()
	}
}

// RequireAuthWS is like RequireAuth but additionally accepts the access token
// via the ?token= query string — the browser WebSocket API cannot set custom
// headers, so clients pass the token on the URL. Token falls back to the
// cookie or Authorization header for non-browser callers (e.g. integration
// tests).
func RequireAuthWS(auth service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := strings.TrimSpace(c.Query("token"))
		if token == "" {
			token = tokenFromCookieOrHeader(c)
		}
		if token == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
		}
		claims, err := auth.ParseAccessToken(token)
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired token")
		}
		c.Locals(CtxUserID, claims.UserID)
		c.Locals(CtxRole, claims.Role)
		return c.Next()
	}
}

// RequireAdmin must be chained after RequireAuth.
func RequireAdmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		role, _ := c.Locals(CtxRole).(domain.Role)
		if role != domain.RoleAdmin {
			return fiber.NewError(fiber.StatusForbidden, "admin access required")
		}
		return c.Next()
	}
}

// UserID returns the authenticated user ID from the Fiber context. Panics are
// avoided because middleware guarantees the value is present on protected routes.
func UserID(c *fiber.Ctx) (uuid.UUID, bool) {
	id, ok := c.Locals(CtxUserID).(uuid.UUID)
	return id, ok
}

// tokenFromCookieOrHeader reads the access token from the httpOnly cookie
// first (browser default) then falls back to the Authorization: Bearer header
// for non-browser clients. Returns empty string when neither is present or
// well-formed — callers decide how to surface the 401.
func tokenFromCookieOrHeader(c *fiber.Ctx) string {
	if v := strings.TrimSpace(c.Cookies(CookieAccessToken)); v != "" {
		return v
	}
	h := c.Get("Authorization")
	if h == "" {
		return ""
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(h, prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}
