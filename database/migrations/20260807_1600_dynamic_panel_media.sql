CREATE TABLE IF NOT EXISTS panel_media_assets (
  slot TEXT PRIMARY KEY CHECK (slot IN ('dashboard_banner', 'login_banner', 'login_music')),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video', 'audio')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  file_data BYTEA,
  storage_path TEXT,
  version TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (file_data IS NOT NULL AND storage_path IS NULL)
    OR (file_data IS NULL AND storage_path IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_panel_media_assets_updated_at
  ON panel_media_assets(updated_at DESC);
