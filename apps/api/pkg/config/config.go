package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Env              string
	Port             string
	LogLevel         string
	DatabaseURL      string
	RedisURL         string
	TorrentEngineURL string
	JWTSecret        string
	JWTRefreshSecret string
	JWTAccessTTL     time.Duration
	JWTRefreshTTL    time.Duration
	MinioEndpoint    string
	MinioAccessKey   string
	MinioSecretKey   string
	APIWebhookSecret string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Env:              getenv("ENV", "development"),
		Port:             getenv("PORT", "8080"),
		LogLevel:         getenv("LOG_LEVEL", "info"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		RedisURL:         os.Getenv("REDIS_URL"),
		TorrentEngineURL: os.Getenv("TORRENT_ENGINE_URL"),
		JWTSecret:        os.Getenv("JWT_SECRET"),
		JWTRefreshSecret: os.Getenv("JWT_REFRESH_SECRET"),
		JWTAccessTTL:     parseDuration(getenv("JWT_ACCESS_TTL", "15m")),
		JWTRefreshTTL:    parseDuration(getenv("JWT_REFRESH_TTL", "168h")),
		MinioEndpoint:    os.Getenv("MINIO_ENDPOINT"),
		MinioAccessKey:   os.Getenv("MINIO_ACCESS_KEY"),
		MinioSecretKey:   os.Getenv("MINIO_SECRET_KEY"),
		APIWebhookSecret: os.Getenv("API_WEBHOOK_SECRET"),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) validate() error {
	var missing []string
	if c.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if c.RedisURL == "" {
		missing = append(missing, "REDIS_URL")
	}
	if c.JWTSecret == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if c.JWTRefreshSecret == "" {
		missing = append(missing, "JWT_REFRESH_SECRET")
	}
	if len(missing) > 0 {
		return fmt.Errorf("config: missing required variables: %s", strings.Join(missing, ", "))
	}
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("config: JWT_SECRET must be at least 32 characters")
	}
	if len(c.JWTRefreshSecret) < 32 {
		return fmt.Errorf("config: JWT_REFRESH_SECRET must be at least 32 characters")
	}
	if c.JWTSecret == c.JWTRefreshSecret {
		return fmt.Errorf("config: JWT_SECRET and JWT_REFRESH_SECRET must differ")
	}
	return nil
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 15 * time.Minute
	}
	return d
}

func (c *Config) IsProduction() bool {
	return strings.EqualFold(c.Env, "production")
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
