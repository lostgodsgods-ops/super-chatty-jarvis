import { createNeuralCore, NeuralCoreError } from "./neural-core.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_CORE = createNeuralCore();

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
  const provider = typeof parsed.body.provider === "string" ? parsed.body.provider : "openai";
  let auditStart;
  try {
    auditStart = await options.publishEvent({
      type: "neural_core.reasoning.requested",
      source: "redultron-neural-core",
      payload: { provider: /^[a-z0-9-]{1,64}$/.test(provider) ? provider : "invalid", memoryRequested: typeof parsed.body.memoryQuery === "string" && Boolean(parsed.body.memoryQuery.trim()), promptLogged: false }
    });
  } catch { auditStart = null; }
  if (auditStart?.ok !== true) return json({ ok: false, error: "AUDIT_STORAGE_UNAVAILABLE" }, 503);

  try {
    const result = await core.reason(parsed.body, env);
    let auditDone;
    try {
      auditDone = await options.publishEvent({
        type: "neural_core.reasoning.completed",
        source: "redultron-neural-core",
        payload: { provider: result.provider.id, model: result.provider.model, memoryStatus: result.memory.status, recordsUsed: result.memory.recordsUsed, promptLogged: false }
      });
    } catch { auditDone = null; }
    if (auditDone?.ok !== true) return json({ ok: false, error: "AUDIT_STORAGE_UNAVAILABLE" }, 503);
    return json({ ok: true, result });
  } catch (error) {
    const known = error instanceof NeuralCoreError;
    const code = known ? error.code : (typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : "NEURAL_CORE_EXECUTION_FAILED");
    const status = known ? error.status : 502;
    try {
      await options.publishEvent({
        type: "neural_core.reasoning.failed",
        source: "redultron-neural-core",
        payload: { provider: /^[a-z0-9-]{1,64}$/.test(provider) ? provider : "invalid", code, status, promptLogged: false }
      });
    } catch {}
    return json({ ok: false, error: code, code }, status);
  }
}
