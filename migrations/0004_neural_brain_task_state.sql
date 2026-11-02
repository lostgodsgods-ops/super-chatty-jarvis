CREATE TABLE IF NOT EXISTS neural_brain_tasks (
  task_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  status TEXT NOT NULL CHECK (status IN (
    'PLANNED', 'QUEUED', 'RUNNING', 'VERIFYING',
    'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'
  )),
  goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 500),
  task_type TEXT NOT NULL CHECK (task_type IN ('question', 'research', 'coding', 'planning', 'action')),
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  provider_id TEXT,
  model_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_neural_brain_tasks_status_updated
  ON neural_brain_tasks(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS neural_brain_task_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN (
    'PLANNED', 'QUEUED', 'RUNNING', 'VERIFYING',
    'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'
  )),
  event_type TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
  error_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES neural_brain_tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_neural_brain_task_events_task_created
  ON neural_brain_task_events(task_id, created_at, event_id);
