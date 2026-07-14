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

type libraryRepo struct {
	pool *pgxpool.Pool
}

func NewLibraryRepository(pool *pgxpool.Pool) LibraryRepository {
	return &libraryRepo{pool: pool}
}

const libraryColumns = `id, user_id, session_id, title,
	COALESCE(cover_url, ''), content_type, added_at, last_read_at`

func (r *libraryRepo) Create(ctx context.Context, item domain.LibraryItem) (*domain.LibraryItem, error) {
	const q = `
		INSERT INTO library_items (user_id, session_id, title, cover_url, content_type)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5)
		RETURNING ` + libraryColumns

	row := r.pool.QueryRow(ctx, q, item.UserID, item.SessionID, item.Title, item.CoverURL, item.Type)
	out, err := scanLibraryItem(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, domain.NewError(domain.ErrConflict, "already in library", err)
		}
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return nil, domain.NewError(domain.ErrNotFound, "session not found", err)
		}
		return nil, fmt.Errorf("create library item: %w", err)
	}
	return out, nil
}

func (r *libraryRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.LibraryItem, error) {
	q := "SELECT " + libraryColumns + " FROM library_items WHERE id = $1 LIMIT 1"
	row := r.pool.QueryRow(ctx, q, id)
	out, err := scanLibraryItem(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewError(domain.ErrNotFound, "library item not found", err)
		}
		return nil, fmt.Errorf("get library item: %w", err)
	}
	return out, nil
}

// ListByUser returns the user's library items enriched with their favorite
// flag and the most recent reading_progress row across each torrent session's
// files. Everything is joined in a single query so card rendering is O(1)
// per request.
func (r *libraryRepo) ListByUser(ctx context.Context, userID uuid.UUID, filter LibraryListFilter) ([]LibraryItemWithMeta, error) {
	// Build dynamic WHERE clause. Keep it simple: two optional filters.
	where := "li.user_id = $1"
	args := []any{userID}
	if filter.Type != "" {
		where += fmt.Sprintf(" AND li.content_type = $%d", len(args)+1)
		args = append(args, filter.Type)
	}
	if filter.FavoritesOnly {
		where += " AND fav.session_id IS NOT NULL"
	}

	q := `
		SELECT ` + libraryColumnsPrefixed("li") + `,
		       (fav.session_id IS NOT NULL) AS is_favorite,
		       last_read.current_page,
		       last_read.total_pages,
		       last_read.last_read_at,
		       COALESCE((
		           SELECT tf.file_type
		           FROM torrent_files tf
		           WHERE tf.session_id = li.session_id AND tf.file_type IS NOT NULL
		           GROUP BY tf.file_type
		           ORDER BY COUNT(*) DESC, tf.file_type ASC
		           LIMIT 1
		       ), 'unknown') AS dominant_file_type
		FROM library_items li
		LEFT JOIN favorites fav
		       ON fav.user_id = li.user_id AND fav.session_id = li.session_id
		LEFT JOIN LATERAL (
		    SELECT rp.current_page, rp.total_pages, rp.last_read_at
		    FROM reading_progress rp
		    JOIN torrent_files tf ON tf.id = rp.file_id
		    WHERE rp.user_id = li.user_id AND tf.session_id = li.session_id
		    ORDER BY rp.last_read_at DESC
		    LIMIT 1
		) last_read ON TRUE
		WHERE ` + where + `
		ORDER BY COALESCE(last_read.last_read_at, li.added_at) DESC`

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list library: %w", err)
	}
	defer rows.Close()

	out := make([]LibraryItemWithMeta, 0)
	for rows.Next() {
		var m LibraryItemWithMeta
		if err := scanLibraryItemWithMeta(rows, &m); err != nil {
			return nil, fmt.Errorf("scan library item: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *libraryRepo) UpdateTitleBySession(ctx context.Context, sessionID uuid.UUID, title string) error {
	const q = `UPDATE library_items SET title = $2 WHERE session_id = $1`
	if _, err := r.pool.Exec(ctx, q, sessionID, title); err != nil {
		return fmt.Errorf("update library title: %w", err)
	}
	return nil
}

func (r *libraryRepo) UpdateTypeBySession(ctx context.Context, sessionID uuid.UUID, itemType domain.LibraryItemType) error {
	const q = `UPDATE library_items SET content_type = $2 WHERE session_id = $1`
	if _, err := r.pool.Exec(ctx, q, sessionID, string(itemType)); err != nil {
		return fmt.Errorf("update library type: %w", err)
	}
	return nil
}

func (r *libraryRepo) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM library_items WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("delete library item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NewError(domain.ErrNotFound, "library item not found", nil)
	}
	return nil
}

// ─── Favorites ────────────────────────────────────────────────────────────────

type favoritesRepo struct {
	pool *pgxpool.Pool
}

func NewFavoritesRepository(pool *pgxpool.Pool) FavoritesRepository {
	return &favoritesRepo{pool: pool}
}

func (r *favoritesRepo) Add(ctx context.Context, userID, sessionID uuid.UUID) error {
	const q = `
		INSERT INTO favorites (user_id, session_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, session_id) DO NOTHING`
	if _, err := r.pool.Exec(ctx, q, userID, sessionID); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return domain.NewError(domain.ErrNotFound, "session not found", err)
		}
		return fmt.Errorf("add favorite: %w", err)
	}
	return nil
}

func (r *favoritesRepo) Remove(ctx context.Context, userID, sessionID uuid.UUID) error {
	const q = `DELETE FROM favorites WHERE user_id = $1 AND session_id = $2`
	if _, err := r.pool.Exec(ctx, q, userID, sessionID); err != nil {
		return fmt.Errorf("remove favorite: %w", err)
	}
	return nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func libraryColumnsPrefixed(alias string) string {
	return alias + ".id, " +
		alias + ".user_id, " +
		alias + ".session_id, " +
		alias + ".title, " +
		"COALESCE(" + alias + ".cover_url, ''), " +
		alias + ".content_type, " +
		alias + ".added_at, " +
		alias + ".last_read_at"
}

func scanLibraryItem(r rowScanner) (*domain.LibraryItem, error) {
	var item domain.LibraryItem
	if err := r.Scan(
		&item.ID, &item.UserID, &item.SessionID, &item.Title,
		&item.CoverURL, &item.Type, &item.AddedAt, &item.LastReadAt,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

func scanLibraryItemWithMeta(r rowScanner, m *LibraryItemWithMeta) error {
	return r.Scan(
		&m.Item.ID, &m.Item.UserID, &m.Item.SessionID, &m.Item.Title,
		&m.Item.CoverURL, &m.Item.Type, &m.Item.AddedAt, &m.Item.LastReadAt,
		&m.IsFavorite,
		&m.LastReadPage, &m.LastReadTotal, &m.LastReadAt,
		&m.DominantFileType,
	)
}
