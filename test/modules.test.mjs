import test from "node:test";
import assert from "node:assert/strict";
import { handleModuleRoute, isModuleRoute } from "../staging/modules.mjs";

const owner = { ownerId: 1 };
const req = (path, method = "GET", body, headers = {}) => new Request("https://staging.example" + path, {
  method,
  headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("module route matcher is explicit and method-bounded", () => {
  assert.equal(isModuleRoute("GET", "/tasks"), true);
  assert.equal(isModuleRoute("POST", "/tasks"), true);
  assert.equal(isModuleRoute("PUT", "/tasks"), false);
  assert.equal(isModuleRoute("POST", "/tasks/abc/approve"), false);
  assert.equal(isModuleRoute("GET", "/audit"), true);
});

test("task endpoints reject missing Owner sessions before database access", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const response = await handleModuleRoute(req("/tasks"), env, "/tasks", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("task creation queues only allowlisted task types and starts pending approval", async () => {
  const batched = [];
  const env = { DB: {
    prepare(sql) { return { sql, bind(...args) { return { sql, args }; } }; },
    async batch(statements) { batched.push(...statements); return []; },
  } };
  const response = await handleModuleRoute(req("/tasks", "POST", {
    taskType: "read_only_research", payload: { question: "Summarize public documentation" },
  }), env, "/tasks", owner);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.task.status, "pending_approval");
  assert.equal(body.task.taskType, "read_only_research");
  assert.equal(batched.length, 2);
  assert.match(batched[0].sql, /INSERT INTO owner_tasks/);
  assert.match(batched[1].sql, /INSERT INTO owner_audit_log/);
});

test("task creation rejects unsupported task types without database writes", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const response = await handleModuleRoute(req("/tasks", "POST", {
    taskType: "shell_command", payload: { command: "anything" },
  }), env, "/tasks", owner);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Unsupported task type" });
  assert.equal(touched, false);
});

test("task approval requires an explicit approved=true value", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const response = await handleModuleRoute(req("/tasks/123e4567-e89b-12d3-a456-426614174000/approve", "POST", {}), env, "/tasks/123e4567-e89b-12d3-a456-426614174000/approve", owner);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Explicit approval is required" });
  assert.equal(touched, false);
});

test("agent result submission fails closed until a private gateway token exists", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/results", "POST", {
    taskId: "123e4567-e89b-12d3-a456-426614174000", result: { summary: "test" },
  }), { DB: { prepare() { touched = true; } } }, "/results", null);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Agent result submission is disabled until gateway authentication is configured" });
  assert.equal(touched, false);
});

test("agent result submission rejects an incorrect gateway token", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/results", "POST", {
    taskId: "123e4567-e89b-12d3-a456-426614174000", result: { summary: "test" },
  }, { "x-agent-gateway-token": "wrong" }), {
    AGENT_GATEWAY_TOKEN: "correct-token",
    DB: { prepare() { touched = true; } },
  }, "/results", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("memory writes require an Owner session and reject oversized content", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const unauthorized = await handleModuleRoute(req("/memory", "POST", { content: "test" }), env, "/memory", null);
  assert.equal(unauthorized.status, 401);
  const tooLong = await handleModuleRoute(req("/memory", "POST", { content: "x".repeat(4001) }), env, "/memory", owner);
  assert.equal(tooLong.status, 400);
  assert.equal(touched, false);
});

test("task, memory, and audit reads bind the fixed Owner ID", async () => {
  const queries = [];
  const env = { DB: {
    prepare(sql) {
      return { sql, bind(...args) { queries.push({ sql, args }); return {
        async all() { return { results: [] }; },
        async first() { return { id: "123e4567-e89b-12d3-a456-426614174000" }; },
      }; } };
    },
  } };
  await handleModuleRoute(req("/tasks"), env, "/tasks", owner);
  await handleModuleRoute(req("/memory?q=project"), env, "/memory", owner);
  await handleModuleRoute(req("/audit?limit=20"), env, "/audit", owner);
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.match(query.sql, /owner_id = \?/);
    assert.ok(query.args.includes(1), "every query must bind the fixed Owner ID");
  }
});
