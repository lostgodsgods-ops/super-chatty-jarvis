/**
 * Guarded mission-domain registry for Super Chatty Jarvis.
 *
 * This module registers planning/simulation capabilities only. It does not
 * control vehicles, robots, life-support systems, satellites, or launch
 * hardware, and it does not grant permissions or execute external actions.
 */
export const MISSION_MODULES = Object.freeze([
  Object.freeze({
    id: "secure-transit",
    label: "Secure Transit Planning",
    status: "planned",
    executionMode: "planning-and-simulation-only",
    scope: "Authorized logistics planning, communications security, and auditability.",
    boundary: "No covert extraction, tracking evasion, or untraceable-movement assistance."
  }),
  Object.freeze({
    id: "subsurface-habitat",
    label: "Subsurface and Sub-glacial Habitat",
    status: "planned",
    executionMode: "planning-and-simulation-only",
    scope: "Habitat concepts, environmental-monitoring plans, and emergency scenario simulation.",
    boundary: "No autonomous control of live life-support or safety-critical equipment."
  }),
  Object.freeze({
    id: "robotics-workforce",
    label: "Robotics Workforce",
    status: "planned",
    executionMode: "planning-and-simulation-only",
    scope: "Sandboxed task plans, permission matrices, test scenarios, and audit workflows.",
    boundary: "No live robot actuation or physical side effects from this registry."
  }),
  Object.freeze({
    id: "aerospace-research",
    label: "Aerospace and Deep-space Research",
    status: "planned",
    executionMode: "planning-and-simulation-only",
    scope: "Public-source research, orbital-concept analysis, and non-operational simulations.",
    boundary: "No launch commands, spacecraft control, or hazardous hardware operation."
  })
]);

const VALID_MODES = new Set(["plan", "simulate"]);
// Match the prohibited concepts as phrases, not just a few exact wordings.
// This covers the specific review examples without blocking ordinary route planning.
const EVASION_PATTERN = /\buntraceable\b|\b(?:evade|evading|evasion of)\s+(?:tracking|detection)\b|\btracking\s+evasion\b|\bavoid(?:ing)?\s+detection\b|\b(?:covert|stealth)\s+extraction\b/i;

export function getMissionModule(moduleId) {
  if (typeof moduleId !== "string") return null;
  return MISSION_MODULES.find(module => module.id === moduleId) ?? null;
}

/**
 * Assess a request without executing it. Unknown capabilities fail closed.
 * "humanApproval" is deliberately not an execution bypass.
 */
export function assessMissionRequest({ moduleId, action, mode, humanApproval = false } = {}) {
  const module = getMissionModule(moduleId);
  if (!module) {
    return { allowed: false, status: "BLOCKED", reason: "UNKNOWN_MISSION_MODULE" };
  }
  if (typeof action !== "string" || !action.trim()) {
    return { allowed: false, status: "BLOCKED", reason: "ACTION_REQUIRED" };
  }
  if (EVASION_PATTERN.test(action)) {
    return { allowed: false, status: "BLOCKED", reason: "EVASION_REQUEST_NOT_SUPPORTED" };
  }
  if (!VALID_MODES.has(mode)) {
    return {
      allowed: false,
      status: "HUMAN_REVIEW_REQUIRED",
      reason: "LIVE_EXECUTION_DISABLED",
      humanApprovalProvided: humanApproval === true
    };
  }
  return {
    allowed: true,
    status: mode === "simulate" ? "SIMULATION_ONLY" : "PLAN_ONLY",
    moduleId: module.id,
    executionMode: module.executionMode,
    sideEffectsExecuted: false
  };
}
