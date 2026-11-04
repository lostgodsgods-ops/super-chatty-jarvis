-- Owner-scoped learning records. Pending submissions never become verified implicitly.
CREATE TABLE IF NOT EXISTS pending_knowledge (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL CHECK (owner_scope = 'owner'),
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  test_summary TEXT NOT NULL,
  test_evidence_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  limitations TEXT NOT NULL,
  reuse_instructions TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'pending_owner_verification'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_knowledge_owner_updated
  ON pending_knowledge(owner_scope, updated_at DESC);

CREATE TABLE IF NOT EXISTS verified_knowledge (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL CHECK (owner_scope = 'owner'),
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  test_summary TEXT NOT NULL,
  test_evidence_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  limitations TEXT NOT NULL,
  reuse_instructions TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'verified'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verified_knowledge_owner_updated
  ON verified_knowledge(owner_scope, updated_at DESC);
