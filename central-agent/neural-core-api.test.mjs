import test from "node:test";
import assert from "node:assert/strict";
import { handleNeuralCoreRequest } from "./neural-core-api.mjs";
import { createNeuralCore } from "./neural-core.mjs";

function memoryTaskStore() {
  const records = new Map();
  return {
    records,
    async isReady() { return true; },
    async get(taskId) { return records.get(taskId) || null; },
    async transition(taskId, status, metadata = {}) {
      const current = records.get(taskId);
      if (!current || current.status !== "PLANNED" || status !== "BLOCKED") throw new Error("INVALID_TRANSITION");
      const next = { ...current, status, errorCode: metadata.errorCode };
      records.set(taskId, next);
      return next;
    },
    async create(plan) {
      if (records.has(plan.taskId)) throw Object.assign(new Error("duplicate"), { code: "BRAIN_TASK_ALREADY_EXISTS", status: 409 });
      const record = { ...plan, persisted: true };
      records.set(plan.taskId, record);
      return record;
    }
  };
}

const normalOwnerGate = async () => ({ ok: true, mode: "normal", reason: "NORMAL_MODE", allowOwnerActions: true, allowBackgroundTasks: true });

function makeCore(overrides = {}) {
  return createNeuralCore({
    complete: async input => ({ ok: true, provider: input.provider, model: "mock-v1", text: "Reasoned result" }),
    ...overrides
  });
}
const get = () => new Request("https://example.test/api/neural-core");
const post = body => new Request("https://example.test/api/neural-core", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

test("GET returns neural core capability status without credentials", async () => {
  const response = await handleNeuralCoreRequest(get(), { OPENAI_API_KEY: "do-not-leak" }, { core: makeCore() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.core.name, "REDULTRON NEURAL CORE");
  assert.equal(body.core.version, "1.1.0");
  assert.equal(JSON.stringify(body).includes("do-not-leak"), false);
});

test("POST invokes the core and records request plus completion audit without logging prompt", async () => {
  const events = [];
  const response = await handleNeuralCoreRequest(post({ prompt: "Explain the architecture", provider: "openai" }), {}, {
    core: makeCore(),
    publishEvent: async event => { events.push(event); return { ok: true, id: "audit-" + events.length }; }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.text, "Reasoned result");
  assert.equal(body.result.execution.toolsExecuted, false);
  assert.deepEqual(events.map(event => event.type), ["neural_core.reasoning.requested", "neural_core.reasoning.completed"]);
  assert.equal(JSON.stringify(events).includes("Explain the architecture"), false);
  assert.equal(JSON.stringify(events).includes("workflow:"), false);
});

test("POST attaches a default review-required independent evaluation", async () => {
  const response = await handleNeuralCoreRequest(post({ prompt: "hello" }), {}, {
    core: makeCore(), publishEvent: async () => ({ ok: true })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.result.evaluation.verdict, "REVIEW_REQUIRED");
  assert.equal(body.result.evaluation.independent, true);
  assert.equal(body.result.evaluation.verificationScope, "reference-consistency-only");
  assert.equal(body.result.evaluation.externalEvidenceVerified, false);
});

test("POST evaluates supplied bounded evidence without treating model self-assessment as proof", async () => {
  const response = await handleNeuralCoreRequest(post({
    prompt: "hello",
    selfAssessment: "PASS",
    evaluation: {
      checks: [{ id: "unit-tests", status: "passed", evidenceRef: "workflow:123" }],
      evidence: ["workflow:123"]
    }
  }), {}, { core: makeCore(), publishEvent: async () => ({ ok: true }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.result.evaluation.verdict, "PASS");
  assert.equal(body.result.evaluation.checksPassed, 1);
  assert.equal(body.result.selfAssessment, undefined);
});

test("POST evaluation fails closed for failed or over-limit checks", async () => {
  const failed = await handleNeuralCoreRequest(post({
    prompt: "hello",
    evaluation: {
      checks: [{ id: "security", status: "failed", evidenceRef: "workflow:124" }],
      evidence: ["workflow:124"]
    }
  }), {}, { core: makeCore(), publishEvent: async () => ({ ok: true }) });
  assert.equal((await failed.json()).result.evaluation.verdict, "FAIL");

  const checks = Array.from({ length: 21 }, (_, index) => ({
    id: "check-" + index, status: "passed", evidenceRef: "workflow:" + index
  }));
  const limited = await handleNeuralCoreRequest(post({
    prompt: "hello", evaluation: { checks, evidence: checks.map(item => item.evidenceRef) }
  }), {}, { core: makeCore(), publishEvent: async () => ({ ok: true }) });
  const result = (await limited.json()).result.evaluation;
  assert.equal(result.verdict, "REVIEW_REQUIRED");
  assert.ok(result.reasons.includes("EVIDENCE_LIMIT_EXCEEDED"));
});

test("POST fails closed if audit storage is unavailable before model dispatch", async () => {
  let invoked = false;
  const core = { inspect: () => ({}), reason: async () => { invoked = true; return {}; } };
  const response = await handleNeuralCoreRequest(post({ prompt: "hello" }), {}, {
    core, taskStore: memoryTaskStore(), publishEvent: async () => ({ ok: false })
  });
  assert.equal(response.status, 503);
  assert.equal(invoked, false);
});

test("POST returns a sanitized failure and records failure event", async () => {
  const events = [];
  const core = { inspect: () => ({}), reason: async () => { const error = new Error("private detail"); error.code = "PROVIDER_UNAVAILABLE"; throw error; } };
  const response = await handleNeuralCoreRequest(post({ prompt: "hello" }), {}, {
    core, taskStore: memoryTaskStore(), readGate: normalOwnerGate, publishEvent: async event => { events.push(event); return { ok: true }; }
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "PROVIDER_UNAVAILABLE");
  assert.equal(JSON.stringify(events).includes("private detail"), false);
  assert.equal(events.at(-1).type, "neural_core.reasoning.failed");
});

test("POST validates method, content type, JSON, and streaming size", async () => {
  assert.equal((await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", { method: "DELETE" }))).status, 405);
  assert.equal((await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status, 400);
  const oversized = await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "x".repeat(17000) })
  }));
  assert.equal(oversized.status, 413);
});


function makePlanCore(overrides = {}) {
  return createNeuralCore({
    allowedCapabilities: ["brain:analyze", "brain:plan"],
    complete: async input => ({
      ok: true, provider: "mock", model: "mock-plan-v1",
      text: JSON.stringify({
        goal: "Analyze a bounded request",
        taskType: "planning",
        steps: [{ id: "analyze", description: "Analyze request constraints", dependsOn: [], capability: "brain:analyze", acceptanceCriteria: ["Constraints are identified"] }],
        permissions: ["brain:analyze"]
      })
    }),
    ...overrides
  });
}

test("POST plan operation returns a validated plan and records sanitized audit events", async () => {
  const events = [];
  const taskStore = memoryTaskStore();
  const response = await handleNeuralCoreRequest(post({
    operation: "plan", goal: "Analyze a bounded request", provider: "openai"
  }), {}, {
    core: makePlanCore(), taskStore, readGate: normalOwnerGate,
    publishEvent: async event => { events.push(event); return { ok: true, id: "plan-audit-" + events.length }; }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.plan.status, "PLANNED");
  assert.equal(body.result.task.persisted, true);
  assert.equal(taskStore.records.size, 1);
  assert.equal(body.result.plan.permissions[0].approved, false);
  assert.equal(body.result.execution.toolsExecuted, false);
  assert.equal(body.result.coordination.status, "PLANNED");
  assert.deepEqual(events.map(event => event.type), [
    "neural_core.reasoning.requested",
    "brain.coordination.requested",
    "brain.coordination.completed",
    "neural_core.reasoning.completed"
  ]);
  assert.equal(JSON.stringify(events).includes("Analyze a bounded request"), false);
  assert.equal(events[3].payload.planStepCount, 1);
});

test("POST plan operation fails closed before model dispatch when audit start is unavailable", async () => {
  let invoked = false;
  const core = makePlanCore({ complete: async () => {
    invoked = true;
    return { ok: true, provider: "mock", model: "m", text: JSON.stringify({
      goal: "Plan", taskType: "planning",
      steps: [{ id: "analyze", description: "Analyze request", dependsOn: [], capability: "brain:analyze", acceptanceCriteria: ["Request analyzed"] }],
      permissions: ["brain:analyze"]
    }) };
  } });
  const response = await handleNeuralCoreRequest(post({ operation: "plan", goal: "Plan" }), {}, {
    core, publishEvent: async () => ({ ok: false })
  });
  assert.equal(response.status, 503);
  assert.equal(invoked, false);
});

test("POST plan operation returns sanitized provider failures and records failure audit", async () => {
  const events = [];
  const core = makePlanCore({ complete: async () => { const error = new Error("private prompt or secret"); error.code = "PROVIDER_UNAVAILABLE"; throw error; } });
  const response = await handleNeuralCoreRequest(post({ operation: "plan", goal: "Plan" }), {}, {
    core, taskStore: memoryTaskStore(), readGate: normalOwnerGate, publishEvent: async event => { events.push(event); return { ok: true }; }
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, "PROVIDER_UNAVAILABLE");
  assert.equal(JSON.stringify(events).includes("private prompt or secret"), false);
  assert.equal(events.at(-1).type, "neural_core.reasoning.failed");
});

test("POST rejects unknown neural core operation", async () => {
  const response = await handleNeuralCoreRequest(post({ operation: "execute", prompt: "Do something" }), {}, {
    core: makeCore(), publishEvent: async () => ({ ok: true })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "NEURAL_CORE_OPERATION_INVALID");
});


test("POST plan operation requires durable task storage before model dispatch", async () => {
  let invoked = false;
  const core = makePlanCore({ complete: async () => { invoked = true; return { ok: true, provider: "mock", model: "m", text: "{}" }; } });
  const response = await handleNeuralCoreRequest(post({ operation: "plan", goal: "Plan" }), {}, {
    core, publishEvent: async () => ({ ok: true })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "BRAIN_TASK_STORAGE_UNAVAILABLE");
  assert.equal(invoked, false);
});


test("POST plan operation blocks before model dispatch when D1 Brain migrations are absent", async () => {
  let invoked = false;
  const taskStore = { isReady: async () => false, create: async () => { throw new Error("must not persist"); } };
  const core = makePlanCore({ complete: async () => { invoked = true; return { ok: true, provider: "mock", model: "m", text: "{}" }; } });
  const response = await handleNeuralCoreRequest(post({ operation: "plan", goal: "Plan" }), {}, {
    core, taskStore, publishEvent: async () => ({ ok: true })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "BRAIN_TASK_SCHEMA_UNAVAILABLE");
  assert.equal(invoked, false);
});


test("POST plan operation blocks before provider dispatch when emergency stop is active", async () => {
  let invoked = false;
  const events = [];
  const core = makePlanCore({ complete: async () => {
    invoked = true;
    return { ok: true, provider: "mock", model: "m", text: JSON.stringify({
      goal: "Plan", taskType: "planning",
      steps: [{ id: "analyze", description: "Analyze request", dependsOn: [], capability: "brain:analyze", acceptanceCriteria: ["Request analyzed"] }],
      permissions: ["brain:analyze"]
    }) };
  } });
  const response = await handleNeuralCoreRequest(post({ operation: "plan", goal: "Plan" }), {}, {
    core,
    taskStore: memoryTaskStore(),
    readGate: async () => ({ ok: true, mode: "emergency-stop", reason: "EMERGENCY_STOP_ACTIVE", allowOwnerActions: false, allowBackgroundTasks: false }),
    publishEvent: async event => { events.push(event); return { ok: true }; }
  });
  assert.equal(response.status, 423);
  assert.equal((await response.json()).error, "EMERGENCY_STOP_ACTIVE");
  assert.equal(invoked, false);
  assert.equal(events.at(-1).type, "neural_core.reasoning.failed");
});
