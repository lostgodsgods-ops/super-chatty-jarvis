/**
 * REDULTRON hybrid-core edge adapter.
 *
 * Cloudflare Workers cannot execute Python in-process. Heavy processing therefore
 * runs in a separately deployed Python HTTPS service; this adapter is the only
 * supported edge-to-Python boundary. It fails closed when configuration is absent.
 */
const MAX_INPUT_CHARS = 16000;
const ALLOWED_TASKS = new Set(["summarize", "extract_keywords", "classify_text"]);
const REQUEST_TIMEOUT_MS = 5000;

export class HybridCoreError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "HybridCoreError";
    this.code = code;
    this.status = status;
  }
}

export function validateHybridTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HybridCoreError("HYBRID_INVALID_REQUEST", 400);
  }
  const task = typeof input.task === "string" ? input.task.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!ALLOWED_TASKS.has(task)) throw new HybridCoreError("HYBRID_TASK_NOT_ALLOWED", 400);
  if (!text || text.length > MAX_INPUT_CHARS) throw new HybridCoreError("HYBRID_TEXT_LENGTH_INVALID", 400);
  return { task, text };
}

export async function executeHybridTask(input, env, options = {}) {
  const payload = validateHybridTask(input);
  const endpoint = typeof env?.PYTHON_CORE_URL === "string" ? env.PYTHON_CORE_URL.trim() : "";
  const secret = typeof env?.OWNER_SECRET === "string" ? env.OWNER_SECRET.trim() : "";
  if (!endpoint || !secret) throw new HybridCoreError("HYBRID_CORE_NOT_CONFIGURED", 503);

  let url;
  try {
    url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        (url.pathname !== "/" && url.pathname !== "/v1/execute")) {
      throw new Error("invalid");
    }
    if (url.pathname === "/") url.pathname = "/v1/execute";
  } catch {
    throw new HybridCoreError("HYBRID_CORE_URL_INVALID", 503);
  }

  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : fetch;
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "user-agent": "REDULTRON-HybridCore/1.0",
        "x-owner-secret": secret
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new HybridCoreError(error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "HYBRID_CORE_TIMEOUT" : "HYBRID_CORE_UNAVAILABLE", 502);
  }
  if (response.status === 401 || response.status === 403) {
    const error = new HybridCoreError("HYBRID_CORE_AUTH_REJECTED", 502);
    error.upstreamStatus = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new HybridCoreError("HYBRID_CORE_UPSTREAM_FAILED", 502);
    error.upstreamStatus = response.status;
    throw error;
  }

  let result;
  try { result = await response.json(); } catch { throw new HybridCoreError("HYBRID_CORE_INVALID_RESPONSE", 502); }
  if (!result || result.ok !== true || result.task !== payload.task || !("result" in result)) {
    throw new HybridCoreError("HYBRID_CORE_INVALID_RESPONSE", 502);
  }
  const value = result.result;
  const validResult = payload.task === "summarize"
    ? typeof value === "string" && value.length <= 2000
    : payload.task === "extract_keywords"
      ? Array.isArray(value) && value.length <= 12 && value.every(item =>
          item && typeof item === "object" && !Array.isArray(item) &&
          typeof item.term === "string" && Number.isInteger(item.count) && item.count > 0)
      : payload.task === "classify_text"
        ? value && typeof value === "object" && !Array.isArray(value) &&
          Array.isArray(value.labels) && value.labels.length > 0 &&
          value.labels.every(label => typeof label === "string") &&
          Number.isInteger(value.characters) && value.characters >= 0
        : false;
  if (!validResult) throw new HybridCoreError("HYBRID_CORE_INVALID_RESPONSE", 502);
  return { ok: true, engine: "python-edge-hybrid", task: payload.task, result: value };
}
