/**
 * Deterministic capability-readiness evaluator.
 *
 * This module reports implementation/configuration gaps only. It never grants access,
 * executes tools, changes policy, or treats a registry entry as proof of live health.
 */
const MAX_REQUIREMENTS = 20;
const CAPABILITY_ID = /^[a-z][a-z0-9-]{0,63}$/i;

function invalidResult(code = "INVALID_INPUT") {
  return { ok: false, ready: false, code, capabilities: [], blockers: [] };
}

function normalizeCapability(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CAPABILITY_ID.test(normalized) ? normalized : null;
}

function isValidProvider(provider) {
  return Boolean(
    provider &&
    typeof provider === "object" &&
    typeof provider.id === "string" &&
    provider.id.trim() &&
    Array.isArray(provider.families) &&
    provider.families.every(family => typeof family === "string") &&
    typeof provider.implemented === "boolean" &&
    typeof provider.configured === "boolean"
  );
}

function assessCapability(capability, providers) {
  const matching = providers.filter(provider =>
    provider.families.some(family => family.trim().toLowerCase() === capability)
  );
  let status;
  let nextStep;
  if (matching.some(provider => provider.implemented && provider.configured)) {
    status = "ready";
    nextStep = "Run a bounded live health check before relying on this capability.";
  } else if (matching.some(provider => provider.implemented)) {
    status = "not_configured";
    nextStep = "Configure the approved provider binding or credential, then verify it.";
  } else if (matching.length) {
    status = "not_implemented";
    nextStep = "Implement and test a provider adapter before enabling this capability.";
  } else {
    status = "missing";
    nextStep = "Register an explicit provider capability and define its contract.";
  }
  return {
    capability,
    status,
    providers: matching.map(provider => provider.id).sort(),
    nextStep
  };
}

export function evaluateCapabilityReadiness({ requiredCapabilities, providers } = {}) {
  if (!Array.isArray(requiredCapabilities) || !Array.isArray(providers)) {
    return invalidResult();
  }
  if (requiredCapabilities.length > MAX_REQUIREMENTS) return invalidResult("INPUT_LIMIT_EXCEEDED");
  if (providers.length > 100) return invalidResult("INPUT_LIMIT_EXCEEDED");

  const normalized = requiredCapabilities.map(normalizeCapability);
  if (normalized.some(capability => capability === null)) return invalidResult();
  const validProviders = providers.filter(isValidProvider);
  const capabilities = [...new Set(normalized)].map(capability =>
    assessCapability(capability, validProviders)
  );
  const blockers = capabilities
    .filter(item => item.status !== "ready")
    .map(item => ({ capability: item.capability, status: item.status, nextStep: item.nextStep }));

  return {
    ok: true,
    ready: blockers.length === 0,
    capabilityCount: capabilities.length,
    readyCount: capabilities.filter(item => item.status === "ready").length,
    capabilities,
    blockers
  };
}

export const CAPABILITY_EVALUATOR_LIMITS = Object.freeze({
  maxRequirements: MAX_REQUIREMENTS,
  maxProviders: 100
});
