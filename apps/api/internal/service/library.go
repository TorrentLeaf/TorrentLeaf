package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type LibraryService interface {
	List(ctx context.Context, userID uuid.UUID) ([]domain.LibraryItem, error)
	Add(ctx context.Context, userID, sessionID uuid.UUID, title string) (*domain.LibraryItem, error)
	Remove(ctx context.Context, id uuid.UUID) error
}
