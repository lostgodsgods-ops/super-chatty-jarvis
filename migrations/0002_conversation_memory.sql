CREATE TABLE IF NOT EXISTS conversation_memory (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL,
  session_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_scope, session_id, memory_type)
);
CREATE INDEX IF NOT EXISTS idx_conversation_memory_session_updated
  ON conversation_memory(owner_scope, session_id, updated_at DESC);
