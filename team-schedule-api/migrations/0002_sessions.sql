-- sessions: store short-lived admin/site sessions in D1 when enabled
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,            -- 'admin' | 'site'
  csrf TEXT,                     -- present for admin sessions
  exp_ts INTEGER NOT NULL,       -- unix epoch seconds
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sessions_kind_exp ON sessions(kind, exp_ts);

