package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

// fakeAuthService is the minimum AuthService implementation needed by the
// auth handler and RequireAuth middleware tests. Only the fields exercised
// by a given test need a non-nil function.
type fakeAuthService struct {
	registerFn func(context.Context, string, string, string) (*domain.User, error)
	loginFn    func(context.Context, string, string) (string, string, *domain.User, error)
	refreshFn  func(context.Context, string) (service.RefreshResult, error)
	logoutFn   func(context.Context, string) error
	parseFn    func(string) (*service.Claims, error)
}

func (f *fakeAuthService) Register(ctx context.Context, u, e, p string) (*domain.User, error) {
	if f.registerFn != nil {
		return f.registerFn(ctx, u, e, p)
	}
	return nil, errors.New("Register not implemented in fake")
}

func (f *fakeAuthService) Login(ctx context.Context, e, p string) (string, string, *domain.User, error) {
	if f.loginFn != nil {
		return f.loginFn(ctx, e, p)
	}
	return "", "", nil, errors.New("Login not implemented in fake")
}

func (f *fakeAuthService) Refresh(ctx context.Context, t string) (service.RefreshResult, error) {
	if f.refreshFn != nil {
		return f.refreshFn(ctx, t)
	}
	return service.RefreshResult{}, errors.New("Refresh not implemented in fake")
}

func (f *fakeAuthService) Logout(ctx context.Context, t string) error {
	if f.logoutFn != nil {
		return f.logoutFn(ctx, t)
	}
	return nil
}

func (f *fakeAuthService) ParseAccessToken(t string) (*service.Claims, error) {
	if f.parseFn != nil {
		return f.parseFn(t)
	}
	return nil, errors.New("ParseAccessToken not implemented in fake")
}

// counterRateLimit mimics middleware.RateLimit for handler-level tests
// without pulling in Redis: every call increments an in-memory counter and
// requests past the limit return 429. A fresh middleware = fresh counter,
// so tests remain independent.
func counterRateLimit(limit int) fiber.Handler {
	var mu sync.Mutex
	var count int
	return func(c *fiber.Ctx) error {
		mu.Lock()
		count++
		n := count
		mu.Unlock()
		if n > limit {
			return fiber.NewError(fiber.StatusTooManyRequests, "too many requests")
		}
		return c.Next()
	}
}

// newTestApp mirrors the production ErrorHandler so tests see the same
// {"error": "..."} JSON shape instead of Fiber's default text.
func newTestApp() *fiber.App {
	return fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			msg := "internal error"
			var fe *fiber.Error
			if errors.As(err, &fe) {
				code = fe.Code
				msg = fe.Message
			}
			return c.Status(code).JSON(fiber.Map{"error": msg})
		},
	})
}

func postJSON(t *testing.T, app *fiber.App, path, body string) (int, string) {
	t.Helper()
	req := httptest.NewRequest("POST", path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request %s: %v", path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(raw)
}

// TestLoginBruteForceRateLimitedOnSixthAttempt locks in the rate-limit rule
// from routes: 5 login attempts per minute, 6th rejected with 429.
func TestLoginBruteForceRateLimitedOnSixthAttempt(t *testing.T) {
	svc := &fakeAuthService{
		loginFn: func(context.Context, string, string) (string, string, *domain.User, error) {
			return "", "", nil, domain.NewError(domain.ErrUnauthorized, "invalid credentials", nil)
		},
	}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/api/v1/auth/login", counterRateLimit(5), h.Login)

	body := `{"email":"alice@example.com","password":"bad"}`
	for i := 1; i <= 5; i++ {
		code, _ := postJSON(t, app, "/api/v1/auth/login", body)
		if code != fiber.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i, code)
		}
	}
	code, _ := postJSON(t, app, "/api/v1/auth/login", body)
	if code != fiber.StatusTooManyRequests {
		t.Fatalf("6th attempt: expected 429, got %d", code)
	}
}

// TestLoginWrongPasswordReturnsGenericUnauthorized: the response must be 401
// with a message that does not confirm the password was wrong (vs. email
// unknown, account locked, etc).
func TestLoginWrongPasswordReturnsGenericUnauthorized(t *testing.T) {
	svc := &fakeAuthService{
		loginFn: func(context.Context, string, string) (string, string, *domain.User, error) {
			return "", "", nil, domain.NewError(domain.ErrUnauthorized, "invalid credentials", nil)
		},
	}
	h := NewAuthHandler(zerolog.Nop(), svc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/api/v1/auth/login", h.Login)

	code, body := postJSON(t, app, "/api/v1/auth/login",
		`{"email":"alice@example.com","password":"guess"}`)
	if code != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d body=%s", code, body)
	}

	var out struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	lowered := strings.ToLower(out.Error)
	for _, banned := range []string{"wrong password", "incorrect password", "password is", "bad password"} {
		if strings.Contains(lowered, banned) {
			t.Fatalf("response leaks password-specific detail %q: %s", banned, out.Error)
		}
	}
}

// TestLoginUnknownUserReturns401NotLeakingExistence: email that doesn't exist
// must look exactly like "wrong password" (same 401, same message). Otherwise
// an attacker can enumerate users via the login endpoint.
func TestLoginUnknownUserReturns401NotLeakingExistence(t *testing.T) {
	// Both cases return ErrUnauthorized with the same message in auth_impl;
	// the test pins that the handler doesn't translate them differently.
	unknownSvc := &fakeAuthService{
		loginFn: func(context.Context, string, string) (string, string, *domain.User, error) {
			return "", "", nil, domain.NewError(domain.ErrUnauthorized, "invalid credentials", nil)
		},
	}
	h := NewAuthHandler(zerolog.Nop(), unknownSvc, AuthHandlerOptions{})
	app := newTestApp()
	app.Post("/api/v1/auth/login", h.Login)

	code, body := postJSON(t, app, "/api/v1/auth/login",
		`{"email":"ghost@example.com","password":"whatever12"}`)
	if code != fiber.StatusUnauthorized {
		t.Fatalf("expected 401 for unknown user, got %d body=%s", code, body)
	}
	if code == fiber.StatusNotFound {
		t.Fatalf("unknown user returned 404 — reveals existence")
	}
	// The body should be the same generic "invalid credentials" used for
	// every credential failure.
	if !strings.Contains(strings.ToLower(body), "invalid credentials") {
		t.Fatalf("expected generic message in body, got %s", body)
	}
}

// newRealAuthSvcForTokens builds a real authService configured just enough
// to parse access tokens. Users/refresh repos are nil because
// ParseAccessToken never touches them.
func newRealAuthSvcForTokens(secret []byte) service.AuthService {
	return service.NewAuthService(nil, nil, service.AuthConfig{
		AccessSecret:  secret,
		RefreshSecret: []byte("unused-refresh-secret-32-chars-xxx"),
		AccessTTL:     15 * time.Minute,
		RefreshTTL:    time.Hour,
	})
}

// signAccessClaims produces a JWT the real AuthService would accept — the
// test can then flip one property (expiry, signing secret) to create the
// failure mode we're asserting on.
func signAccessClaims(t *testing.T, secret []byte, exp time.Time) string {
	t.Helper()
	claims := service.Claims{
		UserID: uuid.New(),
		Role:   domain.RoleUser,
		Type:   "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "torrentleaf",
			Subject:   uuid.New().String(),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			NotBefore: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(secret)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

// TestExpiredAccessTokenReturns401 — RequireAuth must reject tokens whose
// exp is in the past.
func TestExpiredAccessTokenReturns401(t *testing.T) {
	secret := []byte("test-access-secret-32-chars-xxxxx")
	svc := newRealAuthSvcForTokens(secret)

	expired := signAccessClaims(t, secret, time.Now().Add(-time.Minute))

	app := newTestApp()
	app.Get("/protected", middleware.RequireAuth(svc), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+expired)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %d", resp.StatusCode)
	}

	// Security skill §1: expired and invalid-sig must be indistinguishable to
	// the client. We pin that here by comparing bodies across the two cases.
	expiredBody, _ := io.ReadAll(resp.Body)

	wrongSecret := []byte("different-secret-32-chars-yyyyyyy")
	badSig := signAccessClaims(t, wrongSecret, time.Now().Add(time.Hour))
	req2 := httptest.NewRequest("GET", "/protected", nil)
	req2.Header.Set("Authorization", "Bearer "+badSig)
	resp2, err := app.Test(req2)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp2.Body.Close()
	badSigBody, _ := io.ReadAll(resp2.Body)

	if string(expiredBody) != string(badSigBody) {
		t.Fatalf("expired and invalid-sig responses differ — attacker can distinguish\nexpired:  %s\nbad-sig:  %s",
			expiredBody, badSigBody)
	}
}

// TestInvalidSignatureTokenReturns401 — a token signed with the wrong secret
// is indistinguishable from a forgery and must be rejected.
func TestInvalidSignatureTokenReturns401(t *testing.T) {
	secret := []byte("test-access-secret-32-chars-xxxxx")
	wrongSecret := []byte("different-secret-32-chars-yyyyyyy")
	svc := newRealAuthSvcForTokens(secret)

	badSig := signAccessClaims(t, wrongSecret, time.Now().Add(time.Hour))

	app := newTestApp()
	app.Get("/protected", middleware.RequireAuth(svc), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+badSig)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401 for bad-signature token, got %d", resp.StatusCode)
	}
}
