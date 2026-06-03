package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

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
		current.DownloadPath = *partial.DownloadPath
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
