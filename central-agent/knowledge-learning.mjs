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
      status: "verified"
    }
  };
}

export async function ensureLearningSchema(db) {
  if (!db || typeof db.prepare !== "function") throw new Error("LEARNING_STORAGE_UNAVAILABLE");
  await db.prepare(`CREATE TABLE IF NOT EXISTS verified_knowledge (
    id TEXT PRIMARY KEY,
    owner_scope TEXT NOT NULL CHECK (owner_scope = 'owner'),
    title TEXT NOT NULL,
    problem TEXT NOT NULL,
    solution TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    test_summary TEXT NOT NULL,
    test_evidence_json TEXT NOT NULL,
    confidence REAL NOT NULL,
    limitations TEXT NOT NULL,
    reuse_instructions TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status = 'verified'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_verified_knowledge_owner_updated ON verified_knowledge(owner_scope, updated_at DESC)").run();
}

export async function saveVerifiedKnowledge(db, input) {
  const normalized = normalizeVerifiedKnowledge(input);
  if (!normalized.ok) return normalized;
  if (!db || typeof db.prepare !== "function") return { ok: false, error: "LEARNING_STORAGE_UNAVAILABLE" };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await ensureLearningSchema(db);
    await db.prepare(`INSERT INTO verified_knowledge
      (id, owner_scope, title, problem, solution, sources_json, test_summary, test_evidence_json, confidence, limitations, reuse_instructions, status, created_at, updated_at)
      VALUES (?, 'owner', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?)`)
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
    await ensureLearningSchema(db);
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
    return { ok: true, records };
  } catch {
    return { ok: false, error: "LEARNING_SEARCH_FAILED" };
  }
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
