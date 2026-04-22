package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
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

// fakeRefreshRepo is a RefreshTokenRepository backed by a map. Mirrors the
// semantics of the Postgres implementation closely enough for auth unit tests
// (rotation, reuse detection, revoke-all).
type fakeRefreshRepo struct {
	mu      sync.Mutex
	byJTI   map[uuid.UUID]*repository.RefreshToken
	byID    map[uuid.UUID]*repository.RefreshToken
}

func newFakeRefreshRepo() *fakeRefreshRepo {
	return &fakeRefreshRepo{
		byJTI: map[uuid.UUID]*repository.RefreshToken{},
		byID:  map[uuid.UUID]*repository.RefreshToken{},
	}
}

func (r *fakeRefreshRepo) Create(_ context.Context, t repository.RefreshToken) (*repository.RefreshToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t.ID = uuid.New()
	t.CreatedAt = time.Now()
	copy := t
	r.byJTI[t.JTI] = &copy
	r.byID[t.ID] = &copy
	return &copy, nil
}

func (r *fakeRefreshRepo) GetByJTI(_ context.Context, jti uuid.UUID) (*repository.RefreshToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.byJTI[jti]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "refresh token not found", nil)
	}
	copy := *t
	return &copy, nil
}

func (r *fakeRefreshRepo) MarkReplaced(_ context.Context, oldID, newID uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.byID[oldID]
	if !ok || t.RevokedAt != nil {
		return domain.NewError(domain.ErrConflict, "refresh token already used", nil)
	}
	now := time.Now()
	t.RevokedAt = &now
	id := newID
	t.ReplacedBy = &id
	return nil
}

func (r *fakeRefreshRepo) Revoke(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.byID[id]
	if !ok || t.RevokedAt != nil {
		return nil
	}
	now := time.Now()
	t.RevokedAt = &now
	return nil
}

func (r *fakeRefreshRepo) RevokeAllForUser(_ context.Context, userID uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for _, t := range r.byID {
		if t.UserID == userID && t.RevokedAt == nil {
			t.RevokedAt = &now
		}
	}
	return nil
}

func newTestService() (AuthService, *fakeRefreshRepo) {
	refresh := newFakeRefreshRepo()
	svc := NewAuthService(newFakeUserRepo(), refresh, AuthConfig{
		AccessSecret:  []byte("a-very-long-test-secret-32-chars!!"),
		RefreshSecret: []byte("a-different-refresh-secret-32chars!"),
		AccessTTL:     5 * time.Minute,
		RefreshTTL:    time.Hour,
	})
	return svc, refresh
}

func TestRegisterAndLoginRoundtrip(t *testing.T) {
	svc, _ := newTestService()
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
	svc, _ := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "bob", "bob@example.com", "correct-horse")

	_, _, _, err := svc.Login(ctx, "bob@example.com", "wrong")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrUnauthorized {
		t.Fatalf("expected ErrUnauthorized, got %v", err)
	}
}

func TestRegisterValidation(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	cases := []struct {
		name, user, email, pass string
	}{
		{"short username", "ab", "a@b.com", "12345678"},
		{"bad email", "alice", "no-at-sign", "12345678"},
		{"short password", "alice", "a@b.com", "short"},
		{"long password", "alice", "a@b.com", string(make([]byte, 73))},
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

func TestRefreshProducesFreshAccessAndRotates(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "carol", "carol@example.com", "passphrase9")

	_, refresh, _, err := svc.Login(ctx, "carol@example.com", "passphrase9")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	result, err := svc.Refresh(ctx, refresh)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if result.Refresh == refresh {
		t.Fatalf("refresh token was not rotated")
	}
	claims, err := svc.ParseAccessToken(result.Access)
	if err != nil {
		t.Fatalf("parse refreshed access: %v", err)
	}
	if claims.Type != tokenTypeAccess {
		t.Errorf("expected access type, got %s", claims.Type)
	}

	// Old refresh token must now be rejected — it was rotated.
	if _, err := svc.Refresh(ctx, refresh); err == nil {
		t.Fatal("expected second use of rotated refresh to fail")
	}
}

func TestRefreshReuseRevokesEntireFamily(t *testing.T) {
	svc, store := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "dana", "dana@example.com", "passphrase9")

	_, refresh1, user, err := svc.Login(ctx, "dana@example.com", "passphrase9")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	result, err := svc.Refresh(ctx, refresh1)
	if err != nil {
		t.Fatalf("first refresh: %v", err)
	}
	refresh2 := result.Refresh

	// Replay the (now rotated) first token — attacker scenario.
	if _, err := svc.Refresh(ctx, refresh1); err == nil {
		t.Fatal("expected replay of rotated token to fail")
	}

	// Reuse detection should revoke the live token too, so the legit next
	// refresh is also denied.
	if _, err := svc.Refresh(ctx, refresh2); err == nil {
		t.Fatal("expected token-family to be revoked after replay")
	}

	// Every stored row for the user is revoked.
	for _, r := range store.byID {
		if r.UserID == user.ID && r.RevokedAt == nil {
			t.Fatalf("expected token %v to be revoked", r.JTI)
		}
	}
}

func TestLogoutRevokesRefreshToken(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "erin", "erin@example.com", "passphrase9")
	_, refresh, _, _ := svc.Login(ctx, "erin@example.com", "passphrase9")

	if err := svc.Logout(ctx, refresh); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, err := svc.Refresh(ctx, refresh); err == nil {
		t.Fatal("expected refresh after logout to fail")
	}
}

func TestAccessTokenCannotBeUsedAsRefresh(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, _ = svc.Register(ctx, "dave", "dave@example.com", "passphrase9")
	access, _, _, _ := svc.Login(ctx, "dave@example.com", "passphrase9")

	if _, err := svc.Refresh(ctx, access); err == nil {
		t.Fatal("expected refresh to reject an access token")
	}
}
