package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type refreshTokenRepo struct {
	pool *pgxpool.Pool
}

func NewRefreshTokenRepository(pool *pgxpool.Pool) RefreshTokenRepository {
	return &refreshTokenRepo{pool: pool}
}

const refreshTokenColumns = `id, user_id, jti, token_hash, expires_at,
	revoked_at, replaced_by, created_at`

func (r *refreshTokenRepo) Create(ctx context.Context, t RefreshToken) (*RefreshToken, error) {
	const q = `
		INSERT INTO refresh_tokens (user_id, jti, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + refreshTokenColumns

	row := r.pool.QueryRow(ctx, q, t.UserID, t.JTI, t.TokenHash, t.ExpiresAt)
	out, err := scanRefreshToken(row)
	if err != nil {
		return nil, fmt.Errorf("create refresh token: %w", err)
	}
	return out, nil
}

func (r *refreshTokenRepo) GetByJTI(ctx context.Context, jti uuid.UUID) (*RefreshToken, error) {
	const q = `SELECT ` + refreshTokenColumns + ` FROM refresh_tokens WHERE jti = $1 LIMIT 1`
	row := r.pool.QueryRow(ctx, q, jti)
	out, err := scanRefreshToken(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewError(domain.ErrNotFound, "refresh token not found", err)
		}
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return out, nil
}

func (r *refreshTokenRepo) MarkReplaced(ctx context.Context, oldID, newID uuid.UUID) error {
	const q = `
		UPDATE refresh_tokens
		SET revoked_at = NOW(), replaced_by = $2
		WHERE id = $1 AND revoked_at IS NULL`
	tag, err := r.pool.Exec(ctx, q, oldID, newID)
	if err != nil {
		return fmt.Errorf("mark replaced: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Row missing or already revoked — caller treats this as a replay.
		return domain.NewError(domain.ErrConflict, "refresh token already used", nil)
	}
	return nil
}

func (r *refreshTokenRepo) Revoke(ctx context.Context, id uuid.UUID) error {
	const q = `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`
	if _, err := r.pool.Exec(ctx, q, id); err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

func (r *refreshTokenRepo) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	const q = `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`
	if _, err := r.pool.Exec(ctx, q, userID); err != nil {
		return fmt.Errorf("revoke all refresh tokens: %w", err)
	}
	return nil
}

func scanRefreshToken(r rowScanner) (*RefreshToken, error) {
	var t RefreshToken
	if err := r.Scan(
		&t.ID, &t.UserID, &t.JTI, &t.TokenHash, &t.ExpiresAt,
		&t.RevokedAt, &t.ReplacedBy, &t.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &t, nil
}
