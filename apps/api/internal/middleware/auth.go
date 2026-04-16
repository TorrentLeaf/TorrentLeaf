package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/service"
)

const (
	CtxUserID = "auth.userID"
	CtxRole   = "auth.role"
)

// RequireAuth validates the Authorization: Bearer <access-token> header and
// injects the authenticated user ID and role into the Fiber context.
func RequireAuth(auth service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token, err := bearerToken(c)
		if err != nil {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
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
// Authorization header for non-browser callers (e.g. integration tests).
func RequireAuthWS(auth service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := strings.TrimSpace(c.Query("token"))
		if token == "" {
			t, err := bearerToken(c)
			if err != nil {
				return fiber.NewError(fiber.StatusUnauthorized, err.Error())
			}
			token = t
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

func bearerToken(c *fiber.Ctx) (string, error) {
	h := c.Get("Authorization")
	if h == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "missing authorization header")
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(h, prefix) {
		return "", fiber.NewError(fiber.StatusUnauthorized, "invalid authorization scheme")
	}
	token := strings.TrimSpace(h[len(prefix):])
	if token == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "empty bearer token")
	}
	return token, nil
}
