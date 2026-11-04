/**
 * REDULTRON bounded adaptive learning core.
 *
 * This is an auditable online feedback/ranking primitive, not a trained
 * neural network. It updates feature weights only from independently
 * verified, referenced evidence. It never grants permissions or executes
 * external actions.
 */
const DEFAULT_WEIGHT = 0.5;
const MIN_WEIGHT = 0;
const MAX_WEIGHT = 1;
const MAX_FEATURES = 64;
const MAX_FEEDBACK_PER_CALL = 1;
const LEARNING_RATE = 0.05;

function validFeatureName(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,47}$/.test(value);
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createLearningState(features = []) {
  if (!Array.isArray(features) || features.length < 1 || features.length > MAX_FEATURES) {
    throw new TypeError("INVALID_FEATURES");
  }
  const unique = [...new Set(features)];
  if (unique.length !== features.length || unique.some(feature => !validFeatureName(feature))) {
    throw new TypeError("INVALID_FEATURES");
  }
  return {
    schemaVersion: "1.0.0",
    algorithm: "bounded-weighted-feedback-v1",
    weights: Object.fromEntries(unique.map(feature => [feature, DEFAULT_WEIGHT])),
    updates: 0
  };
}

/**
 * Apply one feedback observation. Only VERIFIED evidence with an opaque
 * evidence reference is eligible. Invalid or unverified input is a no-op.
 */
export function applyVerifiedFeedback(state, feedback = {}) {
  if (!isPlainObject(state) || !isPlainObject(state.weights) || !isPlainObject(feedback)) {
    return { updated: false, reason: "INVALID_INPUT" };
  }
  const { feature, reward, verification, evidenceRef } = feedback;
  if (verification !== "VERIFIED") return { updated: false, reason: "EVIDENCE_NOT_VERIFIED" };
  if (typeof evidenceRef !== "string" || !evidenceRef.trim() || evidenceRef.length > 240) {
    return { updated: false, reason: "EVIDENCE_REFERENCE_REQUIRED" };
  }
  if (!validFeatureName(feature) || !Object.hasOwn(state.weights, feature)) {
    return { updated: false, reason: "UNKNOWN_FEATURE" };
  }
  if (typeof reward !== "number" || !Number.isFinite(reward) || reward < 0 || reward > 1) {
    return { updated: false, reason: "REWARD_OUT_OF_RANGE" };
  }
  if (!Number.isSafeInteger(state.updates) || state.updates < 0 || state.updates >= Number.MAX_SAFE_INTEGER) {
    return { updated: false, reason: "INVALID_UPDATE_COUNTER" };
  }
  const current = state.weights[feature];
  if (typeof current !== "number" || !Number.isFinite(current) || current < MIN_WEIGHT || current > MAX_WEIGHT) {
    return { updated: false, reason: "INVALID_WEIGHT_STATE" };
  }

  const next = current + LEARNING_RATE * (reward - current);
  state.weights[feature] = clampUnit(next);
  state.updates += 1;
  return { updated: true, feature, weight: state.weights[feature], update: state.updates };
}

/** Rank candidates by weighted, bounded signals without mutating state. */
export function rankCandidates(state, candidates = []) {
  if (!isPlainObject(state) || !isPlainObject(state.weights) || !Array.isArray(candidates) || candidates.length > 500) {
    throw new TypeError("INVALID_RANKING_INPUT");
  }
  const features = Object.keys(state.weights);
  const ranked = candidates.map(candidate => {
    if (!isPlainObject(candidate) || typeof candidate.id !== "string" || !candidate.id.trim() || candidate.id.length > 120) {
      throw new TypeError("INVALID_CANDIDATE");
    }
    const signals = isPlainObject(candidate.signals) ? candidate.signals : {};
    let weighted = 0;
    let totalWeight = 0;
    for (const feature of features) {
      const weight = state.weights[feature];
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
        throw new TypeError("INVALID_WEIGHT_STATE");
      }
      const rawSignal = signals[feature];
      const signal = typeof rawSignal === "number" && Number.isFinite(rawSignal) ? clampUnit(rawSignal) : 0;
      weighted += signal * weight;
      totalWeight += weight;
    }
    return { id: candidate.id, score: totalWeight ? Math.round((weighted / totalWeight) * 1e6) / 1e6 : 0 };
  });
  return ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Safe operational summary; never returns evidence refs or raw feedback. */
export function summarizeLearningState(state) {
  if (!isPlainObject(state) || !isPlainObject(state.weights) ||
      !Number.isSafeInteger(state.updates) || state.updates < 0) {
    throw new TypeError("INVALID_LEARNING_STATE");
  }
  return {
    schemaVersion: "1.0.0",
    algorithm: "bounded-weighted-feedback-v1",
    featureCount: Object.keys(state.weights).length,
    updates: state.updates,
    weights: Object.fromEntries(Object.entries(state.weights).map(([key, value]) => {
      if (!validFeatureName(key) || typeof value !== "number" || !Number.isFinite(value) || value < MIN_WEIGHT || value > MAX_WEIGHT) {
        throw new TypeError("INVALID_WEIGHT_STATE");
      }
      return [key, Math.round(value * 1e6) / 1e6];
    }))
  };
}
