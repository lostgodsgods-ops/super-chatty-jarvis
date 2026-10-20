/**
 * Safe, read-only integration readiness inventory.
 * Reports configuration presence only; never returns values or claims reachability.
 */
const hasValue = (env, key) => {
  const value = env?.[key];
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null && typeof value === "object";
};
const configured = (env, keys) => keys.every(key => hasValue(env, key));
const oneOfConfigured = (env, alternatives) => alternatives.some(keys => configured(env, keys));

function service(id, label, status, missing, purpose) {
  return { id, label, status, missing, purpose };
}

export function buildAccessReadiness(env = {}) {
  const services = [];
  const add = (id, label, keys, purpose, alternatives = null) => {
    const isConfigured = alternatives ? oneOfConfigured(env, alternatives) : configured(env, keys);
    services.push(service(
      id,
      label,
      isConfigured ? "CONFIGURED" : keys.some(key => hasValue(env, key)) ? "PARTIAL" : "MISSING",
      isConfigured ? [] : keys.filter(key => !hasValue(env, key)),
      purpose
    ));
  };

  add("ai-inference", "AI inference", ["AI"], "Model inference through the configured platform binding.");
  add("owner-data", "Owner identity and durable data", ["DB", "SESSIONS"], "Owner-authenticated data and session storage.");
  add("web-research", "Public web research", ["TAVILY_API_KEY"], "Search current public sources; provider reachability requires a real query.");
  add("agent-gateway", "Bounded agent gateway", ["AGENT_GATEWAY_TOKEN"], "Authenticated calls to explicitly registered agent tools.");
  add("github-automation", "GitHub automation", ["MCP_GITHUB_URL", "MCP_GITHUB_TOKEN"], "Repository access through a configured, scoped integration.");
  add("vector-memory", "Vector retrieval", [], "Optional semantic retrieval backend.", [
    ["PINECONE_INDEX_HOST", "PINECONE_API_KEY"],
    ["QDRANT_URL", "QDRANT_API_KEY", "QDRANT_COLLECTION"],
    ["PGVECTOR_REST_URL", "PGVECTOR_SERVICE_KEY", "PGVECTOR_UPSERT_RPC", "PGVECTOR_QUERY_RPC", "PGVECTOR_GET_RPC"]
  ]);
  add("scheduled-work", "Scheduled background work", ["SCHEDULED_TASKS_ENABLED"], "A configured schedule is needed for recurring research; runtime trigger execution must be tested separately.");

  const configuredCount = services.filter(item => item.status === "CONFIGURED").length;
  const partialCount = services.filter(item => item.status === "PARTIAL").length;
  const missingCount = services.filter(item => item.status === "MISSING").length;

  return {
    schemaVersion: "1.0",
    overallStatus: configuredCount === services.length ? "CONFIGURED" : configuredCount === 0 ? "BLOCKED" : "PARTIAL",
    summary: { configured: configuredCount, partial: partialCount, missing: missingCount, total: services.length },
    reachabilityVerified: false,
    interpretation: "Configuration presence only. Live reachability, authorization scope, quotas and runtime behavior require separate tests.",
    services,
    deviceControl: {
      status: "NOT_GRANTED",
      reason: "A server integration does not grant access to the user's phone, microphone, files or other apps."
    },
    physicalActuation: {
      status: "DISABLED",
      reason: "Physical-world actions remain disabled by default and are not enabled by adding credentials."
    },
    securityRequirements: [
      "Use least-privilege, revocable credentials stored only in server-side secrets.",
      "Never expose secret values in reports, client code, logs or chat.",
      "Verify each provider with a bounded health check and a representative test query.",
      "Require owner authentication and explicit approval for consequential actions.",
      "Keep planning, simulation and live execution as separate modes."
    ]
  };
}
