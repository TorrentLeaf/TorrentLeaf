-- migrations/007_torrent_ttl_eviction.down.sql
DROP INDEX IF EXISTS idx_torrent_sessions_touch;

-- Evicted rows would violate the restored CHECK; fold them back to 'paused'.
UPDATE torrent_sessions SET status = 'paused' WHERE status = 'evicted';

ALTER TABLE torrent_sessions DROP CONSTRAINT IF EXISTS torrent_sessions_status_check;
ALTER TABLE torrent_sessions ADD CONSTRAINT torrent_sessions_status_check
    CHECK (status IN (
        'fetching_metadata','downloading','seeding','paused','error'
    ));

ALTER TABLE torrent_sessions DROP COLUMN IF EXISTS last_touched_at;
