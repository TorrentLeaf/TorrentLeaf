-- migrations/007_torrent_ttl_eviction.up.sql
-- TTL eviction: track last active use, allow an 'evicted' status, and index
-- the staleness query.

ALTER TABLE torrent_sessions
    ADD COLUMN IF NOT EXISTS last_touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE torrent_sessions DROP CONSTRAINT IF EXISTS torrent_sessions_status_check;
ALTER TABLE torrent_sessions ADD CONSTRAINT torrent_sessions_status_check
    CHECK (status IN (
        'fetching_metadata','downloading','seeding','paused','error','evicted'
    ));

CREATE INDEX IF NOT EXISTS idx_torrent_sessions_touch
    ON torrent_sessions (status, last_touched_at);
