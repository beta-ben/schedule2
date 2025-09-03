PRAGMA foreign_keys = ON;

-- agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  meta TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);

-- shifts
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NOT NULL,
  role TEXT,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(start_ts);
CREATE INDEX IF NOT EXISTS idx_shifts_agent_start ON shifts(agent_id,start_ts);

-- settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  val TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT,
  subject_type TEXT,
  subject_id TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);