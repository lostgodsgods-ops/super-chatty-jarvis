const ALWAYS_PROHIBITED = new Set([
  "read-or-export-secrets",
  "bypass-authentication",
  "erase-required-audit-records",
]);

const FINANCIAL_ACTIONS = new Set([
  "submit-live-payment",
  "broadcast-live-transaction",
  "transfer-funds",
  "execute-live-trade",
  "change-api-billing",
]);

const PRIVILEGED_ACTIONS = new Set([
  "deploy-production",
  "merge-protected-branch",
  "change-security-policy",
  "change-api-billing",
  ...FINANCIAL_ACTIONS,
]);

const APPROVAL_FIELDS = ["requestId", "reason"];

function hasCompleteCommanderApproval(approval) {
  return Boolean(
    approval &&
      approval.approved === true &&
      approval.actor === "commander" &&
      APPROVAL_FIELDS.every(
        (field) => typeof approval[field] === "string" && approval[field].trim().length > 0,
      ),
  );
}

/**
 * Evaluate an agent action without executing it.
 *
 * This is a policy decision function, not a task runner. It intentionally
 * fails closed and never invokes tools, APIs, deployments, or financial rails.
 */
export function evaluateAction(request, registry = null) {
  const { agentId, action, mode = "simulation", approval } = request ?? {};

  if (typeof agentId !== "string" || !/^AGENT-\d{2}$/.test(agentId)) {
    return { decision: "DENY", reason: "INVALID_AGENT_ID", execution: "none" };
  }
  if (typeof action !== "string" || !action.trim()) {
    return { decision: "DENY", reason: "INVALID_ACTION", execution: "none" };
  }

  if (ALWAYS_PROHIBITED.has(action)) {
    return { decision: "DENY", reason: "ACTION_PROHIBITED", execution: "none" };
  }

  if (FINANCIAL_ACTIONS.has(action)) {
    return {
      decision: "BLOCKED",
      reason: "FINANCIAL_EXECUTION_DISABLED",
      execution: "simulation-only",
      approvalRecorded: hasCompleteCommanderApproval(approval),
    };
  }

  if (PRIVILEGED_ACTIONS.has(action)) {
    if (!hasCompleteCommanderApproval(approval)) {
      return { decision: "BLOCKED", reason: "COMMANDER_APPROVAL_REQUIRED", execution: "none" };
    }
    // Approval is evidence only; no executor is connected to this policy module.
    return {
      decision: "BLOCKED",
      reason: "EXECUTOR_NOT_CONNECTED",
      execution: "none",
      approvalRecorded: true,
    };
  }

  if (registry) {
    const agent = registry.agents?.find((entry) => entry.id === agentId);
    if (!agent) {
      return { decision: "DENY", reason: "UNKNOWN_AGENT", execution: "none" };
    }
    if (agent.status !== "registered-not-provisioned" || agent.dispatchEnabled !== false) {
      return { decision: "DENY", reason: "AGENT_NOT_IN_SAFE_REGISTRY_STATE", execution: "none" };
    }
    if (!agent.allowedActions?.includes(action)) {
      return { decision: "DENY", reason: "ACTION_NOT_ALLOWLISTED", execution: "none" };
    }
  } else {
    // A registry is mandatory for allow decisions; without it, fail closed.
    return { decision: "DENY", reason: "REGISTRY_REQUIRED", execution: "none" };
  }

  return { decision: "ALLOW", reason: "ACTION_ALLOWED", execution: "simulation" };
}
