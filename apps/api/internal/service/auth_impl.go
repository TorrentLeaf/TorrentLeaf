package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/seuuser/torrentleaf/api/internal/domain"
	"github.com/seuuser/torrentleaf/api/internal/repository"
)

type AuthConfig struct {
	AccessSecret  []byte
	RefreshSecret []byte
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
	Issuer        string
}

type authService struct {
	users repository.UserRepository
	cfg   AuthConfig
}

func NewAuthService(users repository.UserRepository, cfg AuthConfig) AuthService {
	if cfg.Issuer == "" {
		cfg.Issuer = "torrentleaf"
	}
	if cfg.AccessTTL == 0 {
		cfg.AccessTTL = 15 * time.Minute
	}
	if cfg.RefreshTTL == 0 {
		cfg.RefreshTTL = 7 * 24 * time.Hour
	}
	return &authService{users: users, cfg: cfg}
}

type Claims struct {
	UserID uuid.UUID   `json:"uid"`
	Role   domain.Role `json:"role"`
	Type   string      `json:"typ"`
	jwt.RegisteredClaims
}

const (
	tokenTypeAccess  = "access"
	tokenTypeRefresh = "refresh"
)

func (s *authService) Register(ctx context.Context, username, email, password string) (*domain.User, error) {
	if err := validateRegisterInput(username, email, password); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	u, err := s.users.Create(ctx, domain.User{
		Username:     strings.TrimSpace(username),
		Email:        strings.ToLower(strings.TrimSpace(email)),
		PasswordHash: string(hash),
		Role:         domain.RoleUser,
	})
	if err != nil {
		return nil, err
	}
	return withoutHash(u), nil
}

// withoutHash returns a shallow copy of u with the password hash cleared, so
// callers can safely serialize the user without leaking the bcrypt hash and
// without mutating the repository's cached entry.
func withoutHash(u *domain.User) *domain.User {
	c := *u
	c.PasswordHash = ""
	return &c
}

func (s *authService) Login(ctx context.Context, email, password string) (access, refresh string, user *domain.User, err error) {
	email = strings.ToLower(strings.TrimSpace(email))
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		var de *domain.Error
		if errors.As(err, &de) && de.Code == domain.ErrNotFound {
			return "", "", nil, domain.NewError(domain.ErrUnauthorized, "invalid credentials", nil)
		}
		return "", "", nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return "", "", nil, domain.NewError(domain.ErrUnauthorized, "invalid credentials", nil)
	}

	access, err = s.signToken(u, tokenTypeAccess, s.cfg.AccessSecret, s.cfg.AccessTTL)
	if err != nil {
		return "", "", nil, err
	}
	refresh, err = s.signToken(u, tokenTypeRefresh, s.cfg.RefreshSecret, s.cfg.RefreshTTL)
	if err != nil {
		return "", "", nil, err
	}

	return access, refresh, withoutHash(u), nil
}

func (s *authService) Refresh(ctx context.Context, refreshToken string) (string, error) {
	claims, err := s.parseToken(refreshToken, s.cfg.RefreshSecret)
	if err != nil {
		return "", domain.NewError(domain.ErrUnauthorized, "invalid refresh token", err)
	}
	if claims.Type != tokenTypeRefresh {
		return "", domain.NewError(domain.ErrUnauthorized, "not a refresh token", nil)
	}

	u, err := s.users.GetByID(ctx, claims.UserID)
	if err != nil {
		return "", domain.NewError(domain.ErrUnauthorized, "user no longer exists", err)
	}

	return s.signToken(u, tokenTypeAccess, s.cfg.AccessSecret, s.cfg.AccessTTL)
}

func (s *authService) ParseAccessToken(token string) (*Claims, error) {
	claims, err := s.parseToken(token, s.cfg.AccessSecret)
	if err != nil {
		return nil, err
	}
	if claims.Type != tokenTypeAccess {
		return nil, errors.New("not an access token")
	}
	return claims, nil
}

func (s *authService) signToken(u *domain.User, typ string, secret []byte, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: u.ID,
		Role:   u.Role,
		Type:   typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.Issuer,
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("sign %s token: %w", typ, err)
	}
	return signed, nil
}

func (s *authService) parseToken(raw string, secret []byte) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", t.Method.Alg())
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func validateRegisterInput(username, email, password string) error {
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(email)

	switch {
	case len(username) < 3 || len(username) > 50:
		return domain.NewError(domain.ErrInvalidInput, "username must be 3–50 characters", nil)
	case !strings.Contains(email, "@") || len(email) > 255:
		return domain.NewError(domain.ErrInvalidInput, "invalid email", nil)
	case len(password) < 8:
		return domain.NewError(domain.ErrInvalidInput, "password must be at least 8 characters", nil)
	}
	return nil
}
