import { rankVerifiedKnowledge } from "./neural-memory-ranker.mjs";

const MAX_TEXT = 6000;
const MAX_SOURCES = 12;
const MAX_LIMIT = 20;
const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,;]+/gi
];

function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== "string") return "";
  let text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text.slice(0, max);
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const sources = [];
  for (const item of value.slice(0, MAX_SOURCES)) {
    const title = cleanText(item?.title, 240);
    let url;
    try {
      const parsed = new URL(item?.url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) continue;
      url = parsed.toString();
    } catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: title || url, url, accessedAt: cleanText(item?.accessedAt, 40) || null });
  }
  return sources;
}

export function normalizeVerifiedKnowledge(input) {
  const title = cleanText(input?.title, 240);
  const problem = cleanText(input?.problem);
  const solution = cleanText(input?.solution);
  const testSummary = cleanText(input?.testSummary, 1200);
  const sources = normalizeSources(input?.sources);
  const testEvidence = Array.isArray(input?.testEvidence)
    ? input.testEvidence.slice(0, 20).map(item => cleanText(item, 300)).filter(Boolean)
    : [];
  if (!title || !problem || !solution) return { ok: false, error: "TITLE_PROBLEM_SOLUTION_REQUIRED" };
  if (input?.testsPassed !== true || !testSummary || testEvidence.length === 0) {
    return { ok: false, error: "VERIFIED_TEST_EVIDENCE_REQUIRED" };
  }
  if (sources.length === 0) return { ok: false, error: "HTTPS_SOURCE_REQUIRED" };
  return {
    ok: true,
    record: {
      title, problem, solution, sources, testSummary, testEvidence,
      confidence: Math.max(0, Math.min(1, Number.isFinite(input?.confidence) ? input.confidence : 0.5)),
      limitations: cleanText(input?.limitations, 1200),
      reuseInstructions: cleanText(input?.reuseInstructions, 1200),
      status: "pending_owner_verification",
      verified: false
    }
  };
}

export async function saveVerifiedKnowledge(db, input) {
  const normalized = normalizeVerifiedKnowledge(input);
  if (!normalized.ok) return normalized;
  if (!db || typeof db.prepare !== "function") return { ok: false, error: "LEARNING_STORAGE_UNAVAILABLE" };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO pending_knowledge
      (id, owner_scope, title, problem, solution, sources_json, test_summary, test_evidence_json, confidence, limitations, reuse_instructions, status, created_at, updated_at)
      VALUES (?, 'owner', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_owner_verification', ?, ?)`)
      .bind(id, normalized.record.title, normalized.record.problem, normalized.record.solution,
        JSON.stringify(normalized.record.sources), normalized.record.testSummary,
        JSON.stringify(normalized.record.testEvidence), normalized.record.confidence,
        normalized.record.limitations, normalized.record.reuseInstructions, now, now).run();
    return { ok: true, record: { id, ...normalized.record, createdAt: now, updatedAt: now } };
  } catch {
    return { ok: false, error: "LEARNING_PERSIST_FAILED" };
  }
}

export async function searchVerifiedKnowledge(db, query, limit = 10) {
  const normalizedQuery = cleanText(query, 200);
  if (!normalizedQuery) return { ok: false, error: "QUERY_REQUIRED" };
  if (!db || typeof db.prepare !== "function") return { ok: false, error: "LEARNING_STORAGE_UNAVAILABLE" };
  try {
    const terms = normalizedQuery.split(" ").filter(Boolean).slice(0, 6);
    const where = terms.map(() => "(title LIKE ? OR problem LIKE ? OR solution LIKE ?)").join(" AND ");
    const args = [];
    for (const term of terms) args.push("%" + term.slice(0, 60) + "%", "%" + term.slice(0, 60) + "%", "%" + term.slice(0, 60) + "%");
    args.push(Math.max(1, Math.min(MAX_LIMIT, Number(limit) || 10)));
    const result = await db.prepare(`SELECT id, title, problem, solution, sources_json AS sourcesJson, test_summary AS testSummary, test_evidence_json AS testEvidenceJson, confidence, limitations, reuse_instructions AS reuseInstructions, status, created_at AS createdAt, updated_at AS updatedAt FROM verified_knowledge WHERE owner_scope = 'owner' AND status = 'verified' AND ${where} ORDER BY updated_at DESC LIMIT ?`).bind(...args).all();
    const records = (result?.results || []).map(row => ({
      id: row.id, title: row.title, problem: row.problem, solution: row.solution,
      sources: safeJson(row.sourcesJson, []), testSummary: row.testSummary,
      testEvidence: safeJson(row.testEvidenceJson, []), confidence: row.confidence,
      limitations: row.limitations, reuseInstructions: row.reuseInstructions,
      status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt
    }));
    return { ok: true, records: rankVerifiedKnowledge(records, normalizedQuery).slice(0, Math.max(1, Math.min(MAX_LIMIT, Number(limit) || 10))) };
  } catch {
    return { ok: false, error: "LEARNING_SEARCH_FAILED" };
  }
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}


/**
 * Promote exactly one pending record after a separately authenticated owner
 * explicitly confirms the approval phrase. This function is not an auth system:
 * callers must derive ownerAuthenticated from the owner session, never a bridge token.
 */
export async function approvePendingKnowledge(db, recordId, approval = {}) {
  if (approval?.ownerAuthenticated !== true || approval?.approvalPhrase !== "APPROVE_KNOWLEDGE") {
    return { ok: false, error: "OWNER_APPROVAL_REQUIRED" };
  }
  const id = typeof recordId === "string" ? recordId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return { ok: false, error: "INVALID_RECORD_ID" };
  if (!db || typeof db.prepare !== "function") return { ok: false, error: "LEARNING_STORAGE_UNAVAILABLE" };

  try {
    const pending = await db.prepare(`SELECT id, title, problem, solution, sources_json AS sourcesJson,
      test_summary AS testSummary, test_evidence_json AS testEvidenceJson, confidence,
      limitations, reuse_instructions AS reuseInstructions, created_at AS createdAt
      FROM pending_knowledge WHERE id = ? AND owner_scope = 'owner'
      AND status = 'pending_owner_verification' LIMIT 1`).bind(id).first();
    if (!pending) return { ok: false, error: "PENDING_KNOWLEDGE_NOT_FOUND" };

    const now = new Date().toISOString();
    const inserted = await db.prepare(`INSERT OR IGNORE INTO verified_knowledge
      (id, owner_scope, title, problem, solution, sources_json, test_summary, test_evidence_json,
       confidence, limitations, reuse_instructions, status, created_at, updated_at)
      SELECT id, 'owner', title, problem, solution, sources_json, test_summary, test_evidence_json,
       confidence, limitations, reuse_instructions, 'verified', created_at, ?
      FROM pending_knowledge WHERE id = ? AND owner_scope = 'owner'
      AND status = 'pending_owner_verification'`).bind(now, id).run();
    if (Number(inserted?.meta?.changes || 0) !== 1) {
      return { ok: false, error: "PENDING_KNOWLEDGE_NOT_FOUND_OR_ALREADY_PROMOTED" };
    }
    const removed = await db.prepare(`DELETE FROM pending_knowledge
      WHERE id = ? AND owner_scope = 'owner' AND status = 'pending_owner_verification'`).bind(id).run();
    if (Number(removed?.meta?.changes || 0) !== 1) {
      return { ok: false, error: "PENDING_CLEANUP_FAILED" };
    }
    return {
      ok: true,
      record: {
        id: pending.id, title: pending.title, problem: pending.problem, solution: pending.solution,
        sources: safeJson(pending.sourcesJson, []), testSummary: pending.testSummary,
        testEvidence: safeJson(pending.testEvidenceJson, []), confidence: pending.confidence,
        limitations: pending.limitations, reuseInstructions: pending.reuseInstructions,
        status: "verified", verified: true, createdAt: pending.createdAt, updatedAt: now
      }
    };
  } catch {
    return { ok: false, error: "LEARNING_PROMOTION_FAILED" };
  }
}
