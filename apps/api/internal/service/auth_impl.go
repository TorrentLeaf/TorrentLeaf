package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

type AuthConfig struct {
	AccessSecret  []byte
	RefreshSecret []byte
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
	Issuer        string
}

type authService struct {
	users    repository.UserRepository
	refresh  repository.RefreshTokenRepository
	cfg      AuthConfig
	now      func() time.Time
}

func NewAuthService(
	users repository.UserRepository,
	refresh repository.RefreshTokenRepository,
	cfg AuthConfig,
) AuthService {
	if cfg.Issuer == "" {
		cfg.Issuer = "torrentleaf"
	}
	if cfg.AccessTTL == 0 {
		cfg.AccessTTL = 15 * time.Minute
	}
	if cfg.RefreshTTL == 0 {
		cfg.RefreshTTL = 7 * 24 * time.Hour
	}
	return &authService{
		users:   users,
		refresh: refresh,
		cfg:     cfg,
		now:     time.Now,
	}
}

type Claims struct {
	UserID uuid.UUID   `json:"uid"`
	Role   domain.Role `json:"role"`
	Type   string      `json:"typ"`
	JTI    uuid.UUID   `json:"jti,omitempty"`
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

	// Cost 12 per security skill — noticeably slower than the default 10 but
	// still under ~150 ms on commodity hardware.
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
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

	access, err = s.signAccessToken(u)
	if err != nil {
		return "", "", nil, err
	}
	refresh, _, err = s.issueRefreshToken(ctx, u)
	if err != nil {
		return "", "", nil, err
	}

	return access, refresh, withoutHash(u), nil
}

// Refresh exchanges a refresh token for a fresh pair. Rotation is mandatory:
// the incoming refresh is revoked and a new one issued. If the incoming token
// was already revoked (i.e. someone is replaying a rotated token) we revoke
// every outstanding refresh for the user — the client chain is compromised.
func (s *authService) Refresh(ctx context.Context, refreshToken string) (RefreshResult, error) {
	claims, err := s.parseToken(refreshToken, s.cfg.RefreshSecret)
	if err != nil {
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "invalid refresh token", err)
	}
	if claims.Type != tokenTypeRefresh {
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "not a refresh token", nil)
	}
	if claims.JTI == uuid.Nil {
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "refresh token missing jti", nil)
	}

	stored, err := s.refresh.GetByJTI(ctx, claims.JTI)
	if err != nil {
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "refresh token not recognized", err)
	}

	// Bind the presented token to the persisted row by hash — prevents using a
	// validly-signed token whose jti points at a different body.
	if !hashesEqual(stored.TokenHash, hashToken(refreshToken)) {
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "refresh token not recognized", nil)
	}

	now := s.now()
	if !stored.IsActive(now) {
		// Replay of an already-rotated token — revoke the whole family.
		_ = s.refresh.RevokeAllForUser(ctx, stored.UserID)
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "refresh token revoked", nil)
	}

	u, err := s.users.GetByID(ctx, claims.UserID)
	if err != nil {
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "user no longer exists", err)
	}

	access, err := s.signAccessToken(u)
	if err != nil {
		return RefreshResult{}, err
	}
	newRefresh, newRow, err := s.issueRefreshToken(ctx, u)
	if err != nil {
		return RefreshResult{}, err
	}
	if err := s.refresh.MarkReplaced(ctx, stored.ID, newRow.ID); err != nil {
		// If MarkReplaced fails because the old row was already revoked
		// between our check and the update, roll back the new token to keep
		// the family state consistent.
		_ = s.refresh.Revoke(ctx, newRow.ID)
		return RefreshResult{}, domain.NewError(domain.ErrUnauthorized, "refresh token revoked", err)
	}

	return RefreshResult{Access: access, Refresh: newRefresh}, nil
}

// Logout best-effort revokes the refresh token. An expired or unknown token is
// not an error — the client wants to forget regardless.
func (s *authService) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	claims, err := s.parseToken(refreshToken, s.cfg.RefreshSecret)
	if err != nil || claims.JTI == uuid.Nil {
		return nil
	}
	stored, err := s.refresh.GetByJTI(ctx, claims.JTI)
	if err != nil {
		return nil
	}
	if !hashesEqual(stored.TokenHash, hashToken(refreshToken)) {
		return nil
	}
	return s.refresh.Revoke(ctx, stored.ID)
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

func (s *authService) signAccessToken(u *domain.User) (string, error) {
	now := s.now()
	claims := Claims{
		UserID: u.ID,
		Role:   u.Role,
		Type:   tokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.Issuer,
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.AccessTTL)),
		},
	}
	return signClaims(claims, s.cfg.AccessSecret)
}

// issueRefreshToken signs a refresh token, persists its hash, and returns
// both the token string and the stored row.
func (s *authService) issueRefreshToken(ctx context.Context, u *domain.User) (string, *repository.RefreshToken, error) {
	now := s.now()
	expires := now.Add(s.cfg.RefreshTTL)
	jti := uuid.New()

	token, err := signClaims(Claims{
		UserID: u.ID,
		Role:   u.Role,
		Type:   tokenTypeRefresh,
		JTI:    jti,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.Issuer,
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expires),
			ID:        jti.String(),
		},
	}, s.cfg.RefreshSecret)
	if err != nil {
		return "", nil, err
	}

	row, err := s.refresh.Create(ctx, repository.RefreshToken{
		UserID:    u.ID,
		JTI:       jti,
		TokenHash: hashToken(token),
		ExpiresAt: expires,
	})
	if err != nil {
		return "", nil, err
	}
	return token, row, nil
}

func signClaims(claims Claims, secret []byte) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("sign %s token: %w", claims.Type, err)
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

// hashToken returns the SHA-256 of a token body. We compare by hash so a
// DB leak can't yield usable refresh tokens.
func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// hashesEqual is constant-time to prevent timing leaks on the hash comparison.
func hashesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := range a {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
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
	case len(password) > 72:
		// bcrypt silently truncates input past 72 bytes. Reject explicitly so
		// users cannot register a password that is effectively a 72-byte prefix.
		return domain.NewError(domain.ErrInvalidInput, "password must be at most 72 characters", nil)
	}
	return nil
}
