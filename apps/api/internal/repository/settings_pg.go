package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type settingsRepo struct {
	pool *pgxpool.Pool
}

func NewSettingsRepository(pool *pgxpool.Pool) SettingsRepository {
	return &settingsRepo{pool: pool}
}

const settingsColumns = `id, user_id, download_path, default_reading_mode,
	default_fit_mode, reading_direction, auto_add_library, reader_background,
	created_at, updated_at`

func (r *settingsRepo) GetByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSettings, error) {
	q := "SELECT " + settingsColumns + " FROM user_settings WHERE user_id = $1 LIMIT 1"
	row := r.pool.QueryRow(ctx, q, userID)
	s, err := scanSettings(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Auto-create with defaults. AutoAddLibrary must be set explicitly
			// here: it's a bool whose zero value (false) would otherwise be
			// written on INSERT, silently overriding the column's DEFAULT true.
			return r.Upsert(ctx, domain.UserSettings{UserID: userID, AutoAddLibrary: true})
		}
		return nil, fmt.Errorf("get user settings: %w", err)
	}
	return s, nil
}

func (r *settingsRepo) Upsert(ctx context.Context, s domain.UserSettings) (*domain.UserSettings, error) {
	// Use defaults for zero-value fields.
	if s.DownloadPath == "" {
		s.DownloadPath = "/data/torrents"
	}
	if s.DefaultReadingMode == "" {
		s.DefaultReadingMode = "paginated"
	}
	if s.DefaultFitMode == "" {
		s.DefaultFitMode = "fit-width"
	}
	if s.ReadingDirection == "" {
		s.ReadingDirection = "ltr"
	}
	if s.ReaderBackground == "" {
		s.ReaderBackground = "#000000"
	}

	const q = `
		INSERT INTO user_settings
			(user_id, download_path, default_reading_mode, default_fit_mode,
			 reading_direction, auto_add_library, reader_background)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id) DO UPDATE SET
			download_path        = EXCLUDED.download_path,
			default_reading_mode = EXCLUDED.default_reading_mode,
			default_fit_mode     = EXCLUDED.default_fit_mode,
			reading_direction    = EXCLUDED.reading_direction,
			auto_add_library     = EXCLUDED.auto_add_library,
			reader_background    = EXCLUDED.reader_background,
			updated_at           = NOW()
		RETURNING ` + settingsColumns

	row := r.pool.QueryRow(ctx, q,
		s.UserID, s.DownloadPath, s.DefaultReadingMode, s.DefaultFitMode,
		s.ReadingDirection, s.AutoAddLibrary, s.ReaderBackground,
	)
	return scanSettings(row)
}

func scanSettings(r rowScanner) (*domain.UserSettings, error) {
	var s domain.UserSettings
	if err := r.Scan(
		&s.ID, &s.UserID, &s.DownloadPath, &s.DefaultReadingMode,
		&s.DefaultFitMode, &s.ReadingDirection, &s.AutoAddLibrary, &s.ReaderBackground,
		&s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &s, nil
}
