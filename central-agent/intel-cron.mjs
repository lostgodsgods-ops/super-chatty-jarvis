const REPOSITORY_DEFAULT = "lostgodsgods-ops/super-chatty-jarvis";
const MAX_BODY_BYTES = 64_000;
const MAX_APPROVED_ENDPOINTS = 10;
function approvedEndpoints(raw, allowedRaw) {
  let list;
  try { list = raw ? JSON.parse(raw) : []; } catch { throw new Error("INVALID_INTEL_API_ENDPOINTS_JSON"); }
  if (!Array.isArray(list) || list.length > MAX_APPROVED_ENDPOINTS) throw new Error("INVALID_INTEL_API_ENDPOINTS");
  const allowed = new Set(String(allowedRaw || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
  return list.map(value => {
    let url;
    try { url = new URL(value); } catch { throw new Error("INVALID_INTEL_API_URL"); }
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
        !allowed.has(url.hostname.toLowerCase())) throw new Error("INTEL_API_HOST_NOT_ALLOWLISTED");
    return url;
  });
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function collectApprovedEndpoints(env, fetchImpl) {
  let urls;
  try { urls = approvedEndpoints(env.INTEL_API_ENDPOINTS_JSON, env.INTEL_API_ALLOWED_HOSTS); }
  catch (error) { return [{ ok: false, error: String(error.message || "INTEL_ENDPOINT_CONFIG_INVALID") }]; }
  const results = [];
  for (const url of urls) {
    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { accept: "application/json", "user-agent": "SuperChattyJarvis-IntelCron/1.0" },
        signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) { results.push({ host: url.hostname, path: url.pathname, ok: false, status: response.status }); continue; }
      const body = await response.text();
      if (body.length > MAX_BODY_BYTES) { results.push({ host: url.hostname, path: url.pathname, ok: false, error: "RESPONSE_TOO_LARGE" }); continue; }
      let payload;
      try { payload = JSON.parse(body); } catch { results.push({ host: url.hostname, path: url.pathname, ok: false, error: "NON_JSON_RESPONSE" }); continue; }
      results.push({
        host: url.hostname, path: url.pathname, ok: true, status: response.status,
        contentType: (response.headers.get("content-type") || "").slice(0, 100),
        topLevelKeys: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload).slice(0, 40) : [],
        bodyHash: await sha256(body)
      });
    } catch { results.push({ host: url.hostname, path: url.pathname, ok: false, error: "UPSTREAM_UNAVAILABLE" }); }
  }
  return results;
}


function safeRepository(value) {
  const match = String(value || REPOSITORY_DEFAULT).match(/^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/);
  if (!match) throw new Error("INVALID_GITHUB_REPOSITORY");
  return match[1] + "/" + match[2];
}
export async function runIntelCycle(env = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  if (!env.DB || typeof env.DB.prepare !== "function") return { ok: false, status: "blocked", error: "D1_BINDING_UNAVAILABLE", upgradeExecution: false };
  const repository = safeRepository(env.GITHUB_REPOSITORY);
  const url = "https://api.github.com/repos/" + repository;
  let response;
  try {
    response = await (options.fetchImpl || globalThis.fetch)(url, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "SuperChattyJarvis-IntelCron/1.0" },
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    return { ok: false, status: "degraded", error: "GITHUB_TELEMETRY_UNAVAILABLE", upgradeExecution: false };
  }
  if (!response.ok) return { ok: false, status: "degraded", error: "GITHUB_HTTP_" + response.status, upgradeExecution: false };
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, status: "degraded", error: "GITHUB_RESPONSE_TOO_LARGE", upgradeExecution: false };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, status: "degraded", error: "GITHUB_INVALID_JSON", upgradeExecution: false }; }
  if (data.full_name?.toLowerCase() !== repository.toLowerCase()) return { ok: false, status: "degraded", error: "GITHUB_REPOSITORY_MISMATCH", upgradeExecution: false };
  let sessionLedger = { available: false, activeSessionCount: null };
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS activeSessionCount FROM owner_sessions WHERE status = ? AND expires_at > ?")
      .bind("active", Date.parse(now)).first();
    sessionLedger = { available: true, activeSessionCount: Number(row?.activeSessionCount) || 0 };
  } catch {
    sessionLedger = { available: false, activeSessionCount: null };
  }
  const apiEndpoints = await collectApprovedEndpoints(env, options.fetchImpl || globalThis.fetch);
  const telemetry = {
    collectedAt: now,
    d1SessionLedger: sessionLedger,
    approvedApiEndpoints: apiEndpoints,
    repository: {
      full_name: data.full_name,
      open_issues_count: Number(data.open_issues_count) || 0,
      stargazers_count: Number(data.stargazers_count) || 0,
      forks_count: Number(data.forks_count) || 0,
      pushed_at: typeof data.pushed_at === "string" ? data.pushed_at : null,
      default_branch: typeof data.default_branch === "string" ? data.default_branch : null
    },
    policy: {
      mode: "proposal-only",
      upgradeExecution: false,
      requiresOwnerApproval: true,
      note: "Telemetry may inform a review proposal; it cannot edit source, merge changes, deploy, or grant permissions."
    }
  };
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS intel_snapshots (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, status TEXT NOT NULL,
    payload_json TEXT NOT NULL, collected_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare("INSERT INTO intel_snapshots (id,source,status,payload_json,collected_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), "github-repository", "observed", JSON.stringify(telemetry), now).run();
  return { ok: true, status: "observed", telemetry, upgradeExecution: false };
}
