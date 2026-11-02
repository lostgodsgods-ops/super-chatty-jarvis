import { readOwnerExecutionGate } from "./architecture/owner-execution-gate.mjs";

const SAFE_TASK_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SAFE_CAPABILITY = /^[a-z][a-z0-9:_-]{0,63}$/i;
const SAFE_ERROR = /^[A-Z0-9_]{1,80}$/;

function blocked(taskId, errorCode, status = 503) {
  return { ok: false, taskId, status: "BLOCKED", errorCode, httpStatus: status };
}

function validPlan(plan) {
  return plan && typeof plan === "object" && !Array.isArray(plan) &&
    typeof plan.taskId === "string" && SAFE_TASK_ID.test(plan.taskId) &&
    plan.status === "PLANNED" && Array.isArray(plan.steps) &&
    plan.steps.length >= 1 && plan.steps.length <= 12 &&
    plan.steps.every(step => step && typeof step === "object" &&
      typeof step.capability === "string" && SAFE_CAPABILITY.test(step.capability));
}

/**
 * Applies owner-control and audit policy to a persisted plan.
 * This coordinator intentionally never invokes task-runtime executors.
 */
export async function coordinateBrainPlan(plan, dependencies = {}) {
  const taskId = typeof plan?.taskId === "string" && SAFE_TASK_ID.test(plan.taskId)
    ? plan.taskId : null;
  if (!taskId || !validPlan(plan)) return blocked(taskId, "BRAIN_PLAN_INVALID", 400);

  const taskStore = dependencies.taskStore;
  if (!taskStore || typeof taskStore.transition !== "function") {
    return blocked(taskId, "BRAIN_TASK_STORAGE_UNAVAILABLE");
  }

  const publishEvent = dependencies.publishEvent;
  if (typeof publishEvent !== "function") return blocked(taskId, "BRAIN_AUDIT_UNAVAILABLE");

  const emit = async (type, payload) => {
    try {
      const result = await publishEvent({
        type,
        source: "redultron-brain-coordinator",
        payload: { taskId, ...payload }
      });
      return result?.ok === true;
    } catch {
      return false;
    }
  };

  if (!await emit("brain.coordination.requested", {
    stepCount: plan.steps.length,
    backgroundTask: dependencies.backgroundTask === true
  })) return blocked(taskId, "BRAIN_AUDIT_UNAVAILABLE");

  const allowed = new Set(Array.isArray(dependencies.allowedCapabilities)
    ? dependencies.allowedCapabilities.filter(value => typeof value === "string" && SAFE_CAPABILITY.test(value))
    : []);
  if (plan.steps.some(step => !allowed.has(step.capability))) {
    return await persistBlocked(taskStore, taskId, "BRAIN_CAPABILITY_NOT_ALLOWED", emit);
  }

  const readGate = typeof dependencies.readGate === "function"
    ? dependencies.readGate
    : readOwnerExecutionGate;
  let gate;
  try {
    gate = await readGate(dependencies.env || {});
  } catch {
    gate = null;
  }
  if (!gate || gate.ok !== true || gate.mode === "unavailable") {
    return await persistBlocked(taskStore, taskId, "OWNER_CONTROL_STORE_UNAVAILABLE", emit);
  }
  if (gate.mode === "emergency-stop") {
    return await persistBlocked(taskStore, taskId, "EMERGENCY_STOP_ACTIVE", emit);
  }
  if (dependencies.backgroundTask === true && gate.allowBackgroundTasks !== true) {
    return await persistBlocked(taskStore, taskId, "OWNER_TAKEOVER_ACTIVE", emit);
  }
  if (dependencies.backgroundTask !== true && gate.allowOwnerActions !== true) {
    return await persistBlocked(taskStore, taskId, "OWNER_ACTIONS_BLOCKED", emit);
  }

  if (!await emit("brain.coordination.completed", { status: "PLANNED" })) {
    return await persistBlocked(taskStore, taskId, "BRAIN_AUDIT_UNAVAILABLE", emit);
  }

  return { ok: true, taskId, status: "PLANNED", execution: { toolsExecuted: false } };
}

async function persistBlocked(taskStore, taskId, errorCode, emit) {
  let safeCode = SAFE_ERROR.test(errorCode) ? errorCode : "BRAIN_COORDINATION_BLOCKED";
  try {
    await taskStore.transition(taskId, "BLOCKED", {
      expectedStatus: "PLANNED",
      errorCode: safeCode
    });
  } catch {
    safeCode = "BRAIN_TASK_STATE_UPDATE_FAILED";
  }
  await emit("brain.coordination.blocked", { status: "BLOCKED", errorCode: safeCode });
  return blocked(taskId, safeCode);
}
