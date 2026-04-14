package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type UserRepository interface {
	Create(ctx context.Context, user domain.User) (*domain.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByUsername(ctx context.Context, username string) (*domain.User, error)
}
