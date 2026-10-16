/**
 * Fail-closed MCP and vector database integration adapters.
 * Targets are environment-configured only; callers cannot supply URLs or tool names.
 */
const MCP_SERVERS = Object.freeze({
  github: { url: "MCP_GITHUB_URL", token: "MCP_GITHUB_TOKEN" },
  postgresql: { url: "MCP_POSTGRES_URL", token: "MCP_POSTGRES_TOKEN" },
  filesystem: { url: "MCP_FILESYSTEM_URL", token: "MCP_FILESYSTEM_TOKEN" },
  custom: { url: "MCP_CUSTOM_URL", token: "MCP_CUSTOM_TOKEN" }
});
const VECTOR_BACKENDS = Object.freeze({
  pinecone: { url: "PINECONE_INDEX_HOST", key: "PINECONE_API_KEY" },
  qdrant: { url: "QDRANT_URL", key: "QDRANT_API_KEY", collection: "QDRANT_COLLECTION" },
  pgvector: { url: "PGVECTOR_REST_URL", key: "PGVECTOR_SERVICE_KEY", upsert: "PGVECTOR_UPSERT_RPC", query: "PGVECTOR_QUERY_RPC", get: "PGVECTOR_GET_RPC" }
});
const timeoutMs = 8000;
const jsonLimit = 1_000_000;

export class IntegrationError extends Error {
  constructor(code, status = 503) { super(code); this.name = "IntegrationError"; this.code = code; this.status = status; }
}
function required(env, key) {
  const value = env?.[key];
  if (typeof value !== "string" || !value.trim()) throw new IntegrationError("MISSING_CONFIGURATION:" + key);
  return value.trim();
}
function endpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new IntegrationError("INVALID_ENDPOINT", 400); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new IntegrationError("UNSAFE_ENDPOINT", 400);
  }
  return url.toString().replace(/\/$/, "");
}
async function request(url, init, fetchImpl) {
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try { response = await fetchImpl(url, { ...init, signal, redirect: "error" }); }
  catch { throw new IntegrationError("UPSTREAM_UNAVAILABLE"); }
  const text = await response.text();
  if (text.length > jsonLimit) throw new IntegrationError("UPSTREAM_RESPONSE_TOO_LARGE", 502);
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { throw new IntegrationError("INVALID_UPSTREAM_JSON", 502); } }
  if (!response.ok) throw new IntegrationError("UPSTREAM_HTTP_" + response.status, 502);
  if (data?.error) throw new IntegrationError("UPSTREAM_OPERATION_FAILED", 502);
  return { data, headers: response.headers };
}
function bearer(token) { return { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json" }; }
function vectorRecord(record) {
  if (!record || typeof record.id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(record.id)) throw new IntegrationError("INVALID_RECORD_ID", 400);
  if (!Array.isArray(record.values) || record.values.length < 1 || record.values.length > 20000 ||
      record.values.some(v => typeof v !== "number" || !Number.isFinite(v))) throw new IntegrationError("INVALID_VECTOR", 400);
  return { id: record.id, values: record.values, ...(record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? { metadata: record.metadata } : {}) };
}
function sameVector(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((v, i) => Number.isFinite(v) && Math.abs(v - expected[i]) <= 1e-5);
}
export function listMcpCapabilities(env = {}) {
  return Object.entries(MCP_SERVERS).map(([id, c]) => ({
    id, type: "mcp", configured: Boolean(env[c.url] && env[c.token]),
    status: env[c.url] && env[c.token] ? "configured_not_verified" : "not_configured",
    connectionAttempted: false
  }));
}
export function listVectorCapabilities(env = {}) {
  return Object.entries(VECTOR_BACKENDS).map(([id, c]) => {
    const configured = Boolean(env[c.url] && env[c.key] && (id !== "qdrant" || env[c.collection]) &&
      (id !== "pgvector" || env[c.upsert] && env[c.query] && env[c.get]));
    return { id, type: "vector", configured, status: configured ? "configured_not_verified" : "not_configured", connectionAttempted: false };
  });
}

/** Performs MCP initialize + tools/list only. It never executes a tool. */
export async function connectMcpAndListTools(serverId, env = {}, fetchImpl = globalThis.fetch) {
  const c = MCP_SERVERS[serverId];
  if (!c) throw new IntegrationError("UNKNOWN_MCP_SERVER", 400);
  const url = endpoint(required(env, c.url));
  const token = required(env, c.token);
  if (typeof fetchImpl !== "function") throw new IntegrationError("FETCH_UNAVAILABLE");
  let sessionId;
  const call = async (method, params, id) => {
    const headers = { ...bearer(token), "mcp-protocol-version": "2025-03-26" };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const result = await request(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }, fetchImpl);
    sessionId ||= result.headers.get("mcp-session-id") || undefined;
    if (!result.data || result.data.jsonrpc !== "2.0" || result.data.id !== id) throw new IntegrationError("INVALID_MCP_RESPONSE", 502);
    if (result.data.error) throw new IntegrationError("MCP_RPC_ERROR", 502);
    return result.data.result;
  };
  const initialized = await call("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "super-chatty-jarvis", version: "1.0.0" }
  }, 1);
  if (!initialized || typeof initialized.protocolVersion !== "string" || !initialized.serverInfo) throw new IntegrationError("INVALID_MCP_INITIALIZE", 502);
  await request(url, { method: "POST", headers: { ...bearer(token), "mcp-protocol-version": initialized.protocolVersion, ...(sessionId ? { "mcp-session-id": sessionId } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }, fetchImpl);
  const result = await call("tools/list", {}, 2);
  if (!result || !Array.isArray(result.tools) || result.tools.some(t => !t || typeof t.name !== "string")) throw new IntegrationError("INVALID_MCP_TOOLS", 502);
  return { ok: true, serverId, protocolVersion: initialized.protocolVersion, serverInfo: initialized.serverInfo, tools: result.tools.map(t => ({ name: t.name, description: typeof t.description === "string" ? t.description : "" })), toolsExecuted: false };
}

/** Writes a vector then reads the exact ID back. pgvector uses explicitly provisioned PostgREST RPCs. */
export async function vectorUpsertQueryReadback(backendId, env = {}, input, fetchImpl = globalThis.fetch) {
  const c = VECTOR_BACKENDS[backendId];
  if (!c) throw new IntegrationError("UNKNOWN_VECTOR_BACKEND", 400);
  const record = vectorRecord(input?.record);
  const base = endpoint(required(env, c.url));
  const key = required(env, c.key);
  if (typeof fetchImpl !== "function") throw new IntegrationError("FETCH_UNAVAILABLE");
  if (backendId === "pinecone") {
    await request(base + "/vectors/upsert", { method: "POST", headers: { ...bearer(key), "Api-Key": key }, body: JSON.stringify({ vectors: [record], namespace: input?.namespace || "" }) }, fetchImpl);
    const query = await request(base + "/vectors/fetch", { method: "GET", headers: { "Api-Key": key, accept: "application/json" } }, async (url, init) => {
      const u = new URL(url); u.searchParams.set("ids", record.id); if (input?.namespace) u.searchParams.set("namespace", input.namespace);
      return fetchImpl(u.toString(), init);
    });
    const found = query.data?.vectors?.[record.id];
    if (!found || !sameVector(found.values, record.values)) throw new IntegrationError("VECTOR_READBACK_MISMATCH", 502);
  } else if (backendId === "qdrant") {
    if (!/^(?:[0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(record.id)) throw new IntegrationError("QDRANT_ID_MUST_BE_UUID_OR_UNSIGNED_INTEGER", 400);
    const collection = encodeURIComponent(required(env, c.collection));
    if (!/^[A-Za-z0-9._-]{1,255}$/.test(env[c.collection])) throw new IntegrationError("INVALID_COLLECTION", 400);
    const id = record.id;
    await request(base + "/collections/" + collection + "/points?wait=true", { method: "PUT", headers: bearer(key), body: JSON.stringify({ points: [{ id, vector: record.values, payload: record.metadata || {} }] }) }, fetchImpl);
    const read = await request(base + "/collections/" + collection + "/points/retrieve", { method: "POST", headers: bearer(key), body: JSON.stringify({ ids: [id], with_vector: true }) }, fetchImpl);
    const found = read.data?.result?.find(p => String(p.id) === id);
    if (!found || !sameVector(found.vector, record.values)) throw new IntegrationError("VECTOR_READBACK_MISMATCH", 502);
  } else {
    const upsertRpc = required(env, c.upsert), queryRpc = required(env, c.query), getRpc = required(env, c.get);
    for (const rpc of [upsertRpc, queryRpc, getRpc]) if (!/^[A-Za-z0-9_]{1,64}$/.test(rpc)) throw new IntegrationError("INVALID_RPC_NAME", 400);
    const headers = { ...bearer(key), apikey: key };
    await request(base + "/rpc/" + upsertRpc, { method: "POST", headers, body: JSON.stringify({ record }) }, fetchImpl);
    await request(base + "/rpc/" + queryRpc, { method: "POST", headers, body: JSON.stringify({ query_vector: record.values, top_k: 1 }) }, fetchImpl);
    const read = await request(base + "/rpc/" + getRpc, { method: "POST", headers, body: JSON.stringify({ record_id: record.id }) }, fetchImpl);
    const found = Array.isArray(read.data) ? read.data.find(p => String(p.id) === record.id) : read.data;
    const values = found?.values || found?.embedding || found?.vector;
    if (!found || String(found.id) !== record.id || !sameVector(values, record.values)) throw new IntegrationError("VECTOR_READBACK_MISMATCH", 502);
  }
  return { ok: true, backendId, recordId: record.id, upsert: "PASS", readback: "PASS", vectorDimensions: record.values.length };
}

/** Legacy resolver remains fail-closed; use the explicit active adapter functions above. */
export function resolveMcpServer(serverId, env = {}) {
  const c = MCP_SERVERS[serverId];
  if (!c) return { ok: false, status: 400, code: "UNKNOWN_MCP_SERVER" };
  if (!env[c.url] || !env[c.token]) return { ok: false, status: 503, code: "MCP_SERVER_NOT_CONFIGURED" };
  return { ok: false, status: 501, code: "USE_CONNECT_MCP_AND_LIST_TOOLS" };
}
export function resolveVectorBackend(backendId, env = {}) {
  const c = VECTOR_BACKENDS[backendId];
  if (!c) return { ok: false, status: 400, code: "UNKNOWN_VECTOR_BACKEND" };
  if (!env[c.url] || !env[c.key]) return { ok: false, status: 503, code: "VECTOR_BACKEND_NOT_CONFIGURED" };
  return { ok: false, status: 501, code: "USE_VECTOR_UPSERT_QUERY_READBACK" };
}
