const MAX_TITLE = 160;
const MAX_STEPS = 10;
const APPROVAL_PHRASE = "APPROVE THIS EXACT GOAL PLAN";
const ALLOWED_ACTIONS = new Set(["knowledge_search", "mcp_discovery", "vector_roundtrip"]);

export class GoalError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

function cleanText(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeGoalPlan(input) {
  const title = cleanText(input?.title, MAX_TITLE);
  if (!title) throw new GoalError("GOAL_TITLE_REQUIRED");
  if (!Array.isArray(input?.steps) || input.steps.length < 1 || input.steps.length > MAX_STEPS) throw new GoalError("GOAL_STEPS_MUST_BE_1_TO_10");
  const steps = input.steps.map((step, index) => {
    const action = cleanText(step?.action, 40);
    const description = cleanText(step?.description, 300);
    if (!ALLOWED_ACTIONS.has(action) || !description) throw new GoalError("INVALID_GOAL_STEP_" + index);
    return { index, action, description, status: "planned", result: null, errorCode: null };
  });
  const rollbackPlan = Array.isArray(input.rollbackPlan) ? input.rollbackPlan.slice(0, MAX_STEPS).map((item, index) => ({
    stepIndex: Number.isInteger(item?.stepIndex) && item.stepIndex >= 0 && item.stepIndex < steps.length ? item.stepIndex : index,
    compensation: cleanText(item?.compensation, 300),
    status: "not_required"
  })).filter(item => item.compensation) : [];
  return { title, steps, rollbackPlan };
}

export function validateGoalApproval(plan, approval) {
  return Boolean(approval && approval.approved === true &&
    approval.action === "goal_chain" &&
    approval.confirmation === APPROVAL_PHRASE &&
    approval.planDigest === plan &&
    typeof approval.nonce === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approval.nonce));
}

export async function ensureGoalSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL
      CHECK (status IN ('approved','running','completed','failed','rollback_requested','rolled_back','cancelled')),
    steps_json TEXT NOT NULL, rollback_json TEXT NOT NULL, approval_nonce TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, current_step INTEGER NOT NULL DEFAULT 0,
    error_code TEXT, version INTEGER NOT NULL DEFAULT 1
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS goal_audit (
    id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, event_type TEXT NOT NULL,
    created_at TEXT NOT NULL, details_json TEXT NOT NULL
  )`).run();
}

function audit(db, goalId, eventType, details, now) {
  return db.prepare("INSERT INTO goal_audit (id, goal_id, event_type, created_at, details_json) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), goalId, eventType, now, JSON.stringify(details));
}

export async function createGoal(env, input, approval) {
  if (!env.DB || typeof env.DB.batch !== "function") throw new GoalError("GOAL_STORAGE_UNAVAILABLE", 503);
  const plan = normalizeGoalPlan(input);
  const canonical = JSON.stringify({ title: plan.title, steps: plan.steps.map(({index, action, description}) => ({index, action, description})), rollbackPlan: plan.rollbackPlan.map(({stepIndex, compensation}) => ({stepIndex, compensation})) });
  if (!validateGoalApproval(canonical, approval)) throw new GoalError("EXPLICIT_APPROVAL_FOR_EXACT_GOAL_PLAN_REQUIRED", 403);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await ensureGoalSchema(env.DB);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO goals (id,title,status,steps_json,rollback_json,approval_nonce,created_at,updated_at,current_step,version) VALUES (?,?, 'approved', ?, ?, ?, ?, ?, 0, 1)")
        .bind(id, plan.title, JSON.stringify(plan.steps), JSON.stringify(plan.rollbackPlan), approval.nonce, now, now),
      audit(env.DB, id, "goal_plan_approved", { stepCount: plan.steps.length, rollbackActions: plan.rollbackPlan.length }, now)
    ]);
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) throw new GoalError("GOAL_APPROVAL_NONCE_REPLAY", 409);
    throw new GoalError("GOAL_CREATE_FAILED", 503);
  }
  return { id, title: plan.title, status: "approved", steps: plan.steps, rollbackPlan: plan.rollbackPlan, currentStep: 0, executionStarted: false, message: "Plan stored. No steps were executed." };
}

export async function listGoals(db, limit = 20) {
  if (!db) throw new GoalError("GOAL_STORAGE_UNAVAILABLE", 503);
  await ensureGoalSchema(db);
  const result = await db.prepare("SELECT id,title,status,steps_json AS stepsJson,rollback_json AS rollbackJson,created_at AS createdAt,updated_at AS updatedAt,current_step AS currentStep,error_code AS errorCode,version FROM goals ORDER BY created_at DESC LIMIT ?")
    .bind(Math.max(1, Math.min(50, Number(limit) || 20))).all();
  return (result?.results || []).map(row => ({ ...row, steps: JSON.parse(row.stepsJson), rollbackPlan: JSON.parse(row.rollbackJson), stepsJson: undefined, rollbackJson: undefined }));
}

/** Records a guarded lifecycle transition. This module never executes goal steps or compensating actions. */
export async function transitionGoal(env, id, target, details = {}) {
  if (!env.DB || typeof env.DB.batch !== "function") throw new GoalError("GOAL_STORAGE_UNAVAILABLE", 503);
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new GoalError("INVALID_GOAL_ID");
  const transitions = {
    approved: new Set(["running", "cancelled"]),
    running: new Set(["completed", "failed", "rollback_requested", "cancelled"]),
    failed: new Set(["rollback_requested", "cancelled"]),
    rollback_requested: new Set(["rolled_back", "failed"]),
    completed: new Set(["rollback_requested"]),
    rolled_back: new Set(),
    cancelled: new Set()
  };
  await ensureGoalSchema(env.DB);
  const row = await env.DB.prepare("SELECT id,status,steps_json AS stepsJson,rollback_json AS rollbackJson,current_step AS currentStep,version FROM goals WHERE id = ?").bind(id).first();
  if (!row) throw new GoalError("GOAL_NOT_FOUND", 404);
  if (!transitions[row.status]?.has(target)) throw new GoalError("INVALID_GOAL_TRANSITION:" + row.status + "_TO_" + target, 409);
  const steps = JSON.parse(row.stepsJson);
  if (target === "completed" && (details.completedStepCount !== steps.length || typeof details.evidenceRef !== "string" || !cleanText(details.evidenceRef, 300))) {
    throw new GoalError("COMPLETION_EVIDENCE_REQUIRED", 403);
  }
  if (target === "rolled_back" && (details.compensationVerified !== true || typeof details.evidenceRef !== "string" || !cleanText(details.evidenceRef, 300))) {
    throw new GoalError("ROLLBACK_EVIDENCE_REQUIRED", 403);
  }
  const now = new Date().toISOString();
  const rollback = target === "rollback_requested"
    ? JSON.stringify(JSON.parse(row.rollbackJson).map(item => ({ ...item, status: "pending_manual_compensation" })))
    : row.rollbackJson;
  const errorCode = target === "failed" ? cleanText(details.errorCode, 80) || "GOAL_STEP_FAILED" : null;
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE goals SET status = ?, rollback_json = ?, updated_at = ?, error_code = ?, version = version + 1 WHERE id = ? AND status = ? AND version = ?")
      .bind(target, rollback, now, errorCode, id, row.status, row.version),
    env.DB.prepare("INSERT INTO goal_audit (id, goal_id, event_type, created_at, details_json) SELECT ?, ?, 'status_transition', ?, ? WHERE EXISTS (SELECT 1 FROM goals WHERE id = ? AND status = ? AND version = ?)")
      .bind(crypto.randomUUID(), id, now, JSON.stringify({ from: row.status, to: target, executionPerformed: false, evidenceRef: typeof details.evidenceRef === "string" ? cleanText(details.evidenceRef, 300) : null }), id, target, row.version + 1)
  ]);
  if (!results?.[0]?.meta || results[0].meta.changes !== 1 || !results?.[1]?.meta || results[1].meta.changes !== 1) {
    throw new GoalError("GOAL_CONCURRENT_UPDATE_OR_AUDIT_FAILURE", 409);
  }
  if (target === "rollback_requested") {
    return { id, status: target, rollbackPlan: JSON.parse(rollback), compensationExecuted: false, message: "Rollback requested; compensating actions are recorded only and require a separately approved executor." };
  }
  return { id, status: target, executionPerformed: false, message: "Lifecycle state updated; no external action was executed." };
}

export const GOAL_APPROVAL_PHRASE = APPROVAL_PHRASE;
