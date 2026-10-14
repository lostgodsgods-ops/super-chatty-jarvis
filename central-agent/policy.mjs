/**
 * Pure authorization policy. This does not execute tools or create agents.
 * Every action not explicitly classified here is denied.
 */
const READ_ONLY_ACTIONS = new Set(["plan", "summarize", "review_diff", "local_test"]);
const SIDE_EFFECT_ACTIONS = new Set([
  "create_child_agent",
  "write_file",
  "open_pull_request",
  "change_configuration",
  "connect_provider",
  "deploy",
  "modify_secret",
  "send_message",
  "delete_data"
]);
const CHILD_AGENT_ROLES = new Set(["research", "development", "integration", "testing"]);

export function classifyAction(action) {
  if (READ_ONLY_ACTIONS.has(action)) return "read-only";
  if (SIDE_EFFECT_ACTIONS.has(action)) return "side-effect";
  return "blocked";
}

export function mayExecute(action, { ownerApproved = false, toolImplemented = false, role = "" } = {}) {
  const classification = classifyAction(action);
  if (classification === "blocked" || !toolImplemented) return false;
  if (action === "create_child_agent" && !CHILD_AGENT_ROLES.has(role)) return false;
  if (classification === "side-effect" && ownerApproved !== true) return false;
  return true;
}

export function describePolicy() {
  return {
    defaultDecision: "deny",
    selfGrantPermissions: false,
    childAgentCreationRequiresOwnerApproval: true,
    externalSideEffectsRequireOwnerApproval: true,
    approvalMustBeExplicitAndActionScoped: true,
    childAgentRoles: [...CHILD_AGENT_ROLES],
    readOnlyActions: [...READ_ONLY_ACTIONS],
    sideEffectActions: [...SIDE_EFFECT_ACTIONS],
    note: "Policy declaration only; actions remain unavailable unless a separately implemented, tested executor is configured."
  };
}