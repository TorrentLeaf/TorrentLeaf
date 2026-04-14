package service

import "context"

type AuthService interface {
	Register(ctx context.Context, username, email, password string) error
	Login(ctx context.Context, email, password string) (accessToken, refreshToken string, err error)
	Refresh(ctx context.Context, refreshToken string) (string, error)
}
