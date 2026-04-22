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

type progressRepo struct {
	pool *pgxpool.Pool
}

func NewProgressRepository(pool *pgxpool.Pool) ProgressRepository {
	return &progressRepo{pool: pool}
}

const progressColumns = "id, user_id, file_id, current_page, total_pages, reading_mode, location, last_read_at"

func (r *progressRepo) Upsert(ctx context.Context, p domain.ReadingProgress) (*domain.ReadingProgress, error) {
	const q = `
		INSERT INTO reading_progress (user_id, file_id, current_page, total_pages, reading_mode, location, last_read_at)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NOW())
		ON CONFLICT (user_id, file_id) DO UPDATE
		SET current_page = EXCLUDED.current_page,
		    total_pages  = COALESCE(EXCLUDED.total_pages, reading_progress.total_pages),
		    reading_mode = EXCLUDED.reading_mode,
		    location     = COALESCE(EXCLUDED.location, reading_progress.location),
		    last_read_at = NOW()
		RETURNING ` + progressColumns

	row := r.pool.QueryRow(ctx, q, p.UserID, p.FileID, p.CurrentPage, p.TotalPages, p.ReadingMode, p.Location)
	out, err := scanProgress(row)
	if err != nil {
		return nil, fmt.Errorf("upsert progress: %w", err)
	}
	return out, nil
}

func (r *progressRepo) Get(ctx context.Context, userID, fileID uuid.UUID) (*domain.ReadingProgress, error) {
	q := "SELECT " + progressColumns +
		" FROM reading_progress WHERE user_id = $1 AND file_id = $2 LIMIT 1"
	row := r.pool.QueryRow(ctx, q, userID, fileID)
	p, err := scanProgress(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewError(domain.ErrNotFound, "reading progress not found", err)
		}
		return nil, fmt.Errorf("get progress: %w", err)
	}
	return p, nil
}

func scanProgress(r rowScanner) (*domain.ReadingProgress, error) {
	var p domain.ReadingProgress
	var totalPages *int
	var location *string
	if err := r.Scan(&p.ID, &p.UserID, &p.FileID, &p.CurrentPage,
		&totalPages, &p.ReadingMode, &location, &p.LastReadAt); err != nil {
		return nil, err
	}
	if totalPages != nil {
		p.TotalPages = *totalPages
	}
	if location != nil {
		p.Location = *location
	}
	return &p, nil
}
