import test from "node:test";
import assert from "node:assert/strict";
import { coordinateBrainPlan } from "./brain-coordinator.mjs";

const plan = (overrides = {}) => ({
  taskId: "brain-task-002",
  status: "PLANNED",
  goal: "Create a bounded implementation plan",
  taskType: "coding",
  steps: [{ id: "inspect", description: "Inspect files", dependsOn: [], capability: "repo:read", acceptanceCriteria: ["Files reviewed"] }],
  permissions: [{ capability: "repo:read", approved: false }],
  ...overrides
});

function dependencies(overrides = {}) {
  const transitions = [];
  const events = [];
  const executors = [];
  return {
    transitions, events, executors,
    allowedCapabilities: ["repo:read", "brain:plan"],
    readGate: async () => ({
      ok: true, mode: "normal", reason: "NORMAL_MODE",
      allowOwnerActions: true, allowBackgroundTasks: true
    }),
    taskStore: {
      async transition(taskId, status, metadata) {
        transitions.push({ taskId, status, metadata });
        return { taskId, status, errorCode: metadata?.errorCode || null };
      }
    },
    publishEvent: async event => { events.push(event); return { ok: true, id: events.length }; },
    executors: { run: async () => { executors.push("run"); } },
    ...overrides
  };
}

test("keeps an authorized plan PLANNED and never dispatches an executor", async () => {
  const deps = dependencies();
  const result = await coordinateBrainPlan(plan(), deps);
  assert.equal(result.status, "PLANNED");
  assert.equal(result.taskId, "brain-task-002");
  assert.deepEqual(deps.transitions, []);
  assert.deepEqual(deps.executors, []);
  assert.equal(deps.events.at(-1).type, "brain.coordination.completed");
});

test("blocks a plan when emergency stop is active", async () => {
  const deps = dependencies({
    readGate: async () => ({
      ok: true, mode: "emergency-stop", reason: "EMERGENCY_STOP_ACTIVE",
      allowOwnerActions: false, allowBackgroundTasks: false
    })
  });
  const result = await coordinateBrainPlan(plan(), deps);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.errorCode, "EMERGENCY_STOP_ACTIVE");
  assert.equal(deps.transitions[0].status, "BLOCKED");
  assert.deepEqual(deps.executors, []);
});

test("blocks background coordination during owner takeover", async () => {
  const deps = dependencies({
    readGate: async () => ({
      ok: true, mode: "owner-takeover", reason: "OWNER_TAKEOVER_ACTIVE",
      allowOwnerActions: true, allowBackgroundTasks: false
    })
  });
  const result = await coordinateBrainPlan(plan(), { ...deps, backgroundTask: true });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.errorCode, "OWNER_TAKEOVER_ACTIVE");
});

test("fails closed when owner-control storage is unavailable", async () => {
  const deps = dependencies({
    readGate: async () => ({
      ok: false, mode: "unavailable", reason: "OWNER_CONTROL_STORE_UNAVAILABLE",
      allowOwnerActions: false, allowBackgroundTasks: false
    })
  });
  const result = await coordinateBrainPlan(plan(), deps);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.errorCode, "OWNER_CONTROL_STORE_UNAVAILABLE");
});

test("rejects capabilities outside the trusted server allowlist", async () => {
  const deps = dependencies();
  const result = await coordinateBrainPlan(plan({
    steps: [{ id: "deploy", description: "Deploy", dependsOn: [], capability: "infra:deploy", acceptanceCriteria: ["Deployment completed"] }]
  }), deps);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.errorCode, "BRAIN_CAPABILITY_NOT_ALLOWED");
  assert.deepEqual(deps.executors, []);
});

test("blocks when audit persistence is unavailable", async () => {
  const deps = dependencies({ publishEvent: async () => ({ ok: false }) });
  const result = await coordinateBrainPlan(plan(), deps);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.errorCode, "BRAIN_AUDIT_UNAVAILABLE");
  assert.deepEqual(deps.executors, []);
});

test("requires the exact persisted task identity and task store", async () => {
  const deps = dependencies({ taskStore: null });
  const result = await coordinateBrainPlan(plan(), deps);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.errorCode, "BRAIN_TASK_STORAGE_UNAVAILABLE");
});
