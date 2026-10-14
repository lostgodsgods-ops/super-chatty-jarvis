const OWNER_ID = 1;
const TASK_TYPES = new Set(["read_only_research", "code_review"]);
const MAX_TASK_PAYLOAD = 12_000;
const MAX_RESULT_PAYLOAD = 8_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

export function isModuleRoute(method, path) {
  if (path === "/tasks" && ["GET", "POST"].includes(method)) return true;
  if (path === "/results" && ["GET", "POST"].includes(method)) return true;
  if (path === "/memory" && ["GET", "POST"].includes(method)) return true;
  if (path === "/audit" && method === "GET") return true;
  if (path.startsWith("/memory/") && method === "DELETE") return true;
  if (/^\/tasks\/[a-f0-9-]+\/approve$/i.test(path) && method === "POST") return true;
  return false;
}

async function readBody(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16_000) throw new Error("Request too large");
  return JSON.parse(raw);
}

async function writeAudit(env, action, resourceType, resourceId, detail = {}) {
  const detailJson = JSON.stringify(detail);
  await env.DB.prepare(
    "INSERT INTO owner_audit_log (id, owner_id, action, resource_type, resource_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(newId(), OWNER_ID, action, resourceType, resourceId || null, detailJson, nowIso()).run();
}

function requireOwner(session) {
  return session?.ownerId === OWNER_ID;
}

async function listTasks(env) {
  const result = await env.DB.prepare(
    "SELECT id, task_type, status, created_at, updated_at FROM owner_tasks WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(OWNER_ID).all();
  return (result.results || []).map((row) => ({
    id: row.id, taskType: row.task_type, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

async function createTask(request, env, session) {
  if (!requireOwner(session)) return json({ error: "Owner authentication required" }, 401);
  const body = await readBody(request);
  if (!TASK_TYPES.has(body?.taskType)) return json({ error: "Unsupported task type" }, 400);
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return json({ error: "Task payload must be an object" }, 400);
  const payloadJson = JSON.stringify(body.payload);
  if (payloadJson.length > MAX_TASK_PAYLOAD) return json({ error: "Task payload too large" }, 413);
  const id = newId();
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO owner_tasks (id, owner_id, task_type, payload_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending_approval', ?, ?)")
      .bind(id, OWNER_ID, body.taskType, payloadJson, now, now),
    env.DB.prepare("INSERT INTO owner_audit_log (id, owner_id, action, resource_type, resource_id, detail_json, created_at) VALUES (?, ?, 'task.created', 'task', ?, ?, ?)")
      .bind(newId(), OWNER_ID, id, JSON.stringify({ taskType: body.taskType, status: "pending_approval" }), now),
  ]);
  return json({ task: { id, taskType: body.taskType, status: "pending_approval", createdAt: now, updatedAt: now } }, 201);
}

async function approveTask(env, path, session) {
  if (!requireOwner(session)) return json({ error: "Owner authentication required" }, 401);
  const id = path.match(/^\/tasks\/([a-f0-9-]+)\/approve$/i)?.[1];
  if (!id) return json({ error: "Invalid task id" }, 400);
  const current = await env.DB.prepare("SELECT id, task_type, status FROM owner_tasks WHERE id = ? AND owner_id = ?").bind(id, OWNER_ID).first();
  if (!current) return json({ error: "Task not found" }, 404);
  if (current.status !== "pending_approval") return json({ error: "Task is not awaiting approval" }, 409);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE owner_tasks SET status = 'queued', updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'pending_approval'").bind(now, id, OWNER_ID),
    env.DB.prepare("INSERT INTO owner_audit_log (id, owner_id, action, resource_type, resource_id, detail_json, created_at) VALUES (?, ?, 'task.approved', 'task', ?, ?, ?)")
      .bind(newId(), OWNER_ID, id, JSON.stringify({ taskType: current.task_type, status: "queued" }), now),
  ]);
  return json({ task: { id, taskType: current.task_type, status: "queued", updatedAt: now } });
}

async function getResults(request, env, session) {
  if (!requireOwner(session)) return json({ error: "Owner authentication required" }, 401);
  const taskId = new URL(request.url).searchParams.get("taskId");
  let result;
  if (taskId) {
    const owned = await env.DB.prepare("SELECT id FROM owner_tasks WHERE id = ? AND owner_id = ?").bind(taskId, OWNER_ID).first();
    if (!owned) return json({ error: "Task not found" }, 404);
    result = await env.DB.prepare("SELECT id, task_id, result_json, created_at FROM owner_task_results WHERE task_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 50").bind(taskId, OWNER_ID).all();
  } else {
    result = await env.DB.prepare("SELECT id, task_id, result_json, created_at FROM owner_task_results WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50").bind(OWNER_ID).all();
  }
  return json({ results: (result.results || []).map((row) => {
    let value = null;
    try { value = JSON.parse(row.result_json); } catch { value = { error: "Stored result is invalid" }; }
    return { id: row.id, taskId: row.task_id, result: value, createdAt: row.created_at };
  }) });
}

async function submitResult(request, env) {
  if (!env.AGENT_GATEWAY_TOKEN) return json({ error: "Agent result submission is disabled until gateway authentication is configured" }, 503);
  const supplied = request.headers.get("x-agent-gateway-token") || "";
  if (supplied.length !== env.AGENT_GATEWAY_TOKEN.length || supplied !== env.AGENT_GATEWAY_TOKEN) return json({ error: "Agent gateway authorization failed" }, 401);
  const body = await readBody(request);
  if (typeof body?.taskId !== "string" || !body.taskId || !body.result || typeof body.result !== "object" || Array.isArray(body.result)) return json({ error: "taskId and result object are required" }, 400);
  const resultJson = JSON.stringify(body.result);
  if (resultJson.length > MAX_RESULT_PAYLOAD) return json({ error: "Result payload too large" }, 413);
  const task = await env.DB.prepare("SELECT id, task_type, status FROM owner_tasks WHERE id = ? AND owner_id = ?").bind(body.taskId, OWNER_ID).first();
  if (!task) return json({ error: "Task not found" }, 404);
  if (!["queued", "running"].includes(task.status)) return json({ error: "Task is not available for result submission" }, 409);
  const id = newId();
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO owner_task_results (id, task_id, owner_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, task.id, OWNER_ID, resultJson, now),
    env.DB.prepare("UPDATE owner_tasks SET status = 'completed', updated_at = ? WHERE id = ? AND owner_id = ? AND status IN ('queued', 'running')").bind(now, task.id, OWNER_ID),
    env.DB.prepare("INSERT INTO owner_audit_log (id, owner_id, action, resource_type, resource_id, detail_json, created_at) VALUES (?, ?, 'task.result_submitted', 'task', ?, ?, ?)").bind(newId(), OWNER_ID, task.id, JSON.stringify({ taskType: task.task_type, status: "completed" }), now),
  ]);
  return json({ accepted: true, taskId: task.id, resultId: id }, 201);
}

async function memoryRoute(request, env, path, session) {
  if (!requireOwner(session)) return json({ error: "Owner authentication required" }, 401);
  if (request.method === "GET") {
    const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 120);
    const rows = query
      ? await env.DB.prepare("SELECT id, content, tags_json, created_at, updated_at FROM owner_memory WHERE owner_id = ? AND instr(lower(content), lower(?)) > 0 ORDER BY updated_at DESC LIMIT 20").bind(OWNER_ID, query).all()
      : await env.DB.prepare("SELECT id, content, tags_json, created_at, updated_at FROM owner_memory WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50").bind(OWNER_ID).all();
    return json({ memories: (rows.results || []).map((row) => ({ id: row.id, content: row.content, tags: safeTags(row.tags_json), createdAt: row.created_at, updatedAt: row.updated_at })) });
  }
  if (request.method === "POST" && path === "/memory") {
    const body = await readBody(request);
    if (typeof body?.content !== "string" || !body.content.trim() || body.content.length > 4000) return json({ error: "Memory content must contain 1-4000 characters" }, 400);
    const tags = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().slice(0, 32)).filter(Boolean).slice(0, 8) : [];
    const id = newId();
    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO owner_memory (id, owner_id, content, tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, OWNER_ID, body.content.trim(), JSON.stringify(tags), now, now),
      env.DB.prepare("INSERT INTO owner_audit_log (id, owner_id, action, resource_type, resource_id, detail_json, created_at) VALUES (?, ?, 'memory.created', 'memory', ?, ?, ?)").bind(newId(), OWNER_ID, id, JSON.stringify({ length: body.content.trim().length, tagCount: tags.length }), now),
    ]);
    return json({ memory: { id, content: body.content.trim(), tags, createdAt: now, updatedAt: now } }, 201);
  }
  if (request.method === "DELETE" && path.startsWith("/memory/")) {
    const id = decodeURIComponent(path.slice("/memory/".length));
    if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: "Invalid memory id" }, 400);
    const existing = await env.DB.prepare("SELECT id FROM owner_memory WHERE id = ? AND owner_id = ?").bind(id, OWNER_ID).first();
    if (!existing) return json({ error: "Memory not found" }, 404);
    const now = nowIso();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM owner_memory WHERE id = ? AND owner_id = ?").bind(id, OWNER_ID),
      env.DB.prepare("INSERT INTO owner_audit_log (id, owner_id, action, resource_type, resource_id, detail_json, created_at) VALUES (?, ?, 'memory.deleted', 'memory', ?, '{}', ?)").bind(newId(), OWNER_ID, id, now),
    ]);
    return json({ deleted: true, id });
  }
  return json({ error: "Not found" }, 404);
}

async function auditRoute(request, env, session) {
  if (!requireOwner(session)) return json({ error: "Owner authentication required" }, 401);
  const requested = Number(new URL(request.url).searchParams.get("limit") || 50);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 100)) : 50;
  const rows = await env.DB.prepare("SELECT id, action, resource_type, resource_id, detail_json, created_at FROM owner_audit_log WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?").bind(OWNER_ID, limit).all();
  return json({ events: (rows.results || []).map((row) => {
    let detail = {};
    try { detail = JSON.parse(row.detail_json || "{}"); } catch { detail = { error: "Invalid audit detail" }; }
    return { id: row.id, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id, detail, createdAt: row.created_at };
  }) });
}

function safeTags(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export async function handleModuleRoute(request, env, path, session) {
  if (!isModuleRoute(request.method, path)) return null;
  if (path === "/tasks" && request.method === "GET") {
    if (!requireOwner(session)) return json({ error: "Owner authentication required" }, 401);
    return json({ tasks: await listTasks(env) });
  }
  if (path === "/tasks" && request.method === "POST") return createTask(request, env, session);
  if (/^\/tasks\/[a-f0-9-]+\/approve$/i.test(path) && request.method === "POST") return approveTask(env, path, session);
  if (path === "/results" && request.method === "GET") return getResults(request, env, session);
  if (path === "/results" && request.method === "POST") return submitResult(request, env);
  if (path === "/memory" || path.startsWith("/memory/")) return memoryRoute(request, env, path, session);
  if (path === "/audit" && request.method === "GET") return auditRoute(request, env, session);
  return json({ error: "Not found" }, 404);
}
