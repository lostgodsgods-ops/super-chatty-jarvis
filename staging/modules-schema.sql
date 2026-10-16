-- STAGING ONLY. Apply only to super-chatty-passkey-staging D1.
CREATE TABLE IF NOT EXISTS owner_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id INTEGER NOT NULL CHECK (owner_id = 1),
  task_type TEXT NOT NULL CHECK (task_type IN ('read_only_research', 'code_review')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_tasks_status_created ON owner_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_owner_tasks_owner_created ON owner_tasks(owner_id, created_at);

CREATE TABLE IF NOT EXISTS owner_task_results (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL UNIQUE REFERENCES owner_tasks(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL CHECK (owner_id = 1),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_task_results_task_created ON owner_task_results(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_owner_task_results_owner_created ON owner_task_results(owner_id, created_at);

CREATE TABLE IF NOT EXISTS owner_memory (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id INTEGER NOT NULL CHECK (owner_id = 1),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_memory_owner_updated ON owner_memory(owner_id, updated_at);

CREATE TABLE IF NOT EXISTS owner_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id INTEGER NOT NULL CHECK (owner_id = 1),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_audit_owner_created ON owner_audit_log(owner_id, created_at);
