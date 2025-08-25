CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','draft','archived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_versions_active_week ON schedule_versions(week_start) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS schedule_version_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  start TIMESTAMPTZ NOT NULL,
  "end" TIMESTAMPTZ NOT NULL,
  posture_id TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS coverage_cache (
  version_id UUID PRIMARY KEY REFERENCES schedule_versions(id) ON DELETE CASCADE,
  bin_minutes INT NOT NULL DEFAULT 30,
  series JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
