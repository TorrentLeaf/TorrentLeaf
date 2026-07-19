package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

// validDownloadSubpath enforces that the per-user download path is a relative
// subfolder under the engine's data dir (no absolute paths, no `..` traversal).
// The engine resolves it under /data/torrents (see ADR 006).
func validDownloadSubpath(p string) bool {
	p = strings.TrimSpace(p)
	if p == "" {
		return true // empty = engine default
	}
	if strings.HasPrefix(p, "/") || strings.Contains(p, "..") || strings.Contains(p, "\\") {
		return false
	}
	return true
}

type SettingsService interface {
	Get(ctx context.Context, userID uuid.UUID) (*domain.UserSettings, error)
	Update(ctx context.Context, userID uuid.UUID, partial SettingsUpdate) (*domain.UserSettings, error)
}

// SettingsUpdate carries only the fields the user wants to change. Nil/zero
// values are left unchanged (the current value is preserved).
type SettingsUpdate struct {
	DownloadPath       *string `json:"downloadPath,omitempty"`
	DefaultReadingMode *string `json:"defaultReadingMode,omitempty"`
	DefaultFitMode     *string `json:"defaultFitMode,omitempty"`
	ReadingDirection   *string `json:"readingDirection,omitempty"`
	AutoAddLibrary     *bool   `json:"autoAddLibrary,omitempty"`
	ReaderBackground   *string `json:"readerBackground,omitempty"`
}

type settingsService struct {
	repo repository.SettingsRepository
}

func NewSettingsService(repo repository.SettingsRepository) SettingsService {
	return &settingsService{repo: repo}
}

func (s *settingsService) Get(ctx context.Context, userID uuid.UUID) (*domain.UserSettings, error) {
	return s.repo.GetByUserID(ctx, userID)
}

func (s *settingsService) Update(ctx context.Context, userID uuid.UUID, partial SettingsUpdate) (*domain.UserSettings, error) {
	current, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	// Merge partial update into current values.
	if partial.DownloadPath != nil {
		if !validDownloadSubpath(*partial.DownloadPath) {
			return nil, domain.NewError(domain.ErrInvalidInput,
				"download path must be a relative subfolder (no leading / or ..)", nil)
		}
		current.DownloadPath = strings.TrimSpace(*partial.DownloadPath)
	}
	if partial.DefaultReadingMode != nil {
		current.DefaultReadingMode = *partial.DefaultReadingMode
	}
	if partial.DefaultFitMode != nil {
		current.DefaultFitMode = *partial.DefaultFitMode
	}
	if partial.ReadingDirection != nil {
		current.ReadingDirection = *partial.ReadingDirection
	}
	if partial.AutoAddLibrary != nil {
		current.AutoAddLibrary = *partial.AutoAddLibrary
	}
	if partial.ReaderBackground != nil {
		current.ReaderBackground = *partial.ReaderBackground
	}
	return s.repo.Upsert(ctx, *current)
}
