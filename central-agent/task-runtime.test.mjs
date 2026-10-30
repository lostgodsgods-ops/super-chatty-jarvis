import test from "node:test";
import assert from "node:assert/strict";
import {
  createTaskContract,
  transitionTask,
  runTask
} from "../central-agent/task-runtime.mjs";

const registry = [
  { id: "safe-reader", capabilities: ["read:public"], enabled: true, sideEffects: false },
  { id: "writer", capabilities: ["write:repo"], enabled: true, sideEffects: true }
];

function contract(overrides = {}) {
  return createTaskContract({
    taskId: "task-1",
    capability: "read:public",
    input: { query: "public documentation" },
    timeoutMs: 100,
    maxRetries: 0,
    ...overrides
  });
}

test("task contracts reject invalid bounds and malformed inputs", () => {
  assert.throws(() => contract({ timeoutMs: 0 }), /TASK_CONTRACT_INVALID/);
  assert.throws(() => contract({ maxRetries: 9 }), /TASK_CONTRACT_INVALID/);
  assert.throws(() => contract({ capability: "" }), /TASK_CONTRACT_INVALID/);
});

test("state machine permits only declared transitions and records UTC evidence", () => {
  const queued = contract();
  assert.equal(queued.status, "QUEUED");
  const validating = transitionTask(queued, "VALIDATING", { reason: "schema-check" });
  const ready = transitionTask(validating, "READY", { reason: "validated" });
  assert.equal(ready.history.length, 3);
  assert.match(ready.history[2].at, /^\d{4}-\d\d-\d\dT/);
  assert.throws(() => transitionTask(ready, "SUCCEEDED"), /TASK_TRANSITION_INVALID/);
});

test("dispatcher runs only an enabled registered capability and returns success evidence", async () => {
  const result = await runTask(contract(), registry, {
    "safe-reader": async ({ input }) => ({ answer: input.query })
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.result.answer, "public documentation");
  assert.ok(result.history.some(event => event.to === "VERIFYING"));
});

test("unknown, disabled, or mismatched tools fail closed as BLOCKED", async () => {
  const unknown = await runTask(contract(), [], {});
  assert.equal(unknown.status, "BLOCKED");
  assert.equal(unknown.errorCode, "TOOL_NOT_REGISTERED");

  const mismatch = await runTask(contract({ capability: "write:repo" }), registry, {
    "safe-reader": async () => ({ ok: true })
  });
  assert.equal(mismatch.status, "BLOCKED");
  assert.equal(mismatch.errorCode, "NO_AUTHORIZED_EXECUTOR");
});

test("side-effecting tools require explicit approval and exact capability scope", async () => {
  const noApproval = await runTask(contract({
    capability: "write:repo",
    requiresApproval: true
  }), registry, { writer: async () => ({ changed: true }) });
  assert.equal(noApproval.status, "BLOCKED");
  assert.equal(noApproval.errorCode, "OWNER_APPROVAL_REQUIRED");

  const approved = await runTask(contract({
    capability: "write:repo",
    requiresApproval: true,
    approval: { approved: true, capability: "write:repo", taskId: "task-1" }
  }), registry, { writer: async () => ({ proposed: true }) });
  assert.equal(approved.status, "SUCCEEDED");
});

test("executor errors retry only to the declared ceiling then fail", async () => {
  let calls = 0;
  const result = await runTask(contract({ maxRetries: 2 }), registry, {
    "safe-reader": async () => { calls += 1; throw new Error("UPSTREAM_UNAVAILABLE"); }
  });
  assert.equal(calls, 3);
  assert.equal(result.status, "FAILED");
  assert.equal(result.errorCode, "EXECUTOR_FAILED");
  assert.equal(result.history.filter(event => event.reason === "retry").length, 2);
});

test("timeouts stop execution and return TIMED_OUT without exposing raw errors", async () => {
  const result = await runTask(contract({ timeoutMs: 10 }), registry, {
    "safe-reader": async () => new Promise(resolve => setTimeout(() => resolve({ late: true }), 60))
  });
  assert.equal(result.status, "TIMED_OUT");
  assert.equal(result.errorCode, "TASK_TIMEOUT");
});

test("cancellation and emergency stop prevent dispatch", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = await runTask(contract(), registry, {
    "safe-reader": async () => { throw new Error("must not run"); }
  }, { signal: controller.signal });
  assert.equal(cancelled.status, "CANCELLED");

  const stopped = await runTask(contract(), registry, {
    "safe-reader": async () => ({ ok: true })
  }, { emergencyStop: true });
  assert.equal(stopped.status, "BLOCKED");
  assert.equal(stopped.errorCode, "EMERGENCY_STOP_ACTIVE");
});

test("task history never records input payloads or raw exception messages", async () => {
  const secretLike = "owner-secret-do-not-log";
  const result = await runTask(contract({ input: { query: secretLike } }), registry, {
    "safe-reader": async () => { throw new Error(secretLike); }
  });
  const serialized = JSON.stringify(result.history);
  assert.equal(serialized.includes(secretLike), false);
});
