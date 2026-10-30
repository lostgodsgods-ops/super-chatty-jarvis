const STATES = Object.freeze([
  "QUEUED", "VALIDATING", "READY", "RUNNING", "VERIFYING",
  "SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"
]);
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT"]);
const TRANSITIONS = Object.freeze({
  QUEUED: new Set(["VALIDATING", "CANCELLED"]),
  VALIDATING: new Set(["READY", "BLOCKED", "FAILED", "CANCELLED"]),
  READY: new Set(["RUNNING", "BLOCKED", "CANCELLED"]),
  RUNNING: new Set(["VERIFYING", "FAILED", "CANCELLED", "TIMED_OUT"]),
  VERIFYING: new Set(["SUCCEEDED", "FAILED"])
});
const MAX_INPUT_BYTES = 8192;
const MAX_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

function safeReason(value) {
  return typeof value === "string" && /^[a-z0-9:_-]{1,80}$/i.test(value)
    ? value
    : "unspecified";
}
function copy(value) {
  return JSON.parse(JSON.stringify(value));
}
function inputSize(input) {
  try { return new TextEncoder().encode(JSON.stringify(input)).length; }
  catch { return Infinity; }
}
function addEvent(task, from, to, reason) {
  const at = new Date().toISOString();
  return {
    ...task,
    status: to,
    updatedAt: at,
    history: [...task.history, { at, from, to, reason: safeReason(reason) }]
  };
}

export function createTaskContract(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) errors.push("task must be an object");
  const task = input && typeof input === "object" ? input : {};
  if (typeof task.taskId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.taskId)) errors.push("taskId is invalid");
  if (typeof task.capability !== "string" || !/^[a-z][a-z0-9_-]*(?::[a-z0-9_-]+)?$/i.test(task.capability)) errors.push("capability is invalid");
  if (!(typeof task.input === "string" || (task.input !== null && typeof task.input === "object")) ||
      inputSize(task.input) > MAX_INPUT_BYTES) errors.push("input is invalid or too large");
  if (!Number.isInteger(task.timeoutMs) || task.timeoutMs < 1 || task.timeoutMs > MAX_TIMEOUT_MS) errors.push("timeoutMs is outside allowed bounds");
  if (!Number.isInteger(task.maxRetries) || task.maxRetries < 0 || task.maxRetries > MAX_RETRIES) errors.push("maxRetries is outside allowed bounds");
  if (task.requiresApproval !== undefined && typeof task.requiresApproval !== "boolean") errors.push("requiresApproval must be boolean");
  if (errors.length) throw new TypeError("TASK_CONTRACT_INVALID:" + errors.join(","));

  const at = new Date().toISOString();
  return {
    taskId: task.taskId,
    capability: task.capability,
    input: copy(task.input),
    timeoutMs: task.timeoutMs,
    maxRetries: task.maxRetries,
    requiresApproval: task.requiresApproval === true,
    approval: task.approval && typeof task.approval === "object" ? {
      approved: task.approval.approved === true,
      capability: typeof task.approval.capability === "string" ? task.approval.capability : "",
      taskId: typeof task.approval.taskId === "string" ? task.approval.taskId : ""
    } : null,
    status: "QUEUED",
    createdAt: at,
    updatedAt: at,
    result: null,
    errorCode: null,
    attempts: 0,
    history: [{ at, from: null, to: "QUEUED", reason: "created" }]
  };
}

export function transitionTask(task, nextState, metadata = {}) {
  if (!task || !STATES.includes(task.status) || !STATES.includes(nextState) ||
      TERMINAL.has(task.status) || !TRANSITIONS[task.status]?.has(nextState)) {
    throw new Error("TASK_TRANSITION_INVALID");
  }
  return addEvent(task, task.status, nextState, metadata.reason);
}

function finish(task, state, code) {
  const next = transitionTask(task, state, { reason: code.toLowerCase().replace(/[^a-z0-9:_-]/g, "-") });
  return { ...next, errorCode: code };
}
function approvedFor(task, capability) {
  return task.approval?.approved === true &&
    task.approval.taskId === task.taskId &&
    task.approval.capability === capability;
}
function selectExecutor(task, registry, executors) {
  if (!Array.isArray(registry)) return { error: "TOOL_NOT_REGISTERED" };
  const matches = registry.filter(tool => tool && tool.enabled === true &&
    Array.isArray(tool.capabilities) && tool.capabilities.includes(task.capability));
  if (!matches.length) {
    const exists = registry.some(tool => tool && tool.id && tool.capabilities?.includes(task.capability));
    return { error: exists ? "TOOL_DISABLED" : "TOOL_NOT_REGISTERED" };
  }
  const tool = matches.find(item => typeof item.id === "string" && typeof executors?.[item.id] === "function");
  if (!tool) return { error: "NO_AUTHORIZED_EXECUTOR" };
  return { tool, executor: executors[tool.id] };
}

export async function runTask(contract, registry, executors, options = {}) {
  let task = contract;
  if (!task || !STATES.includes(task.status) || task.status !== "QUEUED" ||
      !Array.isArray(task.history) || typeof task.taskId !== "string") {
    return { ...(task && typeof task === "object" ? task : {}), status: "BLOCKED", errorCode: "TASK_CONTRACT_INVALID" };
  }
  if (options.signal?.aborted) return finish(task, "CANCELLED", "TASK_CANCELLED");
  task = transitionTask(task, "VALIDATING", { reason: "schema-validated" });

  if (options.emergencyStop === true) return finish(task, "BLOCKED", "EMERGENCY_STOP_ACTIVE");
  const selected = selectExecutor(task, registry, executors);
  if (selected.error) return finish(task, "BLOCKED", selected.error);
  const { tool, executor } = selected;
  if (tool.sideEffects === true || task.requiresApproval) {
    let verified = false;
    if (approvedFor(task, task.capability) && typeof options.verifyApproval === "function") {
      try {
        verified = await options.verifyApproval({
          taskId: task.taskId,
          capability: task.capability,
          approval: copy(task.approval)
        }) === true;
      } catch {
        verified = false;
      }
    }
    if (!verified) return finish(task, "BLOCKED", "OWNER_APPROVAL_REQUIRED");
  }

  task = transitionTask(task, "READY", { reason: "executor-authorized" });
  if (options.signal?.aborted) return finish(task, "CANCELLED", "TASK_CANCELLED");
  task = transitionTask(task, "RUNNING", { reason: "dispatch-started" });

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    for (let attempt = 0; attempt <= task.maxRetries; attempt += 1) {
      task = { ...task, attempts: attempt + 1 };
      if (options.signal?.aborted || controller.signal.aborted) return finish(task, "CANCELLED", "TASK_CANCELLED");
      let timer;
      try {
        const cancellation = new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            const error = new Error("TASK_CANCELLED");
            error.code = "TASK_CANCELLED";
            reject(error);
          }, { once: true });
        });
        const result = await Promise.race([
          cancellation,
          Promise.resolve().then(() => executor({
            taskId: task.taskId,
            capability: task.capability,
            input: copy(task.input),
            signal: controller.signal,
            attempt: attempt + 1
          })),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              const error = new Error("TASK_TIMEOUT");
              error.code = "TASK_TIMEOUT";
              reject(error);
            }, task.timeoutMs);
          })
        ]);
        clearTimeout(timer);
        task = transitionTask(task, "VERIFYING", { reason: "executor-returned" });
        if (result === undefined) return finish(task, "FAILED", "EXECUTOR_RESULT_INVALID");
        const success = transitionTask(task, "SUCCEEDED", { reason: "result-available" });
        return { ...success, result: copy(result), errorCode: null };
      } catch (error) {
        clearTimeout(timer);
        if (error?.code === "TASK_TIMEOUT") return finish(task, "TIMED_OUT", "TASK_TIMEOUT");
        if (error?.code === "TASK_CANCELLED" || options.signal?.aborted) return finish(task, "CANCELLED", "TASK_CANCELLED");
        if (attempt < task.maxRetries) {
          task = addEvent(task, "RUNNING", "RUNNING", "retry");
          continue;
        }
        return finish(task, "FAILED", "EXECUTOR_FAILED");
      }
    }
    return finish(task, "FAILED", "EXECUTOR_FAILED");
  } finally {
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export const TASK_STATES = STATES;
