import { createNeuralCore, NeuralCoreError } from "./neural-core.mjs";
import { BrainPlanError } from "./brain-plan.mjs";
import { createBrainTaskStore, BrainTaskStoreError } from "./brain-task-store.mjs";
import { evaluateNeuralResult } from "./neural-core-evaluator.mjs";
import { readOwnerExecutionGate } from "./architecture/owner-execution-gate.mjs";
import { coordinateBrainPlan } from "./brain-coordinator.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_CORE = createNeuralCore({ allowedCapabilities: ["brain:analyze", "brain:plan"] });

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function readBoundedJson(request) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    return { tooLarge: true, body: null };
  }
  if (!request.body) return { tooLarge: false, body: null };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try { await reader.cancel("NEURAL_CORE_BODY_TOO_LARGE"); } catch {}
        return { tooLarge: true, body: null };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      return { tooLarge: false, body: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null };
    } catch { return { tooLarge: false, body: null }; }
  } catch {
    try { await reader.cancel("NEURAL_CORE_BODY_READ_FAILED"); } catch {}
    return { tooLarge: false, body: null };
  }
}

/** Owner-session authentication is enforced by worker.mjs before this handler. */
export async function handleNeuralCoreRequest(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/neural-core") return json({ ok: false, error: "NOT_FOUND" }, 404);
  const core = options.core || DEFAULT_CORE;

  if (request.method === "GET") {
    return json({ ok: true, core: core.inspect(env) });
  }
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "CONTENT_TYPE_JSON_REQUIRED" }, 415);
  }
  const parsed = await readBoundedJson(request);
  if (parsed.tooLarge) return json({ ok: false, error: "REQUEST_TOO_LARGE" }, 413);
  if (!parsed.body) return json({ ok: false, error: "INVALID_JSON" }, 400);

  if (typeof options.publishEvent !== "function") return json({ ok: false, error: "AUDIT_STORAGE_UNAVAILABLE" }, 503);
  const operation = parsed.body.operation === undefined ? "reason" : parsed.body.operation;
  if (operation !== "reason" && operation !== "plan") {
    return json({ ok: false, error: "NEURAL_CORE_OPERATION_INVALID" }, 400);
  }
  if (operation === "reason" && (typeof parsed.body.prompt !== "string" || !parsed.body.prompt.trim())) {
    return json({ ok: false, error: "NEURAL_CORE_INVALID_PROMPT" }, 400);
  }
  if (operation === "plan" && (typeof parsed.body.goal !== "string" || !parsed.body.goal.trim())) {
    return json({ ok: false, error: "NEURAL_CORE_INVALID_GOAL" }, 400);
  }

  const taskStore = operation === "plan" ? (options.taskStore || createBrainTaskStore(env.DB)) : null;
  if (operation === "plan" && (!taskStore || typeof taskStore.create !== "function" ||
      (!options.taskStore && (!env.DB || typeof env.DB.prepare !== "function" || typeof env.DB.batch !== "function")))) {
    return json({ ok: false, error: "BRAIN_TASK_STORAGE_UNAVAILABLE" }, 503);
  }
  if (operation === "plan" && typeof taskStore.isReady === "function") {
    let schemaReady = false;
    try { schemaReady = await taskStore.isReady() === true; } catch { schemaReady = false; }
    if (!schemaReady) return json({ ok: false, error: "BRAIN_TASK_SCHEMA_UNAVAILABLE" }, 503);
  }

  const provider = typeof parsed.body.provider === "string" ? parsed.body.provider : "openai";
  let auditStart;
  try {
    auditStart = await options.publishEvent({
      type: "neural_core.reasoning.requested",
      source: "redultron-neural-core",
      payload: {
        operation,
        provider: /^[a-z0-9-]{1,64}$/.test(provider) ? provider : "invalid",
        memoryRequested: typeof parsed.body.memoryQuery === "string" && Boolean(parsed.body.memoryQuery.trim()),
        promptLogged: false
      }
    });
  } catch { auditStart = null; }
  if (auditStart?.ok !== true) return json({ ok: false, error: "AUDIT_STORAGE_UNAVAILABLE" }, 503);

  if (operation === "plan") {
    let gate;
    try {
      const readGate = typeof options.readGate === "function" ? options.readGate : readOwnerExecutionGate;
      gate = await readGate(env);
    } catch {
      gate = null;
    }
    const gateError = !gate || gate.ok !== true || gate.mode === "unavailable"
      ? "OWNER_CONTROL_STORE_UNAVAILABLE"
      : (gate.mode === "emergency-stop" || gate.allowOwnerActions !== true
        ? (gate.reason === "EMERGENCY_STOP_ACTIVE" ? "EMERGENCY_STOP_ACTIVE" : "OWNER_ACTIONS_BLOCKED")
        : null);
    if (gateError) {
      try {
        await options.publishEvent({
          type: "neural_core.reasoning.failed",
          source: "redultron-neural-core",
          payload: { operation, provider: /^[a-z0-9-]{1,64}$/.test(provider) ? provider : "invalid", code: gateError, promptLogged: false }
        });
      } catch {}
      return json({ ok: false, error: gateError, code: gateError }, gateError === "EMERGENCY_STOP_ACTIVE" || gateError === "OWNER_ACTIONS_BLOCKED" ? 423 : 503);
    }
  }

  try {
    const result = operation === "plan"
      ? await core.plan(parsed.body, env)
      : await core.reason(parsed.body, env);
    let task = operation === "plan" ? await taskStore.create(result.plan) : null;
    let coordination = null;
    if (operation === "plan") {
      const coordinate = typeof options.coordinatePlan === "function" ? options.coordinatePlan : coordinateBrainPlan;
      coordination = await coordinate(result.plan, {
        env,
        taskStore,
        publishEvent: options.publishEvent,
        readGate: options.readGate,
        allowedCapabilities: Array.isArray(options.allowedCapabilities)
          ? options.allowedCapabilities
          : ["brain:analyze", "brain:plan"],
        backgroundTask: false
      });
      if (typeof taskStore.get === "function") {
        try { task = await taskStore.get(result.plan.taskId) || task; } catch {}
      }
    }
    const evaluation = evaluateNeuralResult(parsed.body.evaluation || {});
    let auditDone;
    try {
      auditDone = await options.publishEvent({
        type: "neural_core.reasoning.completed",
        source: "redultron-neural-core",
        payload: {
          operation,
          provider: result.provider.id,
          model: result.provider.model,
          memoryStatus: result.memory.status,
          recordsUsed: result.memory.recordsUsed,
          planTaskId: operation === "plan" ? result.plan.taskId : null,
          planStatus: operation === "plan" ? result.plan.status : null,
          planStepCount: operation === "plan" ? result.plan.steps.length : null,
          evaluationVerdict: evaluation.verdict,
          evaluationChecksPassed: evaluation.checksPassed,
          evaluationChecksFailed: evaluation.checksFailed,
          evaluationChecksPending: evaluation.checksPending,
          promptLogged: false,
          evidenceReferencesLogged: false
        }
      });
    } catch { auditDone = null; }
    if (auditDone?.ok !== true) return json({ ok: false, error: "AUDIT_STORAGE_UNAVAILABLE" }, 503);
    return json({ ok: true, result: { ...result, ...(task ? { task } : {}), ...(coordination ? { coordination } : {}), evaluation } });
  } catch (error) {
    const known = error instanceof NeuralCoreError || error instanceof BrainPlanError || error instanceof BrainTaskStoreError;
    const code = known ? error.code : (typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : "NEURAL_CORE_EXECUTION_FAILED");
    const status = known ? error.status : 502;
    try {
      await options.publishEvent({
        type: "neural_core.reasoning.failed",
        source: "redultron-neural-core",
        payload: { operation, provider: /^[a-z0-9-]{1,64}$/.test(provider) ? provider : "invalid", code, status, promptLogged: false }
      });
    } catch {}
    return json({ ok: false, error: code, code }, status);
  }
}
