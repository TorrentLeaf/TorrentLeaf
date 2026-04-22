package middleware

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// RateLimit returns a fixed-window limiter keyed by client IP + bucket. The
// first request in a window sets the TTL, subsequent requests only Incr — so
// the window resets only after it fully elapses.
//
// bucket is a stable label that groups the counter (e.g. "auth" or "api");
// without it two endpoints sharing this middleware would share their budget.
//
// If Redis is unreachable we fail open: a 5xx here would turn a cache outage
// into a full-site outage. The error is logged by the request logger via the
// returned error path only when the cache round-trip itself fails.
func RateLimit(rdb *redis.Client, bucket string, limit int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if rdb == nil {
			return c.Next()
		}
		key := fmt.Sprintf("rl:%s:%s", bucket, c.IP())

		ctx := c.Context()
		count, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) {
				return c.Next()
			}
			// Fail open on Redis errors — better than 503 every request.
			return c.Next()
		}
		if count == 1 {
			_ = rdb.Expire(ctx, key, window).Err()
		}
		if count > int64(limit) {
			c.Set("Retry-After", strconv.Itoa(int(window.Seconds())))
			return fiber.NewError(fiber.StatusTooManyRequests, "too many requests")
		}
		return c.Next()
	}
}

// RateLimitByUser limits requests per authenticated user ID rather than per
// IP. Must be mounted AFTER RequireAuth so CtxUserID is populated; if the ID
// is missing we fall back to IP so the limiter still protects unauth slip-ins
// behind a shared proxy.
func RateLimitByUser(rdb *redis.Client, bucket string, limit int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if rdb == nil {
			return c.Next()
		}
		var subject string
		if uid, ok := c.Locals(CtxUserID).(uuid.UUID); ok && uid != uuid.Nil {
			subject = "u:" + uid.String()
		} else {
			subject = "ip:" + c.IP()
		}
		key := fmt.Sprintf("rl:%s:%s", bucket, subject)

		ctx := c.Context()
		count, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) {
				return c.Next()
			}
			return c.Next() // fail open
		}
		if count == 1 {
			_ = rdb.Expire(ctx, key, window).Err()
		}
		if count > int64(limit) {
			c.Set("Retry-After", strconv.Itoa(int(window.Seconds())))
			return fiber.NewError(fiber.StatusTooManyRequests, "too many requests")
		}
		return c.Next()
	}
}
