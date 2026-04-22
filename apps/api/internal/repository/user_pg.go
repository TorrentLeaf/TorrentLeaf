package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

type userRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) UserRepository {
	return &userRepo{pool: pool}
}

const userColumns = "id, username, email, password_hash, role, created_at, updated_at"

func (r *userRepo) Create(ctx context.Context, u domain.User) (*domain.User, error) {
	const q = `
		INSERT INTO users (username, email, password_hash, role)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + userColumns

	row := r.pool.QueryRow(ctx, q, u.Username, u.Email, u.PasswordHash, u.Role)
	out, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, domain.NewError(domain.ErrConflict, "username or email already in use", err)
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return out, nil
}

func (r *userRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	return r.getBy(ctx, "id = $1", id)
}

func (r *userRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	return r.getBy(ctx, "email = $1", email)
}

func (r *userRepo) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	return r.getBy(ctx, "username = $1", username)
}

func (r *userRepo) getBy(ctx context.Context, where string, arg any) (*domain.User, error) {
	q := "SELECT " + userColumns + " FROM users WHERE " + where + " LIMIT 1"
	row := r.pool.QueryRow(ctx, q, arg)
	u, err := scanUser(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewError(domain.ErrNotFound, "user not found", err)
		}
		return nil, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(r rowScanner) (*domain.User, error) {
	var u domain.User
	if err := r.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}
