import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../migrations/0003_capability_requests.sql", import.meta.url);
const queueUrl = new URL("./capability-request-queue.mjs", import.meta.url);
let migration = "";
try { migration = await readFile(migrationUrl, "utf8"); } catch {}
const queue = await readFile(queueUrl, "utf8");

test("capability request D1 migration is additive, idempotent, and preserves owner gates", () => {
  assert.ok(migration.trim(), "versioned D1 migration is missing");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS capability_requests/i);
  for (const column of [
    "id TEXT PRIMARY KEY",
    "goal TEXT NOT NULL",
    "rationale TEXT NOT NULL",
    "requested_tools_json TEXT NOT NULL",
    "created_at TEXT NOT NULL"
  ]) assert.ok(migration.includes(column), "migration must include " + column);
  assert.match(migration, /CHECK\s*\(\s*status\s+IN\s*\(\s*'pending_owner_review'\s*,\s*'approved'\s*,\s*'rejected'\s*,\s*'implemented'\s*\)\s*\)/i);
  assert.match(migration, /execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK\s*\(execution_enabled\s*=\s*0\)/i);
  assert.match(migration, /requires_owner_approval INTEGER NOT NULL DEFAULT 1 CHECK\s*\(requires_owner_approval\s*=\s*1\)/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_capability_requests_created_at/i);
  assert.doesNotMatch(migration, /\b(DROP|DELETE|UPDATE|ALTER)\b/i);
  assert.match(queue, /CREATE TABLE IF NOT EXISTS capability_requests/);
  assert.match(queue, /execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK\s*\(execution_enabled = 0\)/);
  assert.match(queue, /requires_owner_approval INTEGER NOT NULL DEFAULT 1 CHECK\s*\(requires_owner_approval = 1\)/);
});
