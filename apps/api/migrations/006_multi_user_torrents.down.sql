-- migrations/006_multi_user_torrents.down.sql
DROP INDEX IF EXISTS uq_torrent_sessions_user_hash;
ALTER TABLE torrent_sessions ADD CONSTRAINT torrent_sessions_info_hash_key UNIQUE (info_hash);
