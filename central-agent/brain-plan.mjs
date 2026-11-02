const TASK_TYPES = new Set(["question", "research", "coding", "planning", "action"]);
const MAX_STEPS = 12;
const MAX_ACCEPTANCE = 8;
const MAX_DEPENDENCIES = 8;
const MAX_PERMISSIONS = 12;

export class BrainPlanError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "BrainPlanError";
    this.code = code;
    this.status = status;
  }
}

function fail(code) {
  throw new BrainPlanError(code);
}

function boundedText(value, max, code) {
  if (typeof value !== "string") fail(code);
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max) fail(code);
  return text;
}

function identifier(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function assertAcyclic(steps) {
  const byId = new Map(steps.map(step => [step.id, step]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) fail("BRAIN_PLAN_DEPENDENCY_CYCLE");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }

  for (const step of steps) visit(step.id);
}

/**
 * Converts untrusted model output into a strict, non-executable Brain plan.
 * Capabilities are accepted only from a trusted server-side allowlist.
 */
export function normalizeBrainPlan(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("BRAIN_PLAN_INVALID");
  const goal = boundedText(input.goal, 500, "BRAIN_PLAN_GOAL_INVALID");
  if (!TASK_TYPES.has(input.taskType)) fail("BRAIN_PLAN_TASK_TYPE_INVALID");
  if (!Array.isArray(input.steps) || input.steps.length < 1) fail("BRAIN_PLAN_STEPS_REQUIRED");
  if (input.steps.length > MAX_STEPS) fail("BRAIN_PLAN_STEP_LIMIT_EXCEEDED");

  const allowed = new Set(Array.isArray(options.allowedCapabilities)
    ? options.allowedCapabilities.filter(value => typeof value === "string" && /^[a-z][a-z0-9:_-]{0,63}$/i.test(value))
    : []);
  const ids = new Set();
  const steps = input.steps.map(step => {
    if (!step || typeof step !== "object" || Array.isArray(step)) fail("BRAIN_PLAN_STEP_INVALID");
    const id = identifier(step.id, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/, "BRAIN_PLAN_STEP_INVALID");
    if (ids.has(id)) fail("BRAIN_PLAN_DUPLICATE_STEP_ID");
    ids.add(id);
    const description = boundedText(step.description, 1000, "BRAIN_PLAN_STEP_INVALID");
    const capability = identifier(step.capability, /^[a-z][a-z0-9:_-]{0,63}$/i, "BRAIN_PLAN_STEP_INVALID");
    if (!allowed.has(capability)) fail("BRAIN_PLAN_CAPABILITY_NOT_ALLOWED");
    if (!Array.isArray(step.dependsOn) || step.dependsOn.length > MAX_DEPENDENCIES ||
        step.dependsOn.some(item => typeof item !== "string")) fail("BRAIN_PLAN_DEPENDENCIES_INVALID");
    if (new Set(step.dependsOn).size !== step.dependsOn.length) fail("BRAIN_PLAN_DUPLICATE_DEPENDENCY");
    if (step.dependsOn.includes(id)) fail("BRAIN_PLAN_SELF_DEPENDENCY");
    if (!Array.isArray(step.acceptanceCriteria) || step.acceptanceCriteria.length < 1 ||
        step.acceptanceCriteria.length > MAX_ACCEPTANCE) fail("BRAIN_PLAN_ACCEPTANCE_CRITERIA_INVALID");
    const acceptanceCriteria = step.acceptanceCriteria.map(item =>
      boundedText(item, 300, "BRAIN_PLAN_ACCEPTANCE_CRITERIA_INVALID"));
    return { id, description, dependsOn: [...step.dependsOn], capability, acceptanceCriteria };
  });

  for (const step of steps) {
    if (step.dependsOn.some(dependency => !ids.has(dependency))) fail("BRAIN_PLAN_DEPENDENCY_NOT_FOUND");
  }
  assertAcyclic(steps);

  if (input.permissions !== undefined && !Array.isArray(input.permissions)) fail("BRAIN_PLAN_PERMISSIONS_INVALID");
  const requested = input.permissions || [];
  if (requested.length > MAX_PERMISSIONS) fail("BRAIN_PLAN_PERMISSION_LIMIT_EXCEEDED");
  const seenPermissions = new Set();
  const permissions = requested.map(value => {
    const capability = identifier(value, /^[a-z][a-z0-9:_-]{0,63}$/i, "BRAIN_PLAN_PERMISSIONS_INVALID");
    if (seenPermissions.has(capability)) fail("BRAIN_PLAN_DUPLICATE_PERMISSION");
    seenPermissions.add(capability);
    if (!allowed.has(capability)) fail("BRAIN_PLAN_CAPABILITY_NOT_ALLOWED");
    return { capability, approved: false };
  });

  const route = input.modelRoute === undefined ? {} : input.modelRoute;
  if (!route || typeof route !== "object" || Array.isArray(route) ||
      (route.provider !== undefined && (typeof route.provider !== "string" || !/^[a-z0-9-]{1,64}$/i.test(route.provider))) ||
      (route.model !== undefined && (typeof route.model !== "string" || !/^[A-Za-z0-9._:/-]{1,160}$/.test(route.model)))) {
    fail("BRAIN_PLAN_MODEL_ROUTE_INVALID");
  }

  const now = typeof options.now === "function" ? options.now() : new Date().toISOString();
  if (typeof now !== "string" || !Number.isFinite(Date.parse(now))) fail("BRAIN_PLAN_TIMESTAMP_INVALID");
  const taskId = options.taskId === undefined
    ? (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null)
    : options.taskId;
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(taskId)) fail("BRAIN_PLAN_TASK_ID_INVALID");

  return Object.freeze({
    taskId,
    status: "PLANNED",
    goal,
    taskType: input.taskType,
    steps,
    permissions,
    modelRoute: {
      provider: route.provider || null,
      model: route.model || null
    },
    verification: [],
    evidence: [],
    createdAt: now,
    updatedAt: now
  });
}
