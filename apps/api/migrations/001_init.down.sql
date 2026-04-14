-- migrations/001_init.down.sql
DROP TRIGGER IF EXISTS trg_torrent_sessions_updated_at ON torrent_sessions;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at();

DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS library_items;
DROP TABLE IF EXISTS reading_progress;
DROP TABLE IF EXISTS torrent_files;
DROP TABLE IF EXISTS torrent_sessions;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS "vector";
DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";
