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

	"github.com/seuuser/torrentleaf/api/internal/handler"
	"github.com/seuuser/torrentleaf/api/internal/middleware"
	"github.com/seuuser/torrentleaf/api/internal/repository"
	"github.com/seuuser/torrentleaf/api/internal/service"
	"github.com/seuuser/torrentleaf/api/pkg/cache"
	"github.com/seuuser/torrentleaf/api/pkg/config"
	"github.com/seuuser/torrentleaf/api/pkg/db"
	"github.com/seuuser/torrentleaf/api/pkg/logger"
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
	authSvc := service.NewAuthService(userRepo, service.AuthConfig{
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
	torrentSvc := service.NewTorrentService(sessionRepo, fileRepo, engineClient)
	readerSvc := service.NewReaderService(sessionRepo, fileRepo)
	progressSvc := service.NewProgressService(progressRepo, fileRepo, sessionRepo)
	librarySvc := service.NewLibraryService(libraryRepo, favoritesRepo, sessionRepo)
	adminSvc := service.NewAdminService(sessionRepo, engineClient)

	app := newApp(log)
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

func newApp(log zerolog.Logger) *fiber.App {
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
	app.Use(cors.New())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))

	return app
}

func registerRoutes(app *fiber.App, d deps) {
	// Internal webhook endpoints (engine → api). Guarded by shared secret.
	internalWebhook := handler.NewInternalWebhookHandler(d.log, d.torrentSvc, d.webhookSecret)
	internal := app.Group("/internal", internalWebhook.RequireSecret())
	internal.Post("/torrents/:infoHash/metadata", internalWebhook.Metadata)

	api := app.Group("/api/v1")

	// Public auth routes.
	auth := handler.NewAuthHandler(d.log, d.authSvc)
	api.Post("/auth/register", auth.Register)
	api.Post("/auth/login", auth.Login)
	api.Post("/auth/refresh", auth.Refresh)
	api.Post("/auth/logout", auth.Logout)

	// WebSocket — uses WS-specific auth so browsers can pass ?token=.
	ws := handler.NewTorrentWSHandler(d.log, d.torrentSvc, d.redis)
	api.Get("/torrents/:id/ws",
		middleware.RequireAuthWS(d.authSvc),
		ws.Upgrade,
		websocket.New(ws.Stream),
	)

	// All routes below require a valid access token.
	protected := api.Group("", middleware.RequireAuth(d.authSvc))

	torrents := handler.NewTorrentHandler(d.log, d.torrentSvc)
	protected.Post("/torrents", torrents.Add)
	protected.Get("/torrents", torrents.List)
	protected.Get("/torrents/:id", torrents.Get)
	protected.Delete("/torrents/:id", torrents.Delete)
	protected.Post("/torrents/:id/priority", torrents.SetPriority)

	reader := handler.NewReaderHandler(d.log, d.readerSvc, d.engineURL)
	protected.Get("/reader/:id/pages", reader.GetPages)

	// Stream routes use RequireAuthWS so <img>/<video> tags can pass ?token=
	// on the URL (browsers cannot attach Authorization headers to these).
	api.Get("/stream/:fileId", middleware.RequireAuthWS(d.authSvc), reader.StreamFile)
	api.Get("/stream/:fileId/:page", middleware.RequireAuthWS(d.authSvc), reader.StreamPage)

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
