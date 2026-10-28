-- Additive D1 schema for owner-reviewed capability proposals and verified knowledge.
-- This migration does not grant tool execution or bypass owner approval.
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
