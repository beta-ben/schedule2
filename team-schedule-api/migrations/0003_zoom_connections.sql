-- Zoom OAuth connections for multi-user ingestion
CREATE TABLE IF NOT EXISTS zoom_connections (
  id TEXT PRIMARY KEY,
  zoom_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  account_id TEXT,
  scope TEXT,
  token_type TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER,
  last_synced_at INTEGER,
  sync_cursor TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_zoom_connections_email ON zoom_connections(email);
CREATE INDEX IF NOT EXISTS idx_zoom_connections_expires ON zoom_connections(expires_at);
