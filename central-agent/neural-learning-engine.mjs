/**
 * Bounded, evidence-gated prototype learning for REDULTRON.
 *
 * This is a small neural-inspired online classifier, not a trained foundation
 * model. It learns normalized class centroids only from independently verified
 * examples. State is immutable and persistence is the caller's responsibility.
 */
export const NEURAL_LEARNING_SCHEMA_VERSION = "1.0.0";
const MAX_DIMENSIONS = 256;
const MAX_CLASSES = 128;
const MAX_SAMPLES_PER_CLASS = 100000;
const LABEL_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

function fail(error) {
  return { ok: false, error };
}

function normalizeVector(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DIMENSIONS) return null;
  if (value.some(item => typeof item !== "number" || !Number.isFinite(item))) return null;
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm === 0) return null;
  return value.map(item => item / norm);
}

function cosine(left, right) {
  if (left.length !== right.length) return -1;
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function createNeuralLearningState() {
  return { schemaVersion: NEURAL_LEARNING_SCHEMA_VERSION, dimensions: null, classes: [] };
}

/**
 * Incorporate one example only after an upstream evaluator has verified its
 * evidence. The boolean is an assertion from that trusted boundary, not a
 * substitute for performing evidence verification there.
 */
export function learnVerifiedExample(state, example) {
  if (!state || state.schemaVersion !== NEURAL_LEARNING_SCHEMA_VERSION ||
      !Array.isArray(state.classes) || state.classes.length > MAX_CLASSES) {
    return fail("INVALID_LEARNING_STATE");
  }
  const label = typeof example?.label === "string" ? example.label.trim() : "";
  if (!LABEL_PATTERN.test(label)) return fail("INVALID_LABEL");
  const vector = normalizeVector(example?.vector);
  if (!vector) return fail("INVALID_VECTOR");
  if (state.dimensions !== null && state.dimensions !== vector.length) {
    return fail("VECTOR_DIMENSION_MISMATCH");
  }
  if (example?.evidenceVerified !== true) return fail("VERIFIED_EVIDENCE_REQUIRED");
  if (typeof example?.evidenceRef !== "string" ||
      !example.evidenceRef.trim() || example.evidenceRef.length > 240) {
    return fail("EVIDENCE_REFERENCE_REQUIRED");
  }

  const index = state.classes.findIndex(item => item.label === label);
  if (index < 0 && state.classes.length >= MAX_CLASSES) return fail("CLASS_LIMIT_REACHED");
  const previous = index < 0 ? null : state.classes[index];
  if (previous && (!Array.isArray(previous.centroid) ||
      previous.centroid.length !== vector.length ||
      !Number.isInteger(previous.sampleCount) ||
      previous.sampleCount < 1 || previous.sampleCount >= MAX_SAMPLES_PER_CLASS)) {
    return fail("INVALID_CLASS_PROTOTYPE");
  }

  const sampleCount = (previous?.sampleCount || 0) + 1;
  const combined = previous
    ? previous.centroid.map((value, i) => value * (sampleCount - 1) + vector[i])
    : vector.slice();
  const centroid = normalizeVector(combined);
  if (!centroid) return fail("PROTOTYPE_UPDATE_FAILED");

  const nextClass = { label, centroid, sampleCount, lastEvidenceRef: example.evidenceRef.trim() };
  const classes = state.classes.slice();
  if (index < 0) classes.push(nextClass);
  else classes[index] = nextClass;

  return {
    ok: true,
    state: {
      schemaVersion: NEURAL_LEARNING_SCHEMA_VERSION,
      dimensions: vector.length,
      classes
    },
    learning: { label, sampleCount, updated: true, evidenceRef: nextClass.lastEvidenceRef }
  };
}

/** Return the closest learned prototype, or abstain when confidence is low. */
export function classifyVector(state, input, options = {}) {
  if (!state || state.schemaVersion !== NEURAL_LEARNING_SCHEMA_VERSION ||
      !Array.isArray(state.classes)) return { status: "ABSTAIN", label: null, reason: "INVALID_LEARNING_STATE" };
  const vector = normalizeVector(input);
  if (!vector) return { status: "ABSTAIN", label: null, reason: "INVALID_VECTOR" };
  if (state.dimensions !== null && state.dimensions !== vector.length) {
    return { status: "ABSTAIN", label: null, reason: "VECTOR_DIMENSION_MISMATCH" };
  }
  const threshold = options.minSimilarity === undefined ? 0.75 : options.minSimilarity;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    return { status: "ABSTAIN", label: null, reason: "INVALID_SIMILARITY_THRESHOLD" };
  }
  const ranked = state.classes
    .filter(item => item && typeof item.label === "string" &&
      Array.isArray(item.centroid) && item.centroid.length === vector.length)
    .map(item => ({ label: item.label, similarity: cosine(vector, item.centroid), sampleCount: item.sampleCount }))
    .sort((a, b) => b.similarity - a.similarity || a.label.localeCompare(b.label));
  const best = ranked[0];
  if (!best || best.similarity < threshold) {
    return { status: "ABSTAIN", label: null, similarity: best?.similarity ?? null, candidates: ranked.slice(0, 3) };
  }
  return { status: "MATCH", label: best.label, similarity: best.similarity, sampleCount: best.sampleCount, candidates: ranked.slice(0, 3) };
}
