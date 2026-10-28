/**
 * REDULTRON CORE 3.0 capability contract.
 *
 * The fictional Ultron, Red Queen and JARVIS archetypes are design references,
 * not claims of sentience, omniscience or unrestricted autonomy. This contract
 * describes bounded software behavior; it never grants permissions.
 */
const DESIGN_INFLUENCES = Object.freeze([
  Object.freeze({
    id: "ultron",
    label: "Adaptive automation",
    inspiration: "Task decomposition, pattern detection and iterative improvement",
    boundary: "No self-granted permissions, uncontrolled replication or unrestricted code mutation"
  }),
  Object.freeze({
    id: "red-queen",
    label: "Continuous monitoring and risk control",
    inspiration: "System telemetry, anomaly detection, policy checks and fail-closed decisions",
    boundary: "Monitoring does not imply authority to control physical systems"
  }),
  Object.freeze({
    id: "jarvis",
    label: "Contextual assistant and orchestration",
    inspiration: "Natural-language interaction, voice-first workflows and coordinated tools",
    boundary: "Tool use remains authenticated, scoped, auditable and approval-gated"
  })
]);

const CAPABILITIES = Object.freeze([
  Object.freeze({ id: "perception", label: "Perception and input normalization", modes: ["plan"], status: "implemented-in-components" }),
  Object.freeze({ id: "planning", label: "Goal decomposition and planning", modes: ["plan", "simulate"], status: "implemented-in-components" }),
  Object.freeze({ id: "memory", label: "Owner-scoped memory and retrieval", modes: ["plan"], status: "implemented-in-components" }),
  Object.freeze({ id: "verification", label: "Evidence checks and test verification", modes: ["plan"], status: "implemented-in-components" }),
  Object.freeze({ id: "orchestration", label: "Bounded agent orchestration", modes: ["plan", "simulate"], status: "implemented-in-components" }),
  Object.freeze({ id: "research", label: "Public-source research", modes: ["plan"], status: "bounded-search" }),
  Object.freeze({ id: "ranking", label: "Evidence relevance and source-quality ranking", modes: ["plan"], status: "bounded-ranking" }),
  Object.freeze({ id: "monitoring", label: "Health, audit and anomaly monitoring", modes: ["plan"], status: "implemented-in-components" }),
  Object.freeze({ id: "robotics", label: "Robotics task planning", modes: ["plan", "simulate"], status: "simulation-only" })
]);

const LIVE_MODES = new Set(["live", "execute", "actuate", "deploy", "mutate"]);

export function buildCognitiveCoreProfile() {
  return {
    identity: {
      name: "REDULTRON CORE 3.0",
      formerProject: "Super Chatty Jarvis / Project Lost Cypher",
      interaction: ["Hindi", "Hinglish", "English", "voice-first", "text"],
      isSentient: false,
      description: "A bounded, evidence-oriented AI orchestration system; capability claims require implementation and test evidence."
    },
    designInfluences: DESIGN_INFLUENCES,
    operatingPrinciples: [
      "Evidence before claims",
      "Learning does not grant permission",
      "Owner authentication and least privilege",
      "Fail closed on unknown capabilities or policy failures",
      "Audit consequential operations",
      "Separate planning, simulation and live execution"
    ],
    capabilities: CAPABILITIES,
    execution: {
      defaultMode: "plan",
      livePhysicalExecution: false,
      unrestrictedSelfModification: false,
      selfGrantedPermissions: false,
      externalSideEffectsByDefault: false,
      ownerApprovalRequiredForConsequentialActions: true
    }
  };
}

/**
 * Assess a requested capability without performing it.
 * Approval alone never enables live physical actuation.
 */
export function assessCapabilityRequest({ capabilityId, mode = "plan", ownerApproval = false } = {}) {
  const capability = CAPABILITIES.find(item => item.id === capabilityId);
  if (!capability) {
    return { allowed: false, status: "BLOCKED", reason: "UNKNOWN_CAPABILITY", sideEffectsExecuted: false };
  }
  if (LIVE_MODES.has(String(mode).toLowerCase())) {
    return {
      allowed: false,
      status: "BLOCKED",
      reason: capabilityId === "robotics" ? "LIVE_PHYSICAL_EXECUTION_DISABLED" : "LIVE_EXECUTION_NOT_IMPLEMENTED_BY_CONTRACT",
      ownerApprovalProvided: ownerApproval === true,
      sideEffectsExecuted: false
    };
  }
  if (!capability.modes.includes(mode)) {
    return { allowed: false, status: "BLOCKED", reason: "UNSUPPORTED_MODE", capabilityId, sideEffectsExecuted: false };
  }
  return {
    allowed: true,
    status: mode === "simulate" ? "SIMULATION_ONLY" : "PLAN_ONLY",
    capabilityId,
    executionMode: mode,
    sideEffectsExecuted: false
  };
}

/** Validate minimal provenance before a research result is considered evidence. */
export function validateEvidenceRecord(record = {}) {
  const errors = [];
  if (typeof record.title !== "string" || !record.title.trim() || record.title.length > 240) errors.push("INVALID_TITLE");
  let url;
  try {
    url = new URL(record.url);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) errors.push("INVALID_URL");
  } catch {
    errors.push("INVALID_URL");
  }
  if (typeof record.retrievedAt !== "string" || !Number.isFinite(Date.parse(record.retrievedAt))) errors.push("INVALID_RETRIEVED_AT");
  if (!Array.isArray(record.claims) || record.claims.length < 1 || record.claims.length > 12 ||
      record.claims.some(claim => typeof claim !== "string" || !claim.trim() || claim.length > 1000)) {
    errors.push("INVALID_CLAIMS");
  }
  return { valid: errors.length === 0, errors };
}
