-- migrations/003_refresh_tokens.up.sql
-- Persist refresh tokens so we can revoke on logout and detect replay of a
-- rotated (already-used) token. We store only a SHA-256 of the token body —
-- never the plaintext — so a DB dump does not hand out valid sessions.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti         UUID NOT NULL UNIQUE,
    token_hash  BYTEA NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    -- replaced_by points at the row that was issued when this token was
    -- rotated. Non-null + revoked_at set = legitimate rotation; replay of
    -- such a token means the client chain is compromised.
    replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
