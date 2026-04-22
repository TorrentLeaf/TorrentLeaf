package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/Dellareti/torrentleaf/api/internal/handler"
	"github.com/Dellareti/torrentleaf/api/internal/middleware"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
	"github.com/Dellareti/torrentleaf/api/internal/service"
	"github.com/Dellareti/torrentleaf/api/pkg/cache"
	"github.com/Dellareti/torrentleaf/api/pkg/config"
	"github.com/Dellareti/torrentleaf/api/pkg/db"
	"github.com/Dellareti/torrentleaf/api/pkg/logger"
)

type deps struct {
	log           zerolog.Logger
	authSvc       service.AuthService
	torrentSvc    service.TorrentService
	readerSvc     service.ReaderService
	progressSvc   service.ProgressService
	librarySvc    service.LibraryService
	adminSvc      service.AdminService
	redis         *redis.Client
	engineURL     string
	webhookSecret string
	production    bool
	accessTTL     time.Duration
	refreshTTL    time.Duration
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	log := logger.New(cfg.LogLevel, cfg.Env)

	rootCtx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(rootCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to postgres")
	}
	defer pool.Close()

	redisClient, err := cache.Connect(rootCtx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}
	defer func() { _ = redisClient.Close() }()

	userRepo := repository.NewUserRepository(pool)
	refreshTokenRepo := repository.NewRefreshTokenRepository(pool)
	authSvc := service.NewAuthService(userRepo, refreshTokenRepo, service.AuthConfig{
		AccessSecret:  []byte(cfg.JWTSecret),
		RefreshSecret: []byte(cfg.JWTRefreshSecret),
		AccessTTL:     cfg.JWTAccessTTL,
		RefreshTTL:    cfg.JWTRefreshTTL,
	})

	sessionRepo := repository.NewTorrentRepository(pool)
	fileRepo := repository.NewTorrentFileRepository(pool)
	progressRepo := repository.NewProgressRepository(pool)
	libraryRepo := repository.NewLibraryRepository(pool)
	favoritesRepo := repository.NewFavoritesRepository(pool)
	engineClient := service.NewEngineClient(cfg.TorrentEngineURL)
	torrentSvc := service.NewTorrentService(sessionRepo, fileRepo, libraryRepo, engineClient)
	readerSvc := service.NewReaderService(sessionRepo, fileRepo, engineClient)
	progressSvc := service.NewProgressService(progressRepo, fileRepo, sessionRepo)
	librarySvc := service.NewLibraryService(libraryRepo, favoritesRepo, sessionRepo)
	adminSvc := service.NewAdminService(sessionRepo, engineClient)

	app := newApp(log, cfg)
	registerRoutes(app, deps{
		log:           log,
		authSvc:       authSvc,
		torrentSvc:    torrentSvc,
		readerSvc:     readerSvc,
		progressSvc:   progressSvc,
		librarySvc:    librarySvc,
		adminSvc:      adminSvc,
		redis:         redisClient.Client,
		engineURL:     cfg.TorrentEngineURL,
		webhookSecret: cfg.APIWebhookSecret,
		production:    cfg.IsProduction(),
		accessTTL:     cfg.JWTAccessTTL,
		refreshTTL:    cfg.JWTRefreshTTL,
	})

	go func() {
		addr := ":" + cfg.Port
		log.Info().Str("addr", addr).Msg("api server listening")
		if err := app.Listen(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("server terminated")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info().Msg("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
}

func newApp(log zerolog.Logger, cfg *config.Config) *fiber.App {
	app := fiber.New(fiber.Config{
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			msg := "internal error"
			var fe *fiber.Error
			if errors.As(err, &fe) {
				code = fe.Code
				msg = fe.Message
			}
			log.Error().Err(err).Int("status", code).Str("path", c.Path()).Msg("request error")
			return c.Status(code).JSON(fiber.Map{"error": msg})
		},
	})

	app.Use(requestid.New())
	app.Use(recover.New())
	app.Use(middleware.SecurityHeaders(cfg.IsProduction()))
	app.Use(cors.New(corsConfig(cfg)))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	return app
}

// corsConfig locks CORS to known origins. In production, CORS_ALLOWED_ORIGINS
// must be set explicitly; otherwise we default to a safe empty allowlist (no
// cross-origin requests). Dev keeps the usual localhost pair.
func corsConfig(cfg *config.Config) cors.Config {
	base := cors.Config{
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Authorization",
		AllowCredentials: true,
		MaxAge:           86400,
	}
	if cfg.IsProduction() {
		base.AllowOrigins = cfg.CORSAllowedOrigins
		return base
	}
	base.AllowOrigins = "http://localhost:3000,http://localhost:8080"
	return base
}

func registerRoutes(app *fiber.App, d deps) {
	// Internal webhook endpoints (engine → api). Guarded by shared secret.
	internalWebhook := handler.NewInternalWebhookHandler(d.log, d.torrentSvc, d.webhookSecret)
	internal := app.Group("/internal", internalWebhook.RequireSecret())
	internal.Post("/torrents/:infoHash/metadata", internalWebhook.Metadata)

	api := app.Group("/api/v1")

	// Public auth routes. Rate-limited per IP — credential stuffing and
	// account enumeration are the obvious abuse vectors. Per security skill
	// §2 the budget is 5/min on write endpoints; refresh gets a bit more
	// headroom because short access-token TTLs make refreshes frequent.
	auth := handler.NewAuthHandler(d.log, d.authSvc, handler.AuthHandlerOptions{
		Production: d.production,
		AccessTTL:  d.accessTTL,
		RefreshTTL: d.refreshTTL,
	})
	authLimit := middleware.RateLimit(d.redis, "auth", 5, time.Minute)
	api.Post("/auth/register", authLimit, auth.Register)
	api.Post("/auth/login", authLimit, auth.Login)
	api.Post("/auth/refresh", middleware.RateLimit(d.redis, "auth-refresh", 30, time.Minute), auth.Refresh)
	api.Post("/auth/logout", auth.Logout)

	// WebSocket + stream routes use RequireAuthWS (token via ?token=).
	// IMPORTANT: must be registered BEFORE the `protected := api.Group("", RequireAuth)`
	// line below — Fiber's Group(prefix, handler) with an empty prefix registers
	// the handler as a Use() on the WHOLE api group, so ANY /api/v1/* route
	// declared afterwards inherits RequireAuth and the RequireAuthWS passed
	// here becomes dead code.
	ws := handler.NewTorrentWSHandler(d.log, d.torrentSvc, d.redis)
	api.Get("/torrents/:id/ws",
		middleware.RequireAuthWS(d.authSvc),
		ws.Upgrade,
		websocket.New(ws.Stream),
	)

	reader := handler.NewReaderHandler(d.log, d.readerSvc, d.engineURL)
	api.Get("/stream/:fileId", middleware.RequireAuthWS(d.authSvc), reader.StreamFile)
	api.Get("/stream/:fileId/:page", middleware.RequireAuthWS(d.authSvc), reader.StreamPage)

	// All routes below require a valid access token (cookie or bearer header)
	// plus a per-user rate limit. The limiter sits after RequireAuth so it
	// keys on the authenticated user ID; see middleware.RateLimitByUser for
	// the IP fallback semantics.
	protected := api.Group("",
		middleware.RequireAuth(d.authSvc),
		middleware.RateLimitByUser(d.redis, "api", 100, time.Minute),
	)

	torrents := handler.NewTorrentHandler(d.log, d.torrentSvc)
	// Add-torrent has its own tighter budget on top of the per-user API limit:
	// swarm pressure and disk use make 10/hour a reasonable ceiling per skill §2.
	protected.Post("/torrents",
		middleware.RateLimitByUser(d.redis, "torrent-add", 10, time.Hour),
		torrents.Add,
	)
	protected.Get("/torrents", torrents.List)
	protected.Get("/torrents/:id", torrents.Get)
	protected.Delete("/torrents/:id", torrents.Delete)
	protected.Post("/torrents/:id/priority", torrents.SetPriority)

	protected.Get("/reader/:id/pages", reader.GetPages)

	library := handler.NewLibraryHandler(d.log, d.librarySvc)
	protected.Get("/library", library.List)
	protected.Post("/library", library.Add)
	protected.Delete("/library/:id", library.Remove)
	protected.Post("/library/:id/favorite", library.AddFavorite)
	protected.Delete("/library/:id/favorite", library.RemoveFavorite)

	progress := handler.NewProgressHandler(d.log, d.progressSvc)
	protected.Get("/progress/:fileId", progress.Get)
	protected.Put("/progress/:fileId", progress.Update)

	admin := handler.NewAdminHandler(d.log, d.adminSvc)
	adminGroup := protected.Group("/admin", middleware.RequireAdmin())
	adminGroup.Get("/torrents", admin.ListTorrents)
	adminGroup.Post("/torrents/:id/pause", admin.PauseTorrent)
	adminGroup.Post("/torrents/:id/resume", admin.ResumeTorrent)
	adminGroup.Delete("/torrents/:id", admin.DeleteTorrent)
}
