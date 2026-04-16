package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

// fakeUserRepo is an in-memory UserRepository for unit tests. Integration tests
// with real Postgres live under /test with a testcontainers setup (future).
type fakeUserRepo struct {
	byEmail map[string]*domain.User
	byID    map[uuid.UUID]*domain.User
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{
		byEmail: map[string]*domain.User{},
		byID:    map[uuid.UUID]*domain.User{},
	}
}

func (r *fakeUserRepo) Create(_ context.Context, u domain.User) (*domain.User, error) {
	if _, ok := r.byEmail[u.Email]; ok {
		return nil, domain.NewError(domain.ErrConflict, "email already in use", nil)
	}
	u.ID = uuid.New()
	u.CreatedAt = time.Now()
	u.UpdatedAt = u.CreatedAt
	r.byEmail[u.Email] = &u
	r.byID[u.ID] = &u
	return &u, nil
}

func (r *fakeUserRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.User, error) {
	u, ok := r.byID[id]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "user not found", nil)
	}
	return u, nil
}

func (r *fakeUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	u, ok := r.byEmail[email]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "user not found", nil)
	}
	return u, nil
}

func (r *fakeUserRepo) GetByUsername(_ context.Context, _ string) (*domain.User, error) {
	return nil, domain.NewError(domain.ErrNotFound, "user not found", nil)
}

func newTestService() AuthService {
	return NewAuthService(newFakeUserRepo(), AuthConfig{
		AccessSecret:  []byte("a-very-long-test-secret-32-chars!!"),
		RefreshSecret: []byte("a-different-refresh-secret-32chars!"),
		AccessTTL:     5 * time.Minute,
		RefreshTTL:    time.Hour,
	})
}

func TestRegisterAndLoginRoundtrip(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()

	if _, err := svc.Register(ctx, "alice", "Alice@Example.com ", "hunter22-long"); err != nil {
		t.Fatalf("register: %v", err)
	}

	access, refresh, user, err := svc.Login(ctx, "alice@example.com", "hunter22-long")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if access == "" || refresh == "" {
		t.Fatalf("expected non-empty tokens")
	}
	if user.Email != "alice@example.com" {
		t.Errorf("email not normalized: %q", user.Email)
	}
	if user.PasswordHash != "" {
		t.Errorf("password hash leaked in response: %q", user.PasswordHash)
	}

	claims, err := svc.ParseAccessToken(access)
	if err != nil {
		t.Fatalf("parse access: %v", err)
	}
	if claims.UserID != user.ID {
		t.Errorf("claim uid mismatch")
	}
	if claims.Type != tokenTypeAccess {
		t.Errorf("wrong token type: %s", claims.Type)
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "bob", "bob@example.com", "correct-horse")

	_, _, _, err := svc.Login(ctx, "bob@example.com", "wrong")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrUnauthorized {
		t.Fatalf("expected ErrUnauthorized, got %v", err)
	}
}

func TestRegisterValidation(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()

	cases := []struct {
		name, user, email, pass string
	}{
		{"short username", "ab", "a@b.com", "12345678"},
		{"bad email", "alice", "no-at-sign", "12345678"},
		{"short password", "alice", "a@b.com", "short"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := svc.Register(ctx, c.user, c.email, c.pass)
			var de *domain.Error
			if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
				t.Fatalf("expected ErrInvalidInput, got %v", err)
			}
		})
	}
}

func TestRefreshProducesFreshAccess(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "carol", "carol@example.com", "passphrase9")

	_, refresh, _, err := svc.Login(ctx, "carol@example.com", "passphrase9")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	access, err := svc.Refresh(ctx, refresh)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	claims, err := svc.ParseAccessToken(access)
	if err != nil {
		t.Fatalf("parse refreshed access: %v", err)
	}
	if claims.Type != tokenTypeAccess {
		t.Errorf("expected access type, got %s", claims.Type)
	}
}

func TestAccessTokenCannotBeUsedAsRefresh(t *testing.T) {
	svc := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "dave", "dave@example.com", "passphrase9")
	access, _, _, _ := svc.Login(ctx, "dave@example.com", "passphrase9")

	if _, err := svc.Refresh(ctx, access); err == nil {
		t.Fatal("expected refresh to reject an access token")
	}
}
