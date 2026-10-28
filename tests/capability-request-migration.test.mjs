import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0003_capability_requests.sql", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../central-agent/architecture/capability-request-queue.mjs", import.meta.url), "utf8");
const learningSource = await readFile(new URL("../central-agent/knowledge-learning.mjs", import.meta.url), "utf8");

const requiredSql = [
  /CREATE TABLE IF NOT EXISTS capability_requests/i,
  /id\s+TEXT\s+PRIMARY KEY/i,
  /goal\s+TEXT\s+NOT NULL/i,
  /rationale\s+TEXT\s+NOT NULL/i,
  /requested_tools_json\s+TEXT\s+NOT NULL/i,
  /status\s+TEXT\s+NOT NULL/i,
  /execution_enabled\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*execution_enabled\s*=\s*0\s*\)/i,
  /requires_owner_approval\s+INTEGER\s+NOT NULL\s+DEFAULT\s+1\s+CHECK\s*\(\s*requires_owner_approval\s*=\s*1\s*\)/i,
  /created_at\s+TEXT\s+NOT NULL/i
];

test("capability-request migration provisions the bounded owner-review schema", () => {
  for (const pattern of requiredSql) {
    assert.match(migration, pattern, `migration is missing required schema contract: ${pattern}`);
    assert.match(runtimeSource, pattern, `runtime schema contract drifted from migration: ${pattern}`);
  }
  assert.match(migration, /pending_owner_review/);
  assert.match(migration, /approved/);
  assert.match(migration, /rejected/);
  assert.match(migration, /implemented/);
});

test("capability-request migration is additive and contains no data mutation", () => {
  assert.doesNotMatch(migration, /\b(?:DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+capability_requests|INSERT\s+INTO)\b/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/i);
});

const knowledgeMigration = await readFile(new URL("../migrations/0004_verified_knowledge.sql", import.meta.url), "utf8");

test("verified-knowledge migration matches the owner-scoped runtime schema and is additive", () => {
  const required = [
    /CREATE TABLE IF NOT EXISTS verified_knowledge/i,
    /id\s+TEXT\s+PRIMARY KEY/i,
    /owner_scope\s+TEXT\s+NOT NULL\s+CHECK\s*\(\s*owner_scope\s*=\s*'owner'\s*\)/i,
    /sources_json\s+TEXT\s+NOT NULL/i,
    /test_evidence_json\s+TEXT\s+NOT NULL/i,
    /status\s+TEXT\s+NOT NULL\s+CHECK\s*\(\s*status\s*=\s*'verified'\s*\)/i,
    /created_at\s+TEXT\s+NOT NULL/i,
    /updated_at\s+TEXT\s+NOT NULL/i,
    /CREATE INDEX IF NOT EXISTS idx_verified_knowledge_owner_updated/i
  ];
  for (const pattern of required) {
    assert.match(knowledgeMigration, pattern, `migration is missing required schema contract: ${pattern}`);
    assert.match(learningSource, pattern, `runtime schema contract drifted from migration: ${pattern}`);
  }
  assert.doesNotMatch(knowledgeMigration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bUPDATE\s+/i);
});
