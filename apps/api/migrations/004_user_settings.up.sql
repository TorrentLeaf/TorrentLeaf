CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  download_path TEXT NOT NULL DEFAULT '/data/torrents',
  default_reading_mode VARCHAR(20) NOT NULL DEFAULT 'paginated',
  default_fit_mode VARCHAR(20) NOT NULL DEFAULT 'fit-width',
  reading_direction VARCHAR(5) NOT NULL DEFAULT 'ltr',
  auto_add_library BOOLEAN NOT NULL DEFAULT true,
  reader_background VARCHAR(7) NOT NULL DEFAULT '#000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
