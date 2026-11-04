import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const capability = await readFile(new URL("../migrations/0005_capability_requests.sql", import.meta.url), "utf8");
const learning = await readFile(new URL("../migrations/0006_learning_knowledge.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../central-agent/worker.mjs", import.meta.url), "utf8");
const deploy = await readFile(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8");

test("capability request migration keeps all requests owner-reviewed and execution-disabled", () => {
  assert.match(capability, /CREATE TABLE IF NOT EXISTS capability_requests/);
  assert.match(capability, /execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK\(execution_enabled = 0\)/);
  assert.match(capability, /requires_owner_approval INTEGER NOT NULL DEFAULT 1 CHECK\(requires_owner_approval = 1\)/);
  assert.match(capability, /pending_owner_review/);
  assert.doesNotMatch(capability, /DROP TABLE|DELETE FROM|UPDATE capability_requests/i);
});

test("learning migrations keep pending and verified knowledge owner-scoped", () => {
  assert.match(learning, /CREATE TABLE IF NOT EXISTS pending_knowledge/);
  assert.match(learning, /status TEXT NOT NULL CHECK \(status = 'pending_owner_verification'\)/);
  assert.match(learning, /CREATE TABLE IF NOT EXISTS verified_knowledge/);
  assert.match(learning, /status TEXT NOT NULL CHECK \(status = 'verified'\)/);
  assert.match(learning, /owner_scope TEXT NOT NULL CHECK \(owner_scope = 'owner'\)/);
  assert.doesNotMatch(learning, /DROP TABLE|DELETE FROM|UPDATE pending_knowledge|UPDATE verified_knowledge/i);
});

test("capability request replays are audited and return HTTP 200, not a second creation", () => {
  const start = worker.indexOf('if (url.pathname === "/api/capability-requests" && request.method === "POST")');
  const end = worker.indexOf('if (url.pathname === "/api/capability-requests" && request.method === "GET")', start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /idempotencyKey/);
  assert.match(route, /capability\.request\.replayed/);
  assert.match(route, /requestRecord\.idempotentReplay \? 200 : 201/);
});

test("production D1 migrations remain explicit-approval gated and precede Worker deploy", () => {
  assert.match(deploy, /authorize_production_changes == 'approve'/);
  const apply = deploy.indexOf("d1 migrations apply super-chatty-owner-auth --remote --config central-agent/wrangler.jsonc");
  const deployWorker = deploy.indexOf("command: deploy --config central-agent/wrangler.jsonc");
  assert.ok(apply >= 0 && deployWorker > apply);
});
