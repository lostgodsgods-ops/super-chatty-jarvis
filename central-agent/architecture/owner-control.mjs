/**
 * Red Queen Owner Control Core.
 *
 * Pure policy/state module: no persistence, authentication provider, or external side effects.
 * Callers MUST authenticate the owner before invoking mutating operations and MUST persist
 * state/audit events in the host service. This module deliberately cannot disable the
 * emergency stop or grant capabilities that the host has not declared.
 */
export const OWNER_CONTROL_VERSION = "0.1.0";
const BLOCKED_CLASSES = new Set(["unauthorized_access", "harmful_action", "weaponized_control", "audit_evasion", "impossible_capability"]);

export function createOwnerControlState(overrides = {}) {
  return Object.freeze({ mode: "normal", emergencyStop: false, ownerPriority: true, revision: 0, ...overrides });
}
function result(allowed, code, state, extra = {}) { return { allowed, code, state, ...extra }; }

/** Caller must validate a real owner session; never trust a client boolean alone. */
export function setOwnerTakeover(state, enabled, { ownerAuthenticated = false } = {}) {
  if (!ownerAuthenticated) return result(false, "OWNER_AUTH_REQUIRED", state);
  if (state.emergencyStop) return result(false, "EMERGENCY_STOP_ACTIVE", state);
  if (typeof enabled !== "boolean") return result(false, "INVALID_TAKEOVER_VALUE", state);
  const next = Object.freeze({ ...state, mode: enabled ? "owner-takeover" : "normal", ownerPriority: true, revision: state.revision + 1 });
  return result(true, enabled ? "OWNER_TAKEOVER_ENABLED" : "OWNER_TAKEOVER_DISABLED", next);
}

/** Emergency stop cannot be overridden by takeover. */
export function setEmergencyStop(state, enabled, { ownerAuthenticated = false } = {}) {
  if (!ownerAuthenticated) return result(false, "OWNER_AUTH_REQUIRED", state);
  if (typeof enabled !== "boolean") return result(false, "INVALID_EMERGENCY_STOP_VALUE", state);
  const next = Object.freeze({ ...state, emergencyStop: enabled, mode: enabled ? "emergency-stop" : "normal", revision: state.revision + 1 });
  return result(true, enabled ? "EMERGENCY_STOP_ENABLED" : "EMERGENCY_STOP_CLEARED", next);
}

/**
 * Evaluate a command. capabilityAvailable must come from server-side configuration.
 * External side effects require explicit approval. This function does not execute commands.
 */
export function authorizeOwnerCommand(state, command, {
  ownerAuthenticated = false, capabilityAvailable = false, explicitApproval = false
} = {}) {
  if (!ownerAuthenticated) return result(false, "OWNER_AUTH_REQUIRED", state);
  if (state.emergencyStop || state.mode === "emergency-stop") return result(false, "EMERGENCY_STOP_ACTIVE", state);
  if (!command || typeof command !== "object") return result(false, "INVALID_COMMAND", state);
  const riskClass = String(command.riskClass || "ordinary");
  if (BLOCKED_CLASSES.has(riskClass)) return result(false, "NON_OVERRIDABLE_GUARDRAIL", state, { riskClass });
  if (!capabilityAvailable) return result(false, "CAPABILITY_NOT_CONFIGURED", state);
  if (command.externalSideEffect === true && explicitApproval !== true) return result(false, "EXPLICIT_APPROVAL_REQUIRED", state);
  return result(true, state.mode === "owner-takeover" ? "OWNER_PRIORITY_GRANTED" : "COMMAND_AUTHORIZED", state, {
    priority: state.mode === "owner-takeover" ? "owner" : "standard", auditRequired: true
  });
}
