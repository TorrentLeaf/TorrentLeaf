package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// RefreshToken is the persisted record for a single refresh token. TokenHash
// is the raw SHA-256 of the token body; the plaintext is never stored.
type RefreshToken struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	JTI        uuid.UUID
	TokenHash  []byte
	ExpiresAt  time.Time
	RevokedAt  *time.Time
	ReplacedBy *uuid.UUID
	CreatedAt  time.Time
}

// IsActive reports whether the token can still be exchanged right now.
func (t *RefreshToken) IsActive(now time.Time) bool {
	return t.RevokedAt == nil && t.ExpiresAt.After(now)
}

type RefreshTokenRepository interface {
	Create(ctx context.Context, t RefreshToken) (*RefreshToken, error)
	GetByJTI(ctx context.Context, jti uuid.UUID) (*RefreshToken, error)
	// MarkReplaced marks oldID as revoked and records that newID superseded it.
	// Must be atomic — the rotation decision depends on this being consistent.
	MarkReplaced(ctx context.Context, oldID, newID uuid.UUID) error
	// Revoke flips revoked_at for the row (used by Logout).
	Revoke(ctx context.Context, id uuid.UUID) error
	// RevokeAllForUser is the nuclear option after we detect a rotated-token
	// replay: every outstanding refresh for the user is invalidated.
	RevokeAllForUser(ctx context.Context, userID uuid.UUID) error
}
