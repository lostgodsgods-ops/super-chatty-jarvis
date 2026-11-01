import { runTask } from "./task-runtime.mjs";
import { buildResultEnvelope } from "./architecture/core-identity.mjs";
import { persistResultEnvelope } from "./result-ledger.mjs";

function resultStatus(taskStatus) {
  if (taskStatus === "SUCCEEDED") return "PASS";
  if (taskStatus === "FAILED" || taskStatus === "TIMED_OUT" || taskStatus === "CANCELLED") return "FAIL";
  if (taskStatus === "BLOCKED") return "BLOCKED";
  return "NOT_TESTED";
}

/**
 * Runs the existing bounded task state machine and attaches a correlated
 * REDULTRON result envelope. Runtime history is recorded as evidence pointers,
 * but is not treated as independent verification or durable audit storage.
 */
export async function runTaskWithIdentity(contract, registry, executors, options = {}) {
  const task = await runTask(contract, registry, executors, options);
  const evidence = Array.isArray(task.history)
    ? task.history.slice(0, 20).map((event, index) =>
        `task-history:${task.taskId || "unknown"}:${index}:${event.to || "unknown"}`)
    : [];

  const resultEnvelope = buildResultEnvelope({
    status: resultStatus(task.status),
    taskId: task.taskId,
    summary: task.errorCode
      ? `Task ended with ${task.status}: ${task.errorCode}`
      : `Task ended with ${task.status}`,
    evidence,
    provenance: {
      source: "task-runtime",
      buildSha: options.buildSha || null,
      deploymentId: options.deploymentId || null
    },
    identity: {
      version: options.coreVersion || "3.0.0",
      instanceId: options.instanceId || null,
      buildSha: options.buildSha || null,
      deploymentId: options.deploymentId || null
    }
  });

  let ledger = { persisted: false, required: false, code: "D1_NOT_CONFIGURED" };
  if (options.db) {
    ledger = { persisted: false, required: true, code: "PERSISTENCE_FAILED" };
    try {
      const saved = await persistResultEnvelope(options.db, options.ownerScope, resultEnvelope);
      ledger = { ...saved, required: true, code: null };
    } catch (error) {
      ledger = {
        persisted: false,
        required: true,
        code: typeof error?.message === "string" && /^[A-Z0-9_]{1,80}$/.test(error.message)
          ? error.message : "PERSISTENCE_FAILED"
      };
    }
  }
  return { ...task, resultEnvelope, ledger };
}
