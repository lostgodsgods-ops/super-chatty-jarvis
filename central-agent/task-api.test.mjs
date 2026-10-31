import test from "node:test";
import assert from "node:assert/strict";
import { handleTaskApiRequest } from "../central-agent/task-api.mjs";

test("GET task registry exposes only the bounded read-only capability", async () => {
  const response = await handleTaskApiRequest(
    new Request("https://example.test/api/tasks"),
    {},
    { publishEvent: async () => ({ ok: true }) }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.capabilities.length, 1);
  assert.equal(body.capabilities[0].id, "system.health.read");
  assert.equal(body.capabilities[0].sideEffects, false);
});

test("POST dispatches a registered health task and records audit evidence", async () => {
  const events = [];
  const request = new Request("https://example.test/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: "health-1",
      capability: "system.health.read",
      input: { includeBindings: true },
      timeoutMs: 1000,
      maxRetries: 0
    })
  });
  const response = await handleTaskApiRequest(request, { DB: {}, SESSIONS: {} }, {
    publishEvent: async event => { events.push(event); return { ok: true, id: "audit-1" }; },
    now: () => new Date("2026-10-31T00:00:00.000Z")
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.task.status, "SUCCEEDED");
  assert.equal(body.task.result.databaseConfigured, true);
  assert.equal(body.audit.recorded, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "task.execution.completed");
});

test("unknown capabilities are blocked and audited", async () => {
  const events = [];
  const response = await handleTaskApiRequest(new Request("https://example.test/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: "unknown-1", capability: "shell.execute", input: {},
      timeoutMs: 1000, maxRetries: 0
    })
  }), {}, { publishEvent: async event => { events.push(event); return { ok: true }; } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.task.status, "BLOCKED");
  assert.equal(body.task.errorCode, "TOOL_NOT_REGISTERED");
  assert.equal(events[0].type, "task.execution.blocked");
});

test("invalid JSON, wrong method, and oversized payloads fail closed", async () => {
  const wrongMethod = await handleTaskApiRequest(new Request("https://example.test/api/tasks", { method: "DELETE" }), {});
  assert.equal(wrongMethod.status, 405);

  const invalid = await handleTaskApiRequest(new Request("https://example.test/api/tasks", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{"
  }), {});
  assert.equal(invalid.status, 400);

  const oversized = await handleTaskApiRequest(new Request("https://example.test/api/tasks", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "x".repeat(9000) })
  }), {});
  assert.equal(oversized.status, 413);
});

test("audit storage failure prevents a success response", async () => {
  const response = await handleTaskApiRequest(new Request("https://example.test/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: "health-audit-fail", capability: "system.health.read",
      input: {}, timeoutMs: 1000, maxRetries: 0
    })
  }), {}, { publishEvent: async () => ({ ok: false }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "TASK_AUDIT_UNAVAILABLE");
});
