package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/service"
)

// fakeAuth implements service.AuthService but only ParseAccessToken is used by
// the middleware under test; the rest satisfy the interface.
type fakeAuth struct {
	service.AuthService
	claims *service.Claims
	err    error
}

func (f fakeAuth) ParseAccessToken(string) (*service.Claims, error) { return f.claims, f.err }

func newApp(h ...fiber.Handler) *fiber.App {
	app := fiber.New()
	handlers := append(h, func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	app.Get("/x", handlers...)
	return app
}

type fiberReq struct {
	headers map[string]string
	cookies map[string]string
	query   string
}

func req(t *testing.T, app *fiber.App, setup func(r *fiberReq)) int {
	t.Helper()
	fr := &fiberReq{headers: map[string]string{}, cookies: map[string]string{}}
	if setup != nil {
		setup(fr)
	}
	httpReq := httptest.NewRequest(fiber.MethodGet, "/x"+fr.query, nil)
	for k, v := range fr.headers {
		httpReq.Header.Set(k, v)
	}
	for k, v := range fr.cookies {
		httpReq.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	resp, err := app.Test(httpReq, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	return resp.StatusCode
}

func TestRequireAuth_NoToken401(t *testing.T) {
	app := newApp(RequireAuth(fakeAuth{}))
	if code := req(t, app, nil); code != fiber.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

func TestRequireAuth_BadToken401(t *testing.T) {
	app := newApp(RequireAuth(fakeAuth{err: errors.New("expired")}))
	code := req(t, app, func(r *fiberReq) { r.headers["Authorization"] = "Bearer sometoken" })
	if code != fiber.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

func TestRequireAuth_BearerOK(t *testing.T) {
	uid := uuid.New()
	app := fiber.New()
	app.Get("/x", RequireAuth(fakeAuth{claims: &service.Claims{UserID: uid, Role: domain.RoleUser}}), func(c *fiber.Ctx) error {
		got, ok := UserID(c)
		if !ok || got != uid {
			return fiber.NewError(fiber.StatusInternalServerError, "missing uid")
		}
		return c.SendStatus(fiber.StatusOK)
	})
	code := req(t, app, func(r *fiberReq) { r.headers["Authorization"] = "Bearer good" })
	if code != fiber.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
}

func TestRequireAuth_CookieOK(t *testing.T) {
	app := newApp(RequireAuth(fakeAuth{claims: &service.Claims{UserID: uuid.New(), Role: domain.RoleUser}}))
	code := req(t, app, func(r *fiberReq) { r.cookies[CookieAccessToken] = "cookieval" })
	if code != fiber.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
}

func TestRequireAuth_MalformedHeader401(t *testing.T) {
	app := newApp(RequireAuth(fakeAuth{claims: &service.Claims{}}))
	code := req(t, app, func(r *fiberReq) { r.headers["Authorization"] = "Token abc" })
	if code != fiber.StatusUnauthorized {
		t.Fatalf("want 401 for non-Bearer header, got %d", code)
	}
}

func TestRequireAuthWS_QueryToken(t *testing.T) {
	app := newApp(RequireAuthWS(fakeAuth{claims: &service.Claims{UserID: uuid.New(), Role: domain.RoleUser}}))
	code := req(t, app, func(r *fiberReq) { r.query = "?token=fromquery" })
	if code != fiber.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
}

func TestRequireAuthWS_NoToken401(t *testing.T) {
	app := newApp(RequireAuthWS(fakeAuth{}))
	if code := req(t, app, nil); code != fiber.StatusUnauthorized {
		t.Fatalf("want 401, got %d", code)
	}
}

func TestRequireAuthWS_CookieFallback(t *testing.T) {
	app := newApp(RequireAuthWS(fakeAuth{claims: &service.Claims{UserID: uuid.New(), Role: domain.RoleUser}}))
	code := req(t, app, func(r *fiberReq) { r.cookies[CookieAccessToken] = "ck" })
	if code != fiber.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
}

func TestRequireAdmin(t *testing.T) {
	admin := fiber.New()
	admin.Get("/x", func(c *fiber.Ctx) error { c.Locals(CtxRole, domain.RoleAdmin); return c.Next() }, RequireAdmin(), func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	if code := req(t, admin, nil); code != fiber.StatusOK {
		t.Fatalf("admin want 200, got %d", code)
	}

	user := fiber.New()
	user.Get("/x", func(c *fiber.Ctx) error { c.Locals(CtxRole, domain.RoleUser); return c.Next() }, RequireAdmin(), func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	if code := req(t, user, nil); code != fiber.StatusForbidden {
		t.Fatalf("user want 403, got %d", code)
	}
}

func TestUserID_Absent(t *testing.T) {
	app := fiber.New()
	app.Get("/x", func(c *fiber.Ctx) error {
		if _, ok := UserID(c); ok {
			return fiber.NewError(fiber.StatusInternalServerError, "should be absent")
		}
		return c.SendStatus(fiber.StatusOK)
	})
	if code := req(t, app, nil); code != fiber.StatusOK {
		t.Fatalf("want 200, got %d", code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	for _, prod := range []bool{false, true} {
		app := fiber.New()
		app.Get("/x", SecurityHeaders(prod), func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
		httpReq := httptest.NewRequest(fiber.MethodGet, "/x", nil)
		resp, err := app.Test(httpReq, -1)
		if err != nil {
			t.Fatalf("Test: %v", err)
		}
		if resp.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal("missing nosniff")
		}
		if resp.Header.Get("Content-Security-Policy") == "" {
			t.Fatal("missing CSP")
		}
		hsts := resp.Header.Get("Strict-Transport-Security")
		if prod && hsts == "" {
			t.Fatal("prod should set HSTS")
		}
		if !prod && hsts != "" {
			t.Fatal("dev should not set HSTS")
		}
	}
}

func TestRateLimit_NilRedisFailOpen(t *testing.T) {
	app := newApp(RateLimit(nil, "api", 1, time.Minute))
	if code := req(t, app, nil); code != fiber.StatusOK {
		t.Fatalf("nil redis should pass, got %d", code)
	}
	app2 := newApp(RateLimitByUser(nil, "api", 1, time.Minute))
	if code := req(t, app2, nil); code != fiber.StatusOK {
		t.Fatalf("nil redis (byUser) should pass, got %d", code)
	}
}

// TestRateLimit_RealRedis exercises the counting + 429 path against a live
// redis. Skipped when redis is not reachable (e.g. isolated CI without the
// dev stack), so the suite stays green everywhere.
func TestRateLimit_RealRedis(t *testing.T) {
	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6379"})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("redis not reachable, skipping: %v", err)
	}
	bucket := "test-" + uuid.NewString()
	app := newApp(RateLimit(rdb, bucket, 1, 5*time.Second))
	if code := req(t, app, nil); code != fiber.StatusOK {
		t.Fatalf("first request want 200, got %d", code)
	}
	if code := req(t, app, nil); code != fiber.StatusTooManyRequests {
		t.Fatalf("second request want 429, got %d", code)
	}

	uid := uuid.New()
	appU := fiber.New()
	appU.Get("/x", func(c *fiber.Ctx) error { c.Locals(CtxUserID, uid); return c.Next() },
		RateLimitByUser(rdb, "test2-"+uuid.NewString(), 1, 5*time.Second),
		func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	if code := req(t, appU, nil); code != fiber.StatusOK {
		t.Fatalf("byUser first want 200, got %d", code)
	}
	if code := req(t, appU, nil); code != fiber.StatusTooManyRequests {
		t.Fatalf("byUser second want 429, got %d", code)
	}
}
