package handler

import (
	"context"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

func newUser() *domain.User {
	return &domain.User{ID: uuid.New(), Username: "alice", Email: "alice@example.com", Role: domain.RoleUser}
}

func TestAuthHandler_RegisterSuccess(t *testing.T) {
	svc := &fakeAuthService{registerFn: func(context.Context, string, string, string) (*domain.User, error) {
		return newUser(), nil
	}}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/register", h.Register)
	code, body := postJSON(t, app, "/register", `{"username":"alice","email":"alice@example.com","password":"secret123"}`)
	if code != fiber.StatusCreated || !strings.Contains(body, `"username":"alice"`) {
		t.Fatalf("got %d body=%s", code, body)
	}
	// bad body
	if code, _ := postJSON(t, app, "/register", `notjson`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
}

func TestAuthHandler_RegisterErrorMapping(t *testing.T) {
	cases := []struct {
		code domain.ErrCode
		want int
	}{
		{domain.ErrConflict, fiber.StatusConflict},
		{domain.ErrInvalidInput, fiber.StatusUnprocessableEntity},
		{domain.ErrNotFound, fiber.StatusNotFound},
		{domain.ErrUnauthorized, fiber.StatusUnauthorized},
		{domain.ErrInternal, fiber.StatusInternalServerError},
	}
	for _, tc := range cases {
		svc := &fakeAuthService{registerFn: func(context.Context, string, string, string) (*domain.User, error) {
			return nil, domain.NewError(tc.code, "x", nil)
		}}
		h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
		app := newTestApp()
		app.Post("/register", h.Register)
		if code, _ := postJSON(t, app, "/register", `{"username":"a","email":"e","password":"p"}`); code != tc.want {
			t.Fatalf("code %s: want %d, got %d", tc.code, tc.want, code)
		}
	}
}

func TestAuthHandler_LoginSetsCookies(t *testing.T) {
	svc := &fakeAuthService{loginFn: func(context.Context, string, string) (string, string, *domain.User, error) {
		return "access-tok", "refresh-tok", newUser(), nil
	}}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/login", h.Login)
	code, body := postJSON(t, app, "/login", `{"email":"alice@example.com","password":"secret123"}`)
	if code != 200 || !strings.Contains(body, `"accessToken":"access-tok"`) {
		t.Fatalf("got %d body=%s", code, body)
	}
	// bad body
	if code, _ := postJSON(t, app, "/login", `notjson`); code != fiber.StatusBadRequest {
		t.Fatalf("bad body want 400, got %d", code)
	}
}

func TestAuthHandler_Refresh(t *testing.T) {
	svc := &fakeAuthService{refreshFn: func(context.Context, string) (service.RefreshResult, error) {
		return service.RefreshResult{Access: "new-a", Refresh: "new-r"}, nil
	}}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/refresh", h.Refresh)
	// via body
	code, body := postJSON(t, app, "/refresh", `{"refreshToken":"old-r"}`)
	if code != 200 || !strings.Contains(body, `"accessToken":"new-a"`) {
		t.Fatalf("got %d body=%s", code, body)
	}
	// missing token
	if code, _ := postJSON(t, app, "/refresh", `{}`); code != fiber.StatusBadRequest {
		t.Fatalf("missing token want 400, got %d", code)
	}
}

func TestAuthHandler_RefreshRejectedClearsCookies(t *testing.T) {
	svc := &fakeAuthService{refreshFn: func(context.Context, string) (service.RefreshResult, error) {
		return service.RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "revoked", nil)
	}}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/refresh", h.Refresh)
	if code, _ := postJSON(t, app, "/refresh", `{"refreshToken":"bad"}`); code != fiber.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

func TestAuthHandler_Logout(t *testing.T) {
	var revoked bool
	svc := &fakeAuthService{logoutFn: func(context.Context, string) error { revoked = true; return nil }}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/logout", h.Logout)
	if code, _ := postJSON(t, app, "/logout", `{"refreshToken":"r"}`); code != fiber.StatusNoContent {
		t.Fatalf("want 204, got %d", code)
	}
	if !revoked {
		t.Fatal("logout should revoke the refresh token")
	}
	// logout without a token is still 204 (idempotent)
	if code, _ := postJSON(t, app, "/logout", `{}`); code != fiber.StatusNoContent {
		t.Fatalf("empty logout want 204, got %d", code)
	}
}
