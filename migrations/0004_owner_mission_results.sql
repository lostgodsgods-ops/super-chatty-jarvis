-- Persist synthesized multi-agent mission outcomes separately from individual task results.
CREATE TABLE IF NOT EXISTS owner_mission_results (
  id TEXT PRIMARY KEY NOT NULL,
  mission_id TEXT NOT NULL UNIQUE,
  owner_id INTEGER NOT NULL CHECK (owner_id = 1),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_mission_results_owner_created
  ON owner_mission_results(owner_id, created_at DESC);