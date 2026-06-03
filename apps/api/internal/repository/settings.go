package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type SettingsRepository interface {
	// GetByUserID returns the settings for the given user. If none exist,
	// a row with defaults is auto-created and returned.
	GetByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSettings, error)
	// Upsert creates or updates the user's settings row.
	Upsert(ctx context.Context, s domain.UserSettings) (*domain.UserSettings, error)
}
