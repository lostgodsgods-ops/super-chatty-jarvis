import test from "node:test";
import assert from "node:assert/strict";
import { createBrainTaskStore } from "./brain-task-store.mjs";

const plan = (overrides = {}) => ({
  taskId: "brain-task-001",
  status: "PLANNED",
  goal: "Build a bounded Brain plan",
  taskType: "coding",
  steps: [{
    id: "design",
    description: "Design the task state layer",
    dependsOn: [],
    capability: "brain:plan",
    acceptanceCriteria: ["A plan can be retrieved"]
  }],
  permissions: [{ capability: "brain:plan", approved: false }],
  modelRoute: { provider: "openai", model: "test-model" },
  verification: [],
  evidence: [],
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
  ...overrides
});

class MemoryD1 {
  constructor() {
    this.tasks = new Map();
    this.events = [];
  }
  prepare(sql) {
    const db = this;
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async run() { return db.execute(sql, values); },
      async first() { return db.first(sql, values); },
      async all() { return db.all(sql, values); }
    };
  }
  async batch(statements) {
    const snapshot = {
      tasks: new Map([...this.tasks].map(([key, value]) => [key, structuredClone(value)])),
      events: structuredClone(this.events)
    };
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    } catch (error) {
      this.tasks = snapshot.tasks;
      this.events = snapshot.events;
      throw error;
    }
  }
  async execute(sql, v) {
    if (sql.includes("INSERT INTO neural_brain_tasks")) {
      const [taskId, schemaVersion, status, goal, taskType, planJson, provider, model, errorCode, createdAt, updatedAt] = v;
      if (this.tasks.has(taskId)) throw Object.assign(new Error("UNIQUE constraint failed"), { code: "SQLITE_CONSTRAINT_PRIMARYKEY" });
      this.tasks.set(taskId, { task_id: taskId, schema_version: schemaVersion, status, goal, task_type: taskType, plan_json: planJson, provider_id: provider, model_id: model, error_code: errorCode, created_at: createdAt, updated_at: updatedAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO neural_brain_task_events") && sql.includes("WHERE EXISTS")) {
      const [eventId, taskId, fromStatus, toStatus, eventType, evidenceJson, errorCode, createdAt, lookupTaskId, expectedStatus, updatedAt] = v;
      const task = this.tasks.get(lookupTaskId);
      if (task?.status === expectedStatus && task.updated_at === updatedAt) {
        this.events.push({ event_id: eventId, task_id: taskId, from_status: fromStatus, to_status: toStatus, event_type: eventType, evidence_refs_json: evidenceJson, error_code: errorCode, created_at: createdAt });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (sql.includes("INSERT INTO neural_brain_task_events")) {
      const [eventId, taskId, fromStatus, toStatus, eventType, evidenceJson, errorCode, createdAt] = v;
      this.events.push({ event_id: eventId, task_id: taskId, from_status: fromStatus, to_status: toStatus, event_type: eventType, evidence_refs_json: evidenceJson, error_code: errorCode, created_at: createdAt });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("UPDATE neural_brain_tasks")) {
      const [status, errorCode, updatedAt, taskId, expectedStatus] = v;
      const task = this.tasks.get(taskId);
      if (!task || task.status !== expectedStatus) return { meta: { changes: 0 } };
      task.status = status;
      task.error_code = errorCode;
      task.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }
    if (sql.includes("INSERT INTO neural_brain_task_events SELECT")) {
      const [eventId, taskId, fromStatus, toStatus, eventType, evidenceJson, errorCode, createdAt, expectedStatus, updatedAt] = v;
      const task = this.tasks.get(taskId);
      if (task?.status === expectedStatus && task.updatedAt === updatedAt) {
        this.events.push({ eventId, taskId, fromStatus, toStatus, eventType, evidenceJson, errorCode, createdAt });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    throw new Error("UNEXPECTED_SQL");
  }
  async first(sql, v) {
    if (sql.includes("FROM neural_brain_tasks")) {
      const task = this.tasks.get(v[0]);
      return task ? structuredClone(task) : null;
    }
    throw new Error("UNEXPECTED_SQL");
  }
  async all(sql, v) {
    if (sql.includes("FROM neural_brain_task_events")) {
      return { results: structuredClone(this.events.filter(event => event.task_id === v[0])) };
    }
    throw new Error("UNEXPECTED_SQL");
  }
}

test("creates and reads back a normalized plan with append-only lifecycle event", async () => {
  const db = new MemoryD1();
  const store = createBrainTaskStore(db, { now: () => "2026-11-02T01:00:00.000Z", id: () => "event-1" });
  const created = await store.create(plan());
  assert.equal(created.taskId, "brain-task-001");
  assert.equal(created.status, "PLANNED");
  assert.equal(created.events.length, 1);
  assert.equal(created.events[0].toStatus, "PLANNED");
  const read = await store.get("brain-task-001");
  assert.equal(read.goal, "Build a bounded Brain plan");
  assert.equal(read.plan.steps[0].id, "design");
});

test("rejects duplicate task IDs with a stable conflict code", async () => {
  const db = new MemoryD1();
  const store = createBrainTaskStore(db, { id: () => "event-id" });
  await store.create(plan());
  await assert.rejects(store.create(plan()), { code: "BRAIN_TASK_ALREADY_EXISTS", status: 409 });
});

test("allows declared lifecycle transitions and rejects invalid transitions", async () => {
  const db = new MemoryD1();
  const store = createBrainTaskStore(db, { id: () => "event-1" });
  await store.create(plan());
  const queued = await store.transition("brain-task-001", "QUEUED", { expectedStatus: "PLANNED" });
  assert.equal(queued.status, "QUEUED");
  await assert.rejects(
    store.transition("brain-task-001", "SUCCEEDED", { expectedStatus: "QUEUED" }),
    { code: "BRAIN_TASK_TRANSITION_INVALID" }
  );
});

test("uses expected status as an optimistic concurrency guard", async () => {
  const db = new MemoryD1();
  const store = createBrainTaskStore(db, { id: () => "event-1" });
  await store.create(plan());
  await assert.rejects(
    store.transition("brain-task-001", "QUEUED", { expectedStatus: "RUNNING" }),
    { code: "BRAIN_TASK_CONFLICT", status: 409 }
  );
});

test("persists only the plan contract fields, not injected prompt or secret properties", async () => {
  const db = new MemoryD1();
  const store = createBrainTaskStore(db);
  const input = plan({ prompt: "private prompt must not persist", secret: "never-store-this" });
  await store.create(input);
  const serialized = JSON.stringify([...db.tasks.values()]);
  assert.equal(serialized.includes("private prompt must not persist"), false);
  assert.equal(serialized.includes("never-store-this"), false);
});

test("rejects unsafe evidence references and sanitizes lifecycle error codes", async () => {
  const db = new MemoryD1();
  const store = createBrainTaskStore(db, { id: () => "event-1" });
  await store.create(plan());
  await assert.rejects(
    store.transition("brain-task-001", "BLOCKED", {
      expectedStatus: "PLANNED",
      evidenceRefs: ["https://example.com/private?token=secret"]
    }),
    { code: "BRAIN_TASK_EVIDENCE_INVALID" }
  );
  const blocked = await store.transition("brain-task-001", "BLOCKED", {
    expectedStatus: "PLANNED",
    errorCode: "OWNER_POLICY_BLOCKED",
    evidenceRefs: ["workflow:41399835227"]
  });
  assert.equal(blocked.errorCode, "OWNER_POLICY_BLOCKED");
  assert.equal(blocked.events.at(-1).evidenceRefs[0], "workflow:41399835227");
});

test("fails closed when the D1 binding is missing", async () => {
  const store = createBrainTaskStore(null);
  await assert.rejects(store.create(plan()), { code: "BRAIN_TASK_STORAGE_UNAVAILABLE", status: 503 });
});
