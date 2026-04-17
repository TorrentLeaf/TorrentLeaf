package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

type torrentRepo struct {
	pool *pgxpool.Pool
}

func NewTorrentRepository(pool *pgxpool.Pool) TorrentRepository {
	return &torrentRepo{pool: pool}
}

const torrentSessionColumns = `id, user_id, info_hash, magnet_uri, name, status,
	total_size, downloaded_bytes, peers_count, download_speed, upload_speed,
	created_at, updated_at`

func (r *torrentRepo) Create(ctx context.Context, s domain.TorrentSession) (*domain.TorrentSession, error) {
	const q = `
		INSERT INTO torrent_sessions (user_id, info_hash, magnet_uri, name, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + torrentSessionColumns

	row := r.pool.QueryRow(ctx, q, s.UserID, s.InfoHash, s.MagnetURI, s.Name, s.Status)
	out, err := scanTorrentSession(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, domain.NewError(domain.ErrConflict, "torrent already added", err)
		}
		return nil, fmt.Errorf("create torrent session: %w", err)
	}
	return out, nil
}

func (r *torrentRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.TorrentSession, error) {
	return r.getBy(ctx, "id = $1", id)
}

func (r *torrentRepo) GetByInfoHash(ctx context.Context, infoHash string) (*domain.TorrentSession, error) {
	return r.getBy(ctx, "info_hash = $1", infoHash)
}

func (r *torrentRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error) {
	q := "SELECT " + torrentSessionColumns +
		" FROM torrent_sessions WHERE user_id = $1 ORDER BY created_at DESC"
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("list torrent sessions: %w", err)
	}
	defer rows.Close()

	var out []domain.TorrentSession
	for rows.Next() {
		s, err := scanTorrentSession(rows)
		if err != nil {
			return nil, fmt.Errorf("scan torrent session: %w", err)
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func (r *torrentRepo) ListAll(ctx context.Context) ([]domain.TorrentSession, error) {
	q := "SELECT " + torrentSessionColumns +
		" FROM torrent_sessions ORDER BY created_at DESC"
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list all torrent sessions: %w", err)
	}
	defer rows.Close()

	var out []domain.TorrentSession
	for rows.Next() {
		s, err := scanTorrentSession(rows)
		if err != nil {
			return nil, fmt.Errorf("scan torrent session: %w", err)
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func (r *torrentRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.TorrentStatus) error {
	const q = `UPDATE torrent_sessions SET status = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id, status)
	if err != nil {
		return fmt.Errorf("update status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}
	return nil
}

// UpdateMetadata is used by the engine webhook once metadata is fetched.
func (r *torrentRepo) UpdateMetadata(ctx context.Context, infoHash, name string, totalSize int64) error {
	const q = `
		UPDATE torrent_sessions
		SET name = $2, total_size = $3, status = 'downloading'
		WHERE info_hash = $1`
	tag, err := r.pool.Exec(ctx, q, infoHash, name, totalSize)
	if err != nil {
		return fmt.Errorf("update metadata: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}
	return nil
}

func (r *torrentRepo) Delete(ctx context.Context, id uuid.UUID) error {
	const q = `DELETE FROM torrent_sessions WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return fmt.Errorf("delete torrent session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NewError(domain.ErrNotFound, "torrent session not found", nil)
	}
	return nil
}

func (r *torrentRepo) getBy(ctx context.Context, where string, arg any) (*domain.TorrentSession, error) {
	q := "SELECT " + torrentSessionColumns + " FROM torrent_sessions WHERE " + where + " LIMIT 1"
	row := r.pool.QueryRow(ctx, q, arg)
	s, err := scanTorrentSession(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewError(domain.ErrNotFound, "torrent session not found", err)
		}
		return nil, fmt.Errorf("get torrent session: %w", err)
	}
	return s, nil
}

func scanTorrentSession(r rowScanner) (*domain.TorrentSession, error) {
	var s domain.TorrentSession
	var magnet, name *string
	var totalSize *int64
	if err := r.Scan(
		&s.ID, &s.UserID, &s.InfoHash, &magnet, &name, &s.Status,
		&totalSize, &s.DownloadedBytes, &s.PeersCount, &s.DownloadSpeed, &s.UploadSpeed,
		&s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if magnet != nil {
		s.MagnetURI = *magnet
	}
	if name != nil {
		s.Name = *name
	}
	if totalSize != nil {
		s.TotalSize = *totalSize
	}
	return &s, nil
}

// ─── Torrent Files ────────────────────────────────────────────────────────────

type torrentFileRepo struct {
	pool *pgxpool.Pool
}

func NewTorrentFileRepository(pool *pgxpool.Pool) TorrentFileRepository {
	return &torrentFileRepo{pool: pool}
}

func (r *torrentFileRepo) CreateBatch(ctx context.Context, files []domain.TorrentFile) error {
	if len(files) == 0 {
		return nil
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const q = `
		INSERT INTO torrent_files (session_id, file_index, name, path, length, mime_type, file_type, priority)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (session_id, file_index) DO NOTHING`

	for _, f := range files {
		if _, err := tx.Exec(ctx, q,
			f.SessionID, f.Index, f.Name, f.Path, f.Length, f.MimeType, f.FileType, f.Priority,
		); err != nil {
			return fmt.Errorf("insert torrent file: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func (r *torrentFileRepo) ListBySession(ctx context.Context, sessionID uuid.UUID) ([]domain.TorrentFile, error) {
	const q = `
		SELECT id, session_id, file_index, name, path, length,
		       COALESCE(mime_type, ''), COALESCE(file_type, 'unknown'), priority
		FROM torrent_files
		WHERE session_id = $1
		ORDER BY file_index ASC`

	rows, err := r.pool.Query(ctx, q, sessionID)
	if err != nil {
		return nil, fmt.Errorf("list torrent files: %w", err)
	}
	defer rows.Close()

	var out []domain.TorrentFile
	for rows.Next() {
		var f domain.TorrentFile
		if err := rows.Scan(&f.ID, &f.SessionID, &f.Index, &f.Name, &f.Path, &f.Length,
			&f.MimeType, &f.FileType, &f.Priority); err != nil {
			return nil, fmt.Errorf("scan torrent file: %w", err)
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *torrentFileRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.TorrentFile, error) {
	const q = `
		SELECT id, session_id, file_index, name, path, length,
		       COALESCE(mime_type, ''), COALESCE(file_type, 'unknown'), priority
		FROM torrent_files
		WHERE id = $1
		LIMIT 1`
	var f domain.TorrentFile
	row := r.pool.QueryRow(ctx, q, id)
	if err := row.Scan(&f.ID, &f.SessionID, &f.Index, &f.Name, &f.Path, &f.Length,
		&f.MimeType, &f.FileType, &f.Priority); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewError(domain.ErrNotFound, "torrent file not found", err)
		}
		return nil, fmt.Errorf("get torrent file: %w", err)
	}
	return &f, nil
}

func (r *torrentFileRepo) UpdatePriority(ctx context.Context, id uuid.UUID, priority int) error {
	const q = `UPDATE torrent_files SET priority = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, id, priority)
	if err != nil {
		return fmt.Errorf("update priority: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NewError(domain.ErrNotFound, "torrent file not found", nil)
	}
	return nil
}
