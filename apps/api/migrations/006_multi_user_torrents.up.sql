-- migrations/006_multi_user_torrents.up.sql
-- Allow multiple users to add the same torrent by changing the unique
-- constraint from (info_hash) to (user_id, info_hash).

-- Drop the old global unique constraint
ALTER TABLE torrent_sessions DROP CONSTRAINT IF EXISTS torrent_sessions_info_hash_key;

-- Add a composite unique so each user can have their own session for the same hash
CREATE UNIQUE INDEX IF NOT EXISTS uq_torrent_sessions_user_hash
    ON torrent_sessions (user_id, info_hash);

-- Also update metadata queries: they need to update ALL sessions with a given
-- info_hash (not just one), since multiple users may share the same torrent.
