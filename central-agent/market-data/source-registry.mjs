const ALLOWED_CATEGORIES = new Set(["macro", "hyperscaler-financials", "india-market", "market-benchmark"]);
const ALLOWED_FAILURE_MODES = new Set(["stale-cache", "skip-source", "circuit-breaker"]);
const ALLOWED_LICENSE_STATES = new Set(["review-required", "approved", "rejected"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSourceRegistry(registry) {
  const errors = [];
  if (!isRecord(registry) || registry.schemaVersion !== "1.0.0" || !Array.isArray(registry.sources)) {
    return { valid: false, errors: ["registry must use schemaVersion 1.0.0 and contain a sources array"] };
  }

  const ids = new Set();
  for (const [index, source] of registry.sources.entries()) {
    const prefix = `sources[${index}]`;
    if (!isRecord(source)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof source.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)) {
      errors.push(`${prefix}.id is invalid`);
    } else if (ids.has(source.id)) {
      errors.push(`duplicate source id: ${source.id}`);
    } else {
      ids.add(source.id);
    }
    if (typeof source.provider !== "string" || !source.provider.trim()) errors.push(`${prefix}.provider is required`);
    if (!ALLOWED_CATEGORIES.has(source.category)) errors.push(`${prefix}.category is unsupported`);
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") errors.push(`${prefix}.url must use HTTPS`);
    } catch {
      errors.push(`${prefix}.url must be a valid HTTPS URL`);
    }
    if (typeof source.enabled !== "boolean") errors.push(`${prefix}.enabled must be boolean`);
    if (!isRecord(source.licensing) || !ALLOWED_LICENSE_STATES.has(source.licensing.status) ||
        typeof source.licensing.attributionRequired !== "boolean" ||
        typeof source.licensing.commercialUseReviewed !== "boolean") {
      errors.push(`${prefix}.licensing is invalid`);
    }
    if (!isRecord(source.failurePolicy) ||
        !ALLOWED_FAILURE_MODES.has(source.failurePolicy.mode) ||
        !Number.isInteger(source.failurePolicy.timeoutMs) ||
        source.failurePolicy.timeoutMs < 250 || source.failurePolicy.timeoutMs > 30000 ||
        !Number.isInteger(source.failurePolicy.maxRetries) ||
        source.failurePolicy.maxRetries < 0 || source.failurePolicy.maxRetries > 3 ||
        !Number.isInteger(source.failurePolicy.cacheTtlSeconds) ||
        source.failurePolicy.cacheTtlSeconds < 0 ||
        !Number.isInteger(source.failurePolicy.staleMaxSeconds) ||
        source.failurePolicy.staleMaxSeconds < source.failurePolicy.cacheTtlSeconds) {
      errors.push(`${prefix}.failurePolicy is invalid`);
    }
    if (!Array.isArray(source.allowedUse) || source.allowedUse.some(value => typeof value !== "string")) {
      errors.push(`${prefix}.allowedUse must be a string array`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Return only sources that are explicitly enabled and have an approved licence.
 * Any invalid registry fails closed and selects no sources.
 */
export function selectEnabledSources(registry) {
  if (!validateSourceRegistry(registry).valid) return [];
  return registry.sources.filter(source =>
    source.enabled === true &&
    source.licensing.status === "approved" &&
    source.licensing.attributionRequired === true
  );
}
