const APPROVAL_PHRASE = "APPROVE THIS EXACT KNOWLEDGE QUERY";
const MAX_QUERY_LENGTH = 400;
const MAX_RESULTS = 5;
const MAX_TASKS_PER_TICK = 3;

export function normalizeKnowledgeQuery(value) {
  if (typeof value !== "string") return "";
  const query = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return query.length > 0 && query.length <= MAX_QUERY_LENGTH ? query : "";
}

export function validateKnowledgeApproval(query, approval) {
  return Boolean(
    query &&
    approval &&
    approval.approved === true &&
    approval.action === "knowledge_search" &&
    approval.query === query &&
    approval.confirmation === APPROVAL_PHRASE &&
    typeof approval.nonce === "string" &&
    /^[a-f0-9-]{36}$/i.test(approval.nonce)
  );
}

export async function ensureTaskSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_tasks (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action = 'knowledge_search'),
    query TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
    owner_approved INTEGER NOT NULL CHECK (owner_approved = 1),
    approval_nonce TEXT NOT NULL UNIQUE,
    approval_scope TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    result_json TEXT,
    error_code TEXT,
    attempts INTEGER NOT NULL DEFAULT 0
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_audit (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    action TEXT NOT NULL,
    scope TEXT NOT NULL,
    created_at TEXT NOT NULL,
    details_json TEXT NOT NULL
  )`).run();
}

function auditStatement(db, taskId, eventType, scope, details, now) {
  return db.prepare("INSERT INTO knowledge_audit (id, task_id, event_type, action, scope, created_at, details_json) VALUES (?, ?, ?, 'knowledge_search', ?, ?, ?)")
    .bind(crypto.randomUUID(), taskId, eventType, scope, now, JSON.stringify(details));
}

export async function enqueueKnowledgeTask(env, query, approval) {
  const normalized = normalizeKnowledgeQuery(query);
  if (!normalized) return { ok: false, status: 400, error: "query must contain 1–400 characters." };
  if (!validateKnowledgeApproval(normalized, approval)) {
    return { ok: false, status: 403, error: "Explicit owner approval for this exact query is required. No task was queued." };
  }
  if (!env.DB || typeof env.DB.batch !== "function") {
    return { ok: false, status: 503, error: "Durable queue storage is unavailable. No task was queued." };
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const scope = "knowledge_search:" + normalized;
  try {
    await ensureTaskSchema(env.DB);
    const insert = env.DB.prepare("INSERT INTO knowledge_tasks (id, action, query, status, owner_approved, approval_nonce, approval_scope, created_at, updated_at) VALUES (?, 'knowledge_search', ?, 'queued', 1, ?, ?, ?, ?)")
      .bind(id, normalized, approval.nonce, scope, now, now);
    await env.DB.batch([
      insert,
      auditStatement(env.DB, id, "owner_approved_and_queued", scope, { approvalConsumed: true }, now)
    ]);
    return { ok: true, status: 201, task: { id, action: "knowledge_search", query: normalized, status: "queued", ownerApproved: true, createdAt: now } };
  } catch (error) {
    // A duplicate nonce is a replay; do not create another task.
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return { ok: false, status: 409, error: "This approval nonce has already been used. Create a new explicit approval for a new task." };
    }
    console.error("knowledge_task_enqueue_failed", { errorName: typeof error?.name === "string" ? error.name : "Error" });
    return { ok: false, status: 503, error: "Unable to persist task and audit record. No task was accepted." };
  }
}

export async function listKnowledgeTasks(db, limit = 20) {
  await ensureTaskSchema(db);
  const result = await db.prepare("SELECT id, action, query, status, owner_approved AS ownerApproved, created_at AS createdAt, updated_at AS updatedAt, started_at AS startedAt, completed_at AS completedAt, error_code AS errorCode, attempts FROM knowledge_tasks ORDER BY created_at DESC LIMIT ?")
    .bind(Math.max(1, Math.min(50, limit))).all();
  return result?.results || [];
}

export async function getKnowledgeResults(db, id, limit = 20) {
  await ensureTaskSchema(db);
  if (id) {
    const row = await db.prepare("SELECT id, status, result_json AS resultJson, error_code AS errorCode, completed_at AS completedAt FROM knowledge_tasks WHERE id = ?")
      .bind(id).first();
    if (!row) return null;
    return { ...row, result: row.resultJson ? JSON.parse(row.resultJson) : null, resultJson: undefined };
  }
  const result = await db.prepare("SELECT id, status, result_json AS resultJson, error_code AS errorCode, completed_at AS completedAt FROM knowledge_tasks WHERE status IN ('completed','failed') ORDER BY completed_at DESC LIMIT ?")
    .bind(Math.max(1, Math.min(50, limit))).all();
  return (result?.results || []).map(row => ({
    ...row,
    result: row.resultJson ? JSON.parse(row.resultJson) : null,
    resultJson: undefined
  }));
}

async function writeTaskAudit(db, taskId, eventType, scope, details, now) {
  await db.prepare("INSERT INTO knowledge_audit (id, task_id, event_type, action, scope, created_at, details_json) VALUES (?, ?, ?, 'knowledge_search', ?, ?, ?)")
    .bind(crypto.randomUUID(), taskId, eventType, scope, now, JSON.stringify(details)).run();
}

export async function processApprovedKnowledgeTasks(env, limit = MAX_TASKS_PER_TICK) {
  if (!env.DB || !env.SEARCH_API_KEY) return { processed: 0, blocked: true, reason: !env.DB ? "D1 unavailable" : "Tavily key unavailable" };
  await ensureTaskSchema(env.DB);
  const pending = await env.DB.prepare("SELECT id, query, approval_scope FROM knowledge_tasks WHERE status = 'queued' AND owner_approved = 1 ORDER BY created_at ASC LIMIT ?")
    .bind(Math.max(1, Math.min(MAX_TASKS_PER_TICK, limit))).all();
  let processed = 0;
  for (const task of pending?.results || []) {
    const startedAt = new Date().toISOString();
    const claim = await env.DB.prepare("UPDATE knowledge_tasks SET status = 'running', started_at = ?, updated_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued' AND owner_approved = 1")
      .bind(startedAt, startedAt, task.id).run();
    if (!claim?.meta || claim.meta.changes !== 1) continue;
    await writeTaskAudit(env.DB, task.id, "approved_task_started", task.approval_scope, { scheduler: "cron", ownerApprovalRequired: true }, startedAt);
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { authorization: "Bearer " + env.SEARCH_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query: task.query, search_depth: "basic", max_results: MAX_RESULTS, include_answer: false, include_raw_content: false }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error("TAVILY_HTTP_" + response.status);
      const payload = await response.json();
      const sources = Array.isArray(payload?.results) ? payload.results.slice(0, MAX_RESULTS).map(item => ({
        title: typeof item?.title === "string" ? item.title.slice(0, 300) : "",
        url: typeof item?.url === "string" && /^https?:\/\//i.test(item.url) ? item.url : "",
        content: typeof item?.content === "string" ? item.content.slice(0, 2000) : "",
        publishedDate: typeof item?.published_date === "string" ? item.published_date.slice(0, 80) : null
      })).filter(item => item.url) : [];
      const completedAt = new Date().toISOString();
      const result = { provider: "tavily", query: task.query, fetchedAt: completedAt, sourceCount: sources.length, sources };
      await env.DB.prepare("UPDATE knowledge_tasks SET status = 'completed', result_json = ?, completed_at = ?, updated_at = ?, error_code = NULL WHERE id = ? AND status = 'running'")
        .bind(JSON.stringify(result), completedAt, completedAt, task.id).run();
      await writeTaskAudit(env.DB, task.id, "approved_task_completed", task.approval_scope, { provider: "tavily", sourceCount: sources.length }, completedAt);
      processed++;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errorCode = String(error?.message || "").startsWith("TAVILY_HTTP_") ? String(error.message) : "KNOWLEDGE_FETCH_FAILED";
      await env.DB.prepare("UPDATE knowledge_tasks SET status = 'failed', error_code = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'running'")
        .bind(errorCode, completedAt, completedAt, task.id).run();
      await writeTaskAudit(env.DB, task.id, "approved_task_failed", task.approval_scope, { errorCode }, completedAt);
      processed++;
    }
  }
  return { processed, blocked: false };
}

export const OWNER_APPROVAL_PHRASE = APPROVAL_PHRASE;
