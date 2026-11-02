const STATUSES = new Set([
  "PLANNED", "QUEUED", "RUNNING", "VERIFYING",
  "SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"
]);
const TRANSITIONS = Object.freeze({
  PLANNED: new Set(["QUEUED", "BLOCKED", "CANCELLED"]),
  QUEUED: new Set(["RUNNING", "BLOCKED", "CANCELLED"]),
  RUNNING: new Set(["VERIFYING", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"]),
  VERIFYING: new Set(["SUCCEEDED", "FAILED", "BLOCKED"])
});
const TASK_TYPES = new Set(["question", "research", "coding", "planning", "action"]);
const MAX_EVIDENCE_REFS = 20;

export class BrainTaskStoreError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "BrainTaskStoreError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new BrainTaskStoreError(code, status);
}

function cleanText(value, max, code) {
  if (typeof value !== "string") fail(code);
  const result = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!result || result.length > max) fail(code);
  return result;
}

function safeId(value, code) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail(code);
  return value;
}

function safeEvidence(value) {
  return typeof value === "string" &&
    /^(workflow|commit|pr|test|http|file|request):[A-Za-z0-9._/#:-]{1,180}$/.test(value);
}

function normalizeForStorage(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan) ||
      plan.status !== "PLANNED" || !TASK_TYPES.has(plan.taskType) ||
      !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) {
    fail("BRAIN_TASK_PLAN_INVALID");
  }
  const taskId = safeId(plan.taskId, "BRAIN_TASK_ID_INVALID");
  const goal = cleanText(plan.goal, 500, "BRAIN_TASK_PLAN_INVALID");
  const steps = plan.steps.map(step => {
    if (!step || typeof step !== "object" || Array.isArray(step)) fail("BRAIN_TASK_PLAN_INVALID");
    const id = cleanText(step.id, 40, "BRAIN_TASK_PLAN_INVALID");
    const description = cleanText(step.description, 1000, "BRAIN_TASK_PLAN_INVALID");
    const capability = cleanText(step.capability, 64, "BRAIN_TASK_PLAN_INVALID");
    if (!Array.isArray(step.dependsOn) || step.dependsOn.length > 8 ||
        !Array.isArray(step.acceptanceCriteria) || step.acceptanceCriteria.length < 1 ||
        step.acceptanceCriteria.length > 8) fail("BRAIN_TASK_PLAN_INVALID");
    return {
      id, description, capability,
      dependsOn: step.dependsOn.map(value => cleanText(value, 40, "BRAIN_TASK_PLAN_INVALID")),
      acceptanceCriteria: step.acceptanceCriteria.map(value => cleanText(value, 300, "BRAIN_TASK_PLAN_INVALID"))
    };
  });
  const permissions = Array.isArray(plan.permissions) ? plan.permissions.slice(0, 12).map(item => {
    if (!item || typeof item !== "object") fail("BRAIN_TASK_PLAN_INVALID");
    return { capability: cleanText(item.capability, 64, "BRAIN_TASK_PLAN_INVALID"), approved: false };
  }) : [];
  const route = plan.modelRoute && typeof plan.modelRoute === "object" ? plan.modelRoute : {};
  const provider = typeof route.provider === "string" ? route.provider.slice(0, 64) : null;
  const model = typeof route.model === "string" ? route.model.slice(0, 160) : null;
  const createdAt = typeof plan.createdAt === "string" && Number.isFinite(Date.parse(plan.createdAt))
    ? plan.createdAt : new Date().toISOString();
  const updatedAt = typeof plan.updatedAt === "string" && Number.isFinite(Date.parse(plan.updatedAt))
    ? plan.updatedAt : createdAt;
  const evidence = Array.isArray(plan.evidence) ? plan.evidence : [];
  if (evidence.length > MAX_EVIDENCE_REFS || evidence.some(item => !safeEvidence(item))) {
    fail("BRAIN_TASK_EVIDENCE_INVALID");
  }
  return {
    taskId, status: "PLANNED", goal, taskType: plan.taskType, steps, permissions,
    modelRoute: { provider, model }, verification: [], evidence: [...evidence],
    createdAt, updatedAt
  };
}

function parseJson(value, fallback, code) {
  try { return JSON.parse(value); } catch { fail(code); }
}

function mapEvent(row) {
  return {
    eventId: row.event_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    eventType: row.event_type,
    evidenceRefs: parseJson(row.evidence_refs_json, [], "BRAIN_TASK_STORAGE_CORRUPT"),
    errorCode: row.error_code || null,
    createdAt: row.created_at
  };
}

export function createBrainTaskStore(db, options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const id = typeof options.id === "function" ? options.id : () => crypto.randomUUID();

  function requireDb() {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      fail("BRAIN_TASK_STORAGE_UNAVAILABLE", 503);
    }
  }

  async function get(taskId) {
    requireDb();
    safeId(taskId, "BRAIN_TASK_ID_INVALID");
    const row = await db.prepare(
      "SELECT task_id, schema_version, status, goal, task_type, plan_json, provider_id, model_id, error_code, created_at, updated_at FROM neural_brain_tasks WHERE task_id = ?"
    ).bind(taskId).first();
    if (!row) return null;
    const events = await db.prepare(
      "SELECT event_id, from_status, to_status, event_type, evidence_refs_json, error_code, created_at FROM neural_brain_task_events WHERE task_id = ? ORDER BY created_at, event_id"
    ).bind(taskId).all();
    const plan = parseJson(row.plan_json, null, "BRAIN_TASK_STORAGE_CORRUPT");
    return {
      taskId: row.task_id,
      schemaVersion: row.schema_version,
      status: row.status,
      goal: row.goal,
      taskType: row.task_type,
      plan,
      provider: row.provider_id || null,
      model: row.model_id || null,
      errorCode: row.error_code || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      events: (events?.results || []).map(mapEvent)
    };
  }

  async function create(input) {
    requireDb();
    const plan = normalizeForStorage(input);
    const createdAt = now();
    const eventId = safeId(id(), "BRAIN_TASK_EVENT_ID_INVALID");
    const statements = [
      db.prepare(
        "INSERT INTO neural_brain_tasks (task_id, schema_version, status, goal, task_type, plan_json, provider_id, model_id, error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        plan.taskId, 1, "PLANNED", plan.goal, plan.taskType, JSON.stringify(plan),
        plan.modelRoute.provider, plan.modelRoute.model, null, plan.createdAt || createdAt, plan.updatedAt || createdAt
      ),
      db.prepare(
        "INSERT INTO neural_brain_task_events (event_id, task_id, from_status, to_status, event_type, evidence_refs_json, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(eventId, plan.taskId, null, "PLANNED", "brain.task.created", JSON.stringify(plan.evidence), null, createdAt)
    ];
    try {
      const result = await db.batch(statements);
      if (!Array.isArray(result) || result[0]?.meta?.changes !== 1) fail("BRAIN_TASK_CREATE_FAILED", 503);
    } catch (error) {
      if (error instanceof BrainTaskStoreError) throw error;
      if (/constraint|unique|primary key/i.test(String(error?.message || "")) || error?.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        fail("BRAIN_TASK_ALREADY_EXISTS", 409);
      }
      fail("BRAIN_TASK_STORAGE_UNAVAILABLE", 503);
    }
    return get(plan.taskId);
  }

  async function transition(taskId, nextStatus, metadata = {}) {
    requireDb();
    safeId(taskId, "BRAIN_TASK_ID_INVALID");
    if (!STATUSES.has(nextStatus)) fail("BRAIN_TASK_STATUS_INVALID");
    const current = await get(taskId);
    if (!current) fail("BRAIN_TASK_NOT_FOUND", 404);
    const expectedStatus = metadata.expectedStatus || current.status;
    if (expectedStatus !== current.status) fail("BRAIN_TASK_CONFLICT", 409);
    if (!TRANSITIONS[current.status]?.has(nextStatus)) fail("BRAIN_TASK_TRANSITION_INVALID", 409);

    const evidenceRefs = metadata.evidenceRefs === undefined ? [] : metadata.evidenceRefs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length > MAX_EVIDENCE_REFS || evidenceRefs.some(item => !safeEvidence(item))) {
      fail("BRAIN_TASK_EVIDENCE_INVALID");
    }
    const errorCode = metadata.errorCode === undefined || metadata.errorCode === null
      ? null
      : (typeof metadata.errorCode === "string" && /^[A-Z0-9_]{1,80}$/.test(metadata.errorCode) ? metadata.errorCode : fail("BRAIN_TASK_ERROR_CODE_INVALID"));
    const timestamp = now();
    const eventId = safeId(id(), "BRAIN_TASK_EVENT_ID_INVALID");
    const eventType = "brain.task." + nextStatus.toLowerCase();
    let result;
    try {
      result = await db.batch([
        db.prepare(
          "UPDATE neural_brain_tasks SET status = ?, error_code = ?, updated_at = ? WHERE task_id = ? AND status = ?"
        ).bind(nextStatus, errorCode, timestamp, taskId, expectedStatus),
        db.prepare(
          "INSERT INTO neural_brain_task_events (event_id, task_id, from_status, to_status, event_type, evidence_refs_json, error_code, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM neural_brain_tasks WHERE task_id = ? AND status = ? AND updated_at = ?)"
        ).bind(eventId, taskId, expectedStatus, nextStatus, eventType, JSON.stringify(evidenceRefs), errorCode, timestamp, taskId, nextStatus, timestamp)
      ]);
    } catch {
      fail("BRAIN_TASK_STORAGE_UNAVAILABLE", 503);
    }
    if (!Array.isArray(result) || result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) {
      fail("BRAIN_TASK_CONFLICT", 409);
    }
    return get(taskId);
  }

  return Object.freeze({ create, get, transition });
}
