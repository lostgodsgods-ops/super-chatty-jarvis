import { createTaskContract, runTask } from "./task-runtime.mjs";

const TASK_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "system-health-read",
    description: "Read non-sensitive Worker configuration presence and runtime metadata",
    enabled: true,
    sideEffects: false
  })
]);
const TASK_REGISTRY = Object.freeze([
  Object.freeze({
    id: "worker-health-reader",
    capabilities: Object.freeze(["system-health-read"]),
    enabled: true,
    sideEffects: false
  })
]);
const MAX_BODY_BYTES = 8192;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

async function readJsonBounded(request) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
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
        try { await reader.cancel("REQUEST_TOO_LARGE"); } catch {}
        return { tooLarge: true, body: null };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      return { tooLarge: false, body: body && typeof body === "object" && !Array.isArray(body) ? body : null };
    } catch {
      return { tooLarge: false, body: null };
    }
  } catch {
    try { await reader.cancel("REQUEST_BODY_READ_FAILED"); } catch {}
    return { tooLarge: false, body: null };
  }
}

/**
 * Handles /api/tasks. The Worker must apply its shared owner-session gate
 * before calling this function. This API intentionally exposes one read-only
 * executor; it never accepts caller-supplied executable code or tool names.
 */
export async function handleTaskApiRequest(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/tasks") return json({ ok: false, error: "NOT_FOUND" }, 404);

  if (request.method === "GET") {
    return json({
      ok: true,
      runtime: "bounded-task-runtime",
      capabilities: TASK_CAPABILITIES,
      limits: { maxInputBytes: MAX_BODY_BYTES, maxTimeoutMs: 30000, maxRetries: 3 }
    });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, { allow: "GET, POST" });
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "CONTENT_TYPE_JSON_REQUIRED" }, 415);
  }

  const parsed = await readJsonBounded(request);
  if (parsed.tooLarge) return json({ ok: false, error: "REQUEST_TOO_LARGE" }, 413);
  if (!parsed.body) return json({ ok: false, error: "INVALID_JSON" }, 400);

  let contract;
  try {
    contract = createTaskContract({
      taskId: parsed.body.taskId,
      capability: parsed.body.capability,
      input: parsed.body.input ?? {},
      timeoutMs: parsed.body.timeoutMs,
      maxRetries: parsed.body.maxRetries,
      requiresApproval: false
    });
  } catch {
    return json({ ok: false, error: "TASK_CONTRACT_INVALID" }, 400);
  }

  const result = await runTask(contract, TASK_REGISTRY, {
    "worker-health-reader": async ({ input }) => ({
      service: "super-chatty-central-agent",
      version: "1.4.1",
      checkedAt: (typeof options.now === "function" ? options.now() : new Date()).toISOString(),
      databaseConfigured: Boolean(env.DB),
      sessionStoreConfigured: Boolean(env.SESSIONS),
      assetBindingConfigured: Boolean(env.ASSETS),
      requestedBindingDetails: input?.includeBindings === true
    })
  });

  const event = {
    type: result.status === "SUCCEEDED" ? "task.execution.completed" : "task.execution.blocked",
    source: "bounded-task-runtime",
    payload: {
      taskId: result.taskId,
      capability: result.capability,
      status: result.status,
      errorCode: result.errorCode,
      attempts: result.attempts
    }
  };
  let audit = { ok: false };
  if (typeof options.publishEvent === "function") {
    try { audit = await options.publishEvent(event) || { ok: false }; } catch { audit = { ok: false }; }
  }
  if (audit.ok !== true) return json({ ok: false, error: "TASK_AUDIT_UNAVAILABLE", taskId: result.taskId }, 503);

  return json({
    ok: result.status === "SUCCEEDED",
    task: {
      taskId: result.taskId,
      capability: result.capability,
      status: result.status,
      result: result.result,
      errorCode: result.errorCode,
      attempts: result.attempts,
      history: result.history
    },
    audit: { recorded: true, eventId: typeof audit.id === "string" ? audit.id : null }
  }, result.status === "SUCCEEDED" ? 200 : 409);
}
