import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0003_capability_requests.sql", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../central-agent/architecture/capability-request-queue.mjs", import.meta.url), "utf8");

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
