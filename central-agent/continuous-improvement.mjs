/**
 * Bounded, evidence-backed continuous improvement proposals.
 * This module observes prior failed runs and records proposals only; it never mutates code,
 * grants capabilities, changes owner controls, or executes upgrades.
 */
const MAX_ROWS = 100;
const MAX_PROPOSALS = 3;
const MIN_REPEAT_COUNT = 2;

function clean(value, max = 120) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function failureSignal(row) {
  const module = clean(row?.module || row?.agent_id || row?.agentId, 80) || "unknown-module";
  let details = {};
  try {
    details = typeof row?.details_json === "string" ? JSON.parse(row.details_json) :
      typeof row?.detailsJson === "string" ? JSON.parse(row.detailsJson) : (row?.details || {});
  } catch {}
  const error = clean(row?.error_code || row?.errorCode || details.errorCode || details.code || details.error || row?.status, 80);
  const count = Number(row?.error_count ?? row?.errorCount ?? (row?.event_type === "agent_run_failed" ? 1 : 0));
  if (!module || !error || !Number.isFinite(count) || count < 1) return null;
  return { module, signal: error.toUpperCase().replace(/[^A-Z0-9_-]/g, "_"), count };
}

export function buildImprovementProposals(rows) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : []) {
    const item = failureSignal(row);
    if (!item) continue;
    const key = item.module + "::" + item.signal;
    const current = grouped.get(key) || { module: item.module, signal: item.signal, evidenceCount: 0 };
    current.evidenceCount += item.count;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .filter(item => item.evidenceCount >= MIN_REPEAT_COUNT)
    .sort((a, b) => b.evidenceCount - a.evidenceCount || a.module.localeCompare(b.module) || a.signal.localeCompare(b.signal))
    .slice(0, MAX_PROPOSALS)
    .map(item => ({
      id: item.module + ":" + item.signal,
      module: item.module,
      signal: item.signal,
      evidenceCount: item.evidenceCount,
      action: "review_and_test",
      requiresOwnerApproval: true,
      upgradeExecution: false
    }));
}

async function ensureImprovementSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS continuous_improvement_audit (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    proposal_count INTEGER NOT NULL,
    evidence_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    details_json TEXT NOT NULL
  )`).run();
}

export async function runContinuousImprovementCycle(env = {}) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return { ok: false, status: "blocked", reason: "D1_UNAVAILABLE", proposalCount: 0, upgradeExecution: false };
  }
  const now = new Date().toISOString();
  try {
    await ensureImprovementSchema(env.DB);
    const result = await env.DB.prepare(
      "SELECT agent_id, status, error_count, started_at, completed_at, details_json FROM agent_run_audit WHERE error_count > 0 ORDER BY completed_at DESC LIMIT ?"
    ).bind(MAX_ROWS).all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    const proposals = buildImprovementProposals(rows);
    const evidenceCount = rows.reduce((total, row) => total + Math.max(0, Number(row?.error_count) || 0), 0);
    const status = proposals.length ? "proposals-recorded" : "no-repeat-signal";
    await env.DB.prepare(
      "INSERT INTO continuous_improvement_audit (id, status, proposal_count, evidence_count, created_at, details_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), status, proposals.length, evidenceCount, now, JSON.stringify({
      proposals,
      source: "agent_run_audit",
      rowLimit: MAX_ROWS,
      maxProposals: MAX_PROPOSALS,
      action: "review_and_test",
      requiresOwnerApproval: true,
      upgradeExecution: false
    })).run();
    return { ok: true, status, proposalCount: proposals.length, evidenceCount, proposals, upgradeExecution: false };
  } catch {
    return { ok: false, status: "degraded", reason: "IMPROVEMENT_CYCLE_STORAGE_FAILED", proposalCount: 0, upgradeExecution: false };
  }
}
