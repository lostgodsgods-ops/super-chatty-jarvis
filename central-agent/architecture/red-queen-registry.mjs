import { MISSION_MODULES } from "./mission-grid.mjs";
import { PLATFORM_MODULES, getPlatformModuleSummary } from "./platform-module-registry.mjs";
import { buildCognitiveCoreProfile } from "./cognitive-core-contract.mjs";

/**
 * Read-only Red Queen status projection.
 * Describes repository/configuration state only; it never controls hardware.
 */
export function buildRedQueenStatus(env = {}) {
  return {
    version: "0.2.0",
    identity: buildCognitiveCoreProfile(),
    executionMode: "planning-and-simulation-only",
    infrastructure: {
      workers: { status: "current-worker-runtime", configured: true },
      d1: { status: env.DB && typeof env.DB.prepare === "function" ? "binding-present" : "unavailable" },
      kv: { status: env.SESSIONS && typeof env.SESSIONS.get === "function" ? "binding-present" : "unavailable" },
      vectorize: { status: env.VECTORIZE && typeof env.VECTORIZE.query === "function" ? "binding-present-unverified" : "not-configured" },
      quantumMeshImplemented: false,
      untraceableRoutingImplemented: false
    },
    missionModules: MISSION_MODULES.map(({ id, label, status, executionMode, scope, boundary }) => ({
      id, label, status, executionMode, scope, boundary
    })),
    platformModules: PLATFORM_MODULES,
    platformModuleSummary: getPlatformModuleSummary(),
    baseSystems: {
      habitatAndLifeSupport: "simulation-only-not-connected",
      roboticsAndSwarmTasks: "sandbox-planning-only-not-connected",
      aerospaceResearch: "non-operational-research-only",
      physicalDefenseHardware: "not-implemented",
      hazardousEnergySystems: "not-implemented",
      irreversibleDataWipe: "disabled-not-implemented"
    },
    livePhysicalExecution: false,
    statusMeaning: "This endpoint reports declared software capabilities and binding presence, not production verification or hardware readiness."
  };
}
