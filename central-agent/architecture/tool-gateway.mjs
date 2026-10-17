/**
 * Allowlisted, read-only API tool gateway for operational checks.
 * This module never deploys, mutates GitHub, or executes arbitrary URLs.
 */
const ALLOWED_REPOSITORY = "lostgodsgods-ops/super-chatty-jarvis";
const DEPLOY_WORKFLOW = "deploy-cloudflare.yml";

function result(status, body) {
  return { status, body: { ok: status >= 200 && status < 300, ...body } };
}

export function listToolCapabilities(env = {}) {
  return {
    actions: ["integration.status", "memory.d1-health", "memory.vectorize-status", "github.workflow-status"],
    bindings: {
      d1: Boolean(env.DB && typeof env.DB.prepare === "function"),
      vectorize: Boolean(env.VECTORIZE && typeof env.VECTORIZE.query === "function"),
      githubApi: Boolean(typeof env.GITHUB_TOKEN === "string" && env.GITHUB_TOKEN.trim())
    },
    productionDeployment: {
      status: "OWNER_APPROVAL_AND_EXISTING_GITHUB_ACTIONS_REQUIRED",
      workflow: DEPLOY_WORKFLOW
    }
  };
}

async function githubRequest(env, path) {
  const token = typeof env.GITHUB_TOKEN === "string" ? env.GITHUB_TOKEN.trim() : "";
  const repository = typeof env.GITHUB_REPOSITORY === "string" ? env.GITHUB_REPOSITORY.trim() : ALLOWED_REPOSITORY;
  if (!token) return result(503, { error: "GITHUB_TOKEN_NOT_CONFIGURED" });
  if (repository !== ALLOWED_REPOSITORY) return result(403, { error: "GITHUB_REPOSITORY_NOT_ALLOWED" });
  let response;
  try {
    response = await fetch("https://api.github.com/repos/" + ALLOWED_REPOSITORY + path, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer " + token,
        "x-github-api-version": "2022-11-28"
      },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return result(502, { error: "GITHUB_API_NETWORK_ERROR" });
  }
  if (!response.ok) return result(response.status === 401 || response.status === 403 ? 502 : response.status, {
    error: "GITHUB_API_REQUEST_FAILED",
    upstreamStatus: response.status
  });
  try { return { status: response.status, body: await response.json() }; }
  catch { return result(502, { error: "GITHUB_API_INVALID_RESPONSE" }); }
}

export async function executeToolAction(input, env = {}) {
  const action = typeof input?.action === "string" ? input.action : "";
  if (action === "integration.status") return result(200, { capabilities: listToolCapabilities(env) });

  if (action === "memory.d1-health") {
    if (!env.DB || typeof env.DB.prepare !== "function") return result(503, { error: "D1_BINDING_UNAVAILABLE" });
    try {
      const row = await env.DB.prepare("SELECT 1 AS ok").first();
      if (Number(row?.ok) !== 1) return result(503, { error: "D1_HEALTH_CHECK_FAILED" });
      return result(200, { service: "D1", status: "PASS", query: "SELECT 1" });
    } catch {
      return result(503, { error: "D1_HEALTH_CHECK_FAILED" });
    }
  }

  if (action === "memory.vectorize-status") {
    if (!env.VECTORIZE || typeof env.VECTORIZE.query !== "function") return result(503, { error: "VECTORIZE_BINDING_UNAVAILABLE", status: "BLOCKED" });
    return result(200, { service: "Vectorize", status: "CONFIGURED_NOT_ROUND_TRIP_VERIFIED", note: "A real query requires a valid embedding and index-specific dimensions." });
  }

  if (action === "github.workflow-status") {
    const workflow = await githubRequest(env, "/actions/workflows/" + DEPLOY_WORKFLOW + "/runs?branch=main&per_page=1");
    if (workflow.status < 200 || workflow.status >= 300) return workflow;
    const runs = Array.isArray(workflow.body?.workflow_runs) ? workflow.body.workflow_runs : [];
    return result(200, { workflow: DEPLOY_WORKFLOW, latestRun: runs[0] ? {
      id: runs[0].id, status: runs[0].status, conclusion: runs[0].conclusion,
      head_sha: runs[0].head_sha, html_url: runs[0].html_url
    } : null });
  }

  return result(400, { error: "TOOL_ACTION_NOT_ALLOWLISTED" });
}
