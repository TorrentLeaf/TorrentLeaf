package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"

	"github.com/seuuser/torrentleaf/api/internal/handler"
	"github.com/seuuser/torrentleaf/api/pkg/cache"
	"github.com/seuuser/torrentleaf/api/pkg/config"
	"github.com/seuuser/torrentleaf/api/pkg/db"
	"github.com/seuuser/torrentleaf/api/pkg/logger"
)

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

	redis, err := cache.Connect(rootCtx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}
	defer func() { _ = redis.Close() }()

	app := newApp(log)
	registerRoutes(app, log)

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
			msg := "erro interno"
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

func registerRoutes(app *fiber.App, log zerolog.Logger) {
	api := app.Group("/api/v1")

	auth := handler.NewAuthHandler(log)
	api.Post("/auth/register", auth.Register)
	api.Post("/auth/login", auth.Login)
	api.Post("/auth/refresh", auth.Refresh)
	api.Post("/auth/logout", auth.Logout)

	torrents := handler.NewTorrentHandler(log)
	api.Post("/torrents", torrents.Add)
	api.Get("/torrents", torrents.List)
	api.Get("/torrents/:id", torrents.Get)
	api.Delete("/torrents/:id", torrents.Delete)
	api.Post("/torrents/:id/priority", torrents.SetPriority)

	reader := handler.NewReaderHandler(log)
	api.Get("/reader/:id/pages", reader.GetPages)
	api.Get("/stream/:fileId/:page", reader.StreamPage)

	library := handler.NewLibraryHandler(log)
	api.Get("/library", library.List)
	api.Post("/library", library.Add)
	api.Delete("/library/:id", library.Remove)

	progress := handler.NewProgressHandler(log)
	api.Get("/progress/:fileId", progress.Get)
	api.Put("/progress/:fileId", progress.Update)

	admin := handler.NewAdminHandler(log)
	api.Get("/admin/torrents", admin.ListTorrents)
}
