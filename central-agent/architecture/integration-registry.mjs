/**
 * Integration points only. No outbound connection is attempted by this registry.
 * Never accept arbitrary target URLs from callers.
 */
const MCP_SERVERS = Object.freeze({
  github: { env: "MCP_GITHUB_URL", tokenEnv: "MCP_GITHUB_TOKEN" },
  postgresql: { env: "MCP_POSTGRES_URL", tokenEnv: "MCP_POSTGRES_TOKEN" },
  filesystem: { env: "MCP_FILESYSTEM_URL", tokenEnv: "MCP_FILESYSTEM_TOKEN" },
  custom: { env: "MCP_CUSTOM_URL", tokenEnv: "MCP_CUSTOM_TOKEN" }
});
const VECTOR_BACKENDS = Object.freeze({
  pinecone: { env: "PINECONE_INDEX_HOST", keyEnv: "PINECONE_API_KEY" },
  qdrant: { env: "QDRANT_URL", keyEnv: "QDRANT_API_KEY" },
  milvus: { env: "MILVUS_URL", keyEnv: "MILVUS_TOKEN" },
  chroma: { env: "CHROMA_URL", keyEnv: "CHROMA_TOKEN" },
  pgvector: { env: "PGVECTOR_D1_ADAPTER", keyEnv: "PGVECTOR_ENABLED" }
});
function safeStatus(entries, env, type) {
  return Object.entries(entries).map(([id, config]) => ({
    id, type, configured: Boolean(env[config.env] && env[config.tokenEnv || config.keyEnv]),
    status: env[config.env] && env[config.tokenEnv || config.keyEnv] ? "configured_not_verified" : "not_configured",
    connectionAttempted: false
  }));
}
export function listMcpCapabilities(env = {}) { return safeStatus(MCP_SERVERS, env, "mcp"); }
export function listVectorCapabilities(env = {}) { return safeStatus(VECTOR_BACKENDS, env, "vector"); }
export function resolveMcpServer(serverId, env = {}) {
  const config = MCP_SERVERS[serverId];
  if (!config) return { ok: false, status: 400, code: "UNKNOWN_MCP_SERVER" };
  if (!env[config.env] || !env[config.tokenEnv]) return { ok: false, status: 503, code: "MCP_SERVER_NOT_CONFIGURED" };
  return { ok: false, status: 501, code: "MCP_TRANSPORT_NOT_IMPLEMENTED", note: "Configuration is present but MCP transport and tool allowlist are not implemented." };
}
export function resolveVectorBackend(backendId, env = {}) {
  const config = VECTOR_BACKENDS[backendId];
  if (!config) return { ok: false, status: 400, code: "UNKNOWN_VECTOR_BACKEND" };
  if (!env[config.env] || !env[config.keyEnv]) return { ok: false, status: 503, code: "VECTOR_BACKEND_NOT_CONFIGURED" };
  return { ok: false, status: 501, code: "VECTOR_ADAPTER_NOT_IMPLEMENTED", note: "Configuration is present but vector operations are not implemented." };
}
