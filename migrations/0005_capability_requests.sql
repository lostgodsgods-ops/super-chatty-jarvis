CREATE TABLE IF NOT EXISTS capability_requests (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  rationale TEXT NOT NULL,
  requested_tools_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending_owner_review','approved','rejected','implemented')),
  execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK(execution_enabled = 0),
  requires_owner_approval INTEGER NOT NULL DEFAULT 1 CHECK(requires_owner_approval = 1),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capability_requests_created_at
  ON capability_requests(created_at DESC);
