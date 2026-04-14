-- migrations/001_init.up.sql
-- Schema inicial do TorrentLeaf com pgvector habilitado desde o início.
-- pgvector permite busca semântica nos metadados sem migração futura dolorosa.

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector: busca por similaridade

-- ─── Usuários ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username     VARCHAR(50)  UNIQUE NOT NULL,
    email        VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role         VARCHAR(20)  NOT NULL DEFAULT 'user'
                 CHECK (role IN ('user', 'admin')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sessões de Torrent ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS torrent_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    info_hash        VARCHAR(40) UNIQUE NOT NULL,
    magnet_uri       TEXT,
    name             TEXT,
    status           VARCHAR(30) NOT NULL DEFAULT 'fetching_metadata'
                     CHECK (status IN (
                         'fetching_metadata','downloading','seeding','paused','error'
                     )),
    total_size       BIGINT,
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    peers_count      INT    NOT NULL DEFAULT 0,
    download_speed   FLOAT  NOT NULL DEFAULT 0,
    upload_speed     FLOAT  NOT NULL DEFAULT 0,
    -- pgvector: embedding do nome/metadados para busca semântica futura
    -- 1536 dims = OpenAI text-embedding-3-small / text-embedding-ada-002
    -- 768 dims  = modelos menores (all-MiniLM, BGE)
    -- Deixar NULL até popular com embeddings reais
    name_embedding   vector(768),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Arquivos do Torrent ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS torrent_files (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES torrent_sessions(id) ON DELETE CASCADE,
    file_index INT  NOT NULL,
    name       TEXT NOT NULL,
    path       TEXT NOT NULL,
    length     BIGINT NOT NULL,
    mime_type  VARCHAR(100),
    file_type  VARCHAR(20)
               CHECK (file_type IN ('image','pdf','epub','cbz','cbr','unknown')),
    priority   INT NOT NULL DEFAULT 1 CHECK (priority IN (0,1,2)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, file_index)
);

-- ─── Progresso de Leitura ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_progress (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id      UUID NOT NULL REFERENCES torrent_files(id) ON DELETE CASCADE,
    current_page INT  NOT NULL DEFAULT 0,
    total_pages  INT,
    reading_mode VARCHAR(20) NOT NULL DEFAULT 'paginated'
                 CHECK (reading_mode IN ('paginated','webtoon','double-page')),
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, file_id)
);

-- ─── Biblioteca ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id   UUID NOT NULL REFERENCES torrent_sessions(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    cover_url    TEXT,
    content_type VARCHAR(20) NOT NULL DEFAULT 'other'
                 CHECK (content_type IN ('manga','book','document','other')),
    added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    UNIQUE (user_id, session_id)
);

-- ─── Favoritos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favorites (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES torrent_sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, session_id)
);

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_torrent_sessions_user     ON torrent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_torrent_sessions_status   ON torrent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_torrent_files_session     ON torrent_files(session_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user     ON reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_file     ON reading_progress(file_id);
CREATE INDEX IF NOT EXISTS idx_library_user              ON library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_library_last_read         ON library_items(last_read_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_favorites_user            ON favorites(user_id);

-- Índice HNSW para busca por similaridade vetorial (pgvector)
-- Criado somente quando os embeddings começarem a ser populados
-- Descomentar quando tiver dados reais:
-- CREATE INDEX IF NOT EXISTS idx_torrent_sessions_embedding
--     ON torrent_sessions USING hnsw (name_embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);

-- ─── Trigger: updated_at automático ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_torrent_sessions_updated_at
    BEFORE UPDATE ON torrent_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
