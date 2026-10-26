const TOOL_ALLOWLIST = Object.freeze([
  Object.freeze({
    id: "live-search",
    description: "Read-only search through the configured live-search provider chain.",
    sideEffects: "read-only",
    approvalRequired: true,
    inputSchema: Object.freeze({
      type: "object",
      required: Object.freeze(["query"]),
      additionalProperties: false,
      properties: Object.freeze({
        query: Object.freeze({ type: "string", minLength: 1, maxLength: 400 })
      })
    })
  })
]);

export class ToolForgeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "ToolForgeError";
    this.code = code;
    this.status = status;
  }
}

export function listToolForgeTools() {
  return TOOL_ALLOWLIST.map(tool => ({
    id: tool.id,
    description: tool.description,
    sideEffects: tool.sideEffects,
    approvalRequired: tool.approvalRequired,
    inputSchema: {
      type: tool.inputSchema.type,
      required: [...tool.inputSchema.required],
      additionalProperties: tool.inputSchema.additionalProperties,
      properties: { query: { ...tool.inputSchema.properties.query } }
    }
  }));
}

function validateInput(tool, input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !tool.inputSchema.properties[key])) {
    throw new ToolForgeError("INPUT_SCHEMA_INVALID", 400);
  }
  const query = input.query;
  if (typeof query !== "string" || query.trim().length < 1 ||
      query.length > tool.inputSchema.properties.query.maxLength) {
    throw new ToolForgeError("INPUT_SCHEMA_INVALID", 400);
  }
  return { query: query.trim() };
}

function validateSearchResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result) ||
      typeof result.provider !== "string" || !Array.isArray(result.sources) ||
      result.sources.length < 1 || result.sources.length > 5) {
    throw new ToolForgeError("TOOL_RESULT_SCHEMA_INVALID", 502);
  }
  const sources = result.sources.map(source => {
    if (!source || typeof source.title !== "string" || typeof source.url !== "string") {
      throw new ToolForgeError("TOOL_RESULT_SCHEMA_INVALID", 502);
    }
    let url;
    try { url = new URL(source.url); } catch { throw new ToolForgeError("TOOL_RESULT_SCHEMA_INVALID", 502); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new ToolForgeError("TOOL_RESULT_SCHEMA_INVALID", 502);
    }
    return {
      title: source.title.slice(0, 240),
      url: url.toString(),
      snippet: typeof source.snippet === "string" ? source.snippet.slice(0, 1200) :
        typeof source.content === "string" ? source.content.slice(0, 1200) : "",
      publishedDate: typeof source.publishedDate === "string" ? source.publishedDate.slice(0, 80) : null
    };
  });
  return { provider: result.provider.slice(0, 80), sources, query: typeof result.query === "string" ? result.query.slice(0, 400) : "" };
}

async function audit(env, { requestId, toolId, status, details }) {
  if (!env?.DB || typeof env.DB.prepare !== "function") throw new ToolForgeError("TOOL_AUDIT_UNAVAILABLE", 503);
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tool_forge_audit (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL, tool_id TEXT NOT NULL,
      status TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL
    )`).run();
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tool_forge_audit (id,request_id,tool_id,status,details_json,created_at) VALUES (?,?,?,?,?,?)")
      .bind(id, requestId, toolId, status, JSON.stringify(details).slice(0, 4000), new Date().toISOString()).run();
    return id;
  } catch {
    throw new ToolForgeError("TOOL_AUDIT_UNAVAILABLE", 503);
  }
}

/**
 * Sandboxed dispatcher: the caller can supply an executor only for the fixed
 * live-search ID. It cannot select URLs, import code, or invoke arbitrary methods.
 * Durable audit is required before execution and recorded after completion.
 */
export async function executeToolForge({ toolId, input, approved = false, env = {}, execute, timeoutMs = 5000 }) {
  const tool = TOOL_ALLOWLIST.find(item => item.id === toolId);
  if (!tool) throw new ToolForgeError("TOOL_NOT_ALLOWLISTED", 403);
  if (approved !== true) throw new ToolForgeError("OWNER_APPROVAL_REQUIRED", 403);
  if (typeof execute !== "function") throw new ToolForgeError("TOOL_EXECUTOR_UNAVAILABLE", 503);
  const normalizedInput = validateInput(tool, input);
  const requestId = crypto.randomUUID();
  const startedAt = await audit(env, {
    requestId, toolId, status: "started",
    details: { approved: true, executionMode: "allowlisted-read-only", inputKeys: Object.keys(normalizedInput) }
  });
  try {
    const boundedTimeoutMs = Math.min(5000, Math.max(1, Number.isFinite(timeoutMs) ? timeoutMs : 5000));
    let timeoutHandle;
    let raw;
    try {
      raw = await Promise.race([
        Promise.resolve().then(() => execute(normalizedInput.query)),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new ToolForgeError("TOOL_EXECUTION_TIMEOUT", 504)), boundedTimeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timeoutHandle);
    }
    const result = validateSearchResult(raw);
    const completedAuditId = await audit(env, {
      requestId, toolId, status: "completed",
      details: { provider: result.provider, sourceCount: result.sources.length, schemaValid: true }
    });
    return {
      ok: true, requestId, toolId, executionMode: "allowlisted-read-only",
      audit: { started: true, startEventId: startedAt, completed: true, resultEventId: completedAuditId },
      result
    };
  } catch (error) {
    const code = error instanceof ToolForgeError ? error.code : "TOOL_EXECUTION_FAILED";
    await audit(env, { requestId, toolId, status: "failed", details: { code } });
    if (error instanceof ToolForgeError) throw error;
    throw new ToolForgeError(code, 502);
  }
}
