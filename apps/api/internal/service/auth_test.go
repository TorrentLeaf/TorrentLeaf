package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

// These tests are the security-focused counterpart to auth_impl_test.go.
// They lock down the password-handling guarantees the security skill §9
// requires: bcrypt salting, verification, and the 8–72 length bounds.

func TestPasswordHashIsSaltedPerUser(t *testing.T) {
	svc, _ := newTestService()
	users := svc.(*authService).users.(*fakeUserRepo)
	ctx := context.Background()

	const samePass = "correct-horse-battery"
	if _, err := svc.Register(ctx, "alice", "alice@example.com", samePass); err != nil {
		t.Fatalf("register alice: %v", err)
	}
	if _, err := svc.Register(ctx, "bob", "bob@example.com", samePass); err != nil {
		t.Fatalf("register bob: %v", err)
	}

	h1 := users.byEmail["alice@example.com"].PasswordHash
	h2 := users.byEmail["bob@example.com"].PasswordHash
	if h1 == "" || h2 == "" {
		t.Fatalf("hashes were not persisted")
	}
	if h1 == h2 {
		t.Fatalf("identical bcrypt output for same password — salt is missing")
	}
	if !strings.HasPrefix(h1, "$2a$") && !strings.HasPrefix(h1, "$2b$") && !strings.HasPrefix(h1, "$2y$") {
		t.Fatalf("hash does not look like bcrypt: %q", h1)
	}
}

func TestVerifyPasswordAcceptsCorrectAndRejectsWrong(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	const pass = "correct-horse-battery"
	if _, err := svc.Register(ctx, "alice", "alice@example.com", pass); err != nil {
		t.Fatalf("register: %v", err)
	}

	// Correct password → login returns tokens (verifyPassword path succeeded).
	access, refresh, u, err := svc.Login(ctx, "alice@example.com", pass)
	if err != nil {
		t.Fatalf("login with correct password failed: %v", err)
	}
	if access == "" || refresh == "" || u == nil {
		t.Fatalf("expected populated tokens/user on success")
	}

	// Wrong password → ErrUnauthorized, not a different code that could be
	// used to distinguish "bad password" from other failures.
	_, _, _, err = svc.Login(ctx, "alice@example.com", "nope-"+pass)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrUnauthorized {
		t.Fatalf("expected ErrUnauthorized on wrong password, got %v", err)
	}
}

func TestRegisterRejectsPasswordUnder8Chars(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	for _, pass := range []string{"", "a", "1234567"} {
		_, err := svc.Register(ctx, "alice", "alice@example.com", pass)
		var de *domain.Error
		if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
			t.Fatalf("pass %q: expected ErrInvalidInput, got %v", pass, err)
		}
	}
}

func TestRegisterRejectsPasswordOver72Chars(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	// bcrypt silently truncates at 72 bytes — the service must reject before
	// a user "sets" a password that is effectively its 72-byte prefix.
	over := strings.Repeat("a", 73)
	_, err := svc.Register(ctx, "alice", "alice@example.com", over)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput for 73-char password, got %v", err)
	}

	// 72 exactly is the last acceptable length.
	edge := strings.Repeat("a", 72)
	if _, err := svc.Register(ctx, "bob", "bob@example.com", edge); err != nil {
		t.Fatalf("72-char password should be accepted, got %v", err)
	}
}
