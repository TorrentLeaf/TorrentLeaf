package service

import (
	"context"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

// RefreshResult carries the token pair produced by Refresh. The refresh token
// is rotated on every successful call, so clients must store whatever is in
// Refresh and discard the previous value.
type RefreshResult struct {
	Access  string
	Refresh string
}

type AuthService interface {
	Register(ctx context.Context, username, email, password string) (*domain.User, error)
	Login(ctx context.Context, email, password string) (access, refresh string, user *domain.User, err error)
	Refresh(ctx context.Context, refreshToken string) (RefreshResult, error)
	Logout(ctx context.Context, refreshToken string) error
	ParseAccessToken(token string) (*Claims, error)
}
