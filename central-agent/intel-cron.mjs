const REPOSITORY_DEFAULT = "lostgodsgods-ops/super-chatty-jarvis";
const MAX_BODY_BYTES = 64_000;

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
  const telemetry = {
    collectedAt: now,
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
