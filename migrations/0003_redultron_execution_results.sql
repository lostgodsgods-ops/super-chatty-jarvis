CREATE TABLE IF NOT EXISTS redultron_execution_results (
  result_id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  task_id TEXT,
  core_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED')),
  verification TEXT NOT NULL CHECK (verification IN ('VERIFIED', 'UNVERIFIED', 'FAILED')),
  created_at TEXT NOT NULL,
  build_sha TEXT,
  deployment_id TEXT,
  envelope_json TEXT NOT NULL,
  UNIQUE(owner_scope, trace_id, result_id)
);

CREATE INDEX IF NOT EXISTS idx_redultron_results_owner_created
  ON redultron_execution_results(owner_scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_redultron_results_trace
  ON redultron_execution_results(owner_scope, trace_id);

CREATE INDEX IF NOT EXISTS idx_redultron_results_execution
  ON redultron_execution_results(owner_scope, execution_id);
