const MAX_SPEC_BYTES = 512_000;
const MAX_OPERATIONS = 100;
const TIMEOUT_MS = 5000;

export class CapabilityIngestionError extends Error {
  constructor(code, status = 400) { super(code); this.name = "CapabilityIngestionError"; this.code = code; this.status = status; }
}
function parseAllowedHosts(value) {
  return new Set(String(value || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
}
function validateSource(sourceUrl, allowedHosts) {
  let url;
  try { url = new URL(sourceUrl); } catch { throw new CapabilityIngestionError("INVALID_SPEC_URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port) {
    throw new CapabilityIngestionError("UNSAFE_SPEC_URL");
  }
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.has(host)) throw new CapabilityIngestionError("HOST_NOT_ALLOWLISTED", 403);
  if (host === "localhost" || host.endsWith(".localhost") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new CapabilityIngestionError("NON_PUBLIC_SPEC_HOST", 403);
  }
  return url;
}
function schemaSummary(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const out = {};
  for (const key of ["type", "format", "description", "required", "enum"]) {
    if (["type", "format", "description"].includes(key) && typeof schema[key] === "string") out[key] = schema[key].slice(0, 240);
    if (key === "required" && Array.isArray(schema.required)) out.required = schema.required.filter(x => typeof x === "string").slice(0, 30);
    if (key === "enum" && Array.isArray(schema.enum)) out.enum = schema.enum.slice(0, 20).filter(x => ["string", "number", "boolean"].includes(typeof x));
  }
  if (schema.items && typeof schema.items === "object") out.items = schemaSummary(schema.items);
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).slice(0, 30).map(([name, value]) => [name.slice(0, 80), schemaSummary(value) || {}]));
  }
  return out;
}
export function normalizeCapabilityDocument(document, { sourceUrl, allowedHosts = [], maxOperations = MAX_OPERATIONS } = {}) {
  const url = validateSource(sourceUrl, new Set([...allowedHosts].map(x => String(x).toLowerCase())));
  if (!document || typeof document !== "object" || Array.isArray(document) ||
      !(typeof document.openapi === "string" && /^3\.(0|1)\./.test(document.openapi)) &&
      !(document.swagger === "2.0")) {
    throw new CapabilityIngestionError("UNSUPPORTED_API_SCHEMA");
  }
  const title = typeof document.info?.title === "string" ? document.info.title.slice(0, 160) : "Untitled API";
  const version = typeof document.info?.version === "string" ? document.info.version.slice(0, 80) : "unknown";
  const operations = [];
  const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    if (!path.startsWith("/") || path.length > 300 || !pathItem || typeof pathItem !== "object") continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method.toLowerCase()) || !operation || typeof operation !== "object") continue;
      if (operations.length >= Math.min(MAX_OPERATIONS, Math.max(1, Number(maxOperations) || MAX_OPERATIONS))) break;
      const parameters = Array.isArray(operation.parameters) ? operation.parameters.slice(0, 30).map(p => ({
        name: typeof p?.name === "string" ? p.name.slice(0, 100) : "",
        in: ["path", "query", "header", "cookie"].includes(p?.in) ? p.in : "unknown",
        required: p?.required === true,
        schema: schemaSummary(p?.schema)
      })) : [];
      const responses = Object.keys(operation.responses || {}).filter(x => /^\d{3}$|^[1-5]XX$/i.test(x)).slice(0, 12);
      const requestSchema = operation.requestBody?.content && Object.values(operation.requestBody.content)[0]?.schema;
      operations.push({
        operationId: typeof operation.operationId === "string" ? operation.operationId.slice(0, 120) : "",
        method: method.toUpperCase(), path,
        summary: typeof operation.summary === "string" ? operation.summary.slice(0, 240) : "",
        tags: Array.isArray(operation.tags) ? operation.tags.filter(x => typeof x === "string").slice(0, 8).map(x => x.slice(0, 80)) : [],
        parameters, requestSchema: schemaSummary(requestSchema), responses
      });
    }
    if (operations.length >= Math.min(MAX_OPERATIONS, Math.max(1, Number(maxOperations) || MAX_OPERATIONS))) break;
  }
  return {
    schemaVersion: "jarvis-capability-index-v1", sourceUrl: url.toString(), host: url.hostname,
    title, version, operationCount: operations.length, operations,
    executionEnabled: false, approvalRequired: true,
    note: "Metadata only. No credentials imported, endpoints invoked, or executable tools created."
  };
}
async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function ingestCapabilitySpec(sourceUrl, env = {}, fetchImpl = globalThis.fetch) {
  const allowedHosts = parseAllowedHosts(env.CAPABILITY_SPEC_HOSTS);
  if (!allowedHosts.size) throw new CapabilityIngestionError("CAPABILITY_SPEC_HOSTS_NOT_CONFIGURED", 503);
  const url = validateSource(sourceUrl, allowedHosts);
  if (!env.DB || typeof env.DB.prepare !== "function") throw new CapabilityIngestionError("D1_BINDING_UNAVAILABLE", 503);
  if (typeof fetchImpl !== "function") throw new CapabilityIngestionError("FETCH_UNAVAILABLE", 503);
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { accept: "application/json", "user-agent": "SuperChattyJarvis-CapabilityIndexer/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch { throw new CapabilityIngestionError("SPEC_FETCH_FAILED", 502); }
  if (!response.ok) throw new CapabilityIngestionError("SPEC_HTTP_" + response.status, 502);
  const text = await response.text();
  if (text.length > MAX_SPEC_BYTES) throw new CapabilityIngestionError("SPEC_TOO_LARGE", 413);
  let document;
  try { document = JSON.parse(text); } catch { throw new CapabilityIngestionError("SPEC_INVALID_JSON", 400); }
  const snapshot = normalizeCapabilityDocument(document, { sourceUrl: url.toString(), allowedHosts });
  const json = JSON.stringify(snapshot);
  const hash = await digest(json);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS capability_snapshots (
    source_url TEXT PRIMARY KEY, schema_hash TEXT NOT NULL, title TEXT NOT NULL,
    operation_count INTEGER NOT NULL, metadata_json TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT INTO capability_snapshots (source_url,schema_hash,title,operation_count,metadata_json,updated_at)
    VALUES (?,?,?,?,?,?) ON CONFLICT(source_url) DO UPDATE SET schema_hash=excluded.schema_hash,
    title=excluded.title,operation_count=excluded.operation_count,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(url.toString(), hash, snapshot.title, snapshot.operationCount, json, new Date().toISOString()).run();
  return { ok: true, persisted: true, schemaHash: hash, ...snapshot };
}
