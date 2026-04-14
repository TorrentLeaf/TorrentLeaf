package config

import (
	"fmt"
	"os"
	"strings"

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
	MinioEndpoint    string
	MinioAccessKey   string
	MinioSecretKey   string
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
		MinioEndpoint:    os.Getenv("MINIO_ENDPOINT"),
		MinioAccessKey:   os.Getenv("MINIO_ACCESS_KEY"),
		MinioSecretKey:   os.Getenv("MINIO_SECRET_KEY"),
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
		return fmt.Errorf("config: variáveis obrigatórias ausentes: %s", strings.Join(missing, ", "))
	}
	return nil
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
