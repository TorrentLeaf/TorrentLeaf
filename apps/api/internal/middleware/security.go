package middleware

import "github.com/gofiber/fiber/v2"

// SecurityHeaders applies the baseline hardening headers from the security
// skill. HSTS is only set in production because local dev runs on HTTP; CSP
// permits 'unsafe-eval' because PDF.js ships a worker that compiles wasm.
func SecurityHeaders(production bool) fiber.Handler {
	const csp = "default-src 'self'; " +
		"script-src 'self' 'unsafe-eval'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: blob:; " +
		"worker-src blob:; " +
		"connect-src 'self' ws: wss:;"

	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "interest-cohort=()")
		c.Set("Content-Security-Policy", csp)
		if production {
			c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		return c.Next()
	}
}
