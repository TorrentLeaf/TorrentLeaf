package service

import (
	"context"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type AuthService interface {
	Register(ctx context.Context, username, email, password string) (*domain.User, error)
	Login(ctx context.Context, email, password string) (access, refresh string, user *domain.User, err error)
	Refresh(ctx context.Context, refreshToken string) (string, error)
	ParseAccessToken(token string) (*Claims, error)
}
