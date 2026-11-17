/**
 * REDULTRON Game Mechanics Lab
 *
 * Read-only observation and UI-state analysis for public game interfaces.
 * This module deliberately does not model, predict, or optimize wagers or game outcomes.
 * It stores aggregate visible counts only; no player identity, account, wallet, or credential data.
 */

export const OBSERVABLE_UI_STATES = Object.freeze([
  "UNKNOWN",
  "IDLE",
  "COUNTDOWN",
  "ENTRY_WINDOW",
  "LOCKED",
  "SPINNING",
  "RESULT",
  "SETTLEMENT",
  "NEXT_ROUND"
]);

const SAFE_ACTIONS = new Map([
  ["read_public_page", new Set(["GET"])],
  ["capture_visible_frame", new Set(["LOCAL"])],
  ["analyze_video_frames", new Set(["LOCAL"])],
  ["record_aggregate_player_count", new Set(["LOCAL"])],
  ["run_local_simulation", new Set(["LOCAL"])]
]);

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function createObservationRecord(input = {}) {
  const uiState = typeof input.uiState === "string" ? input.uiState.trim().toUpperCase() : "UNKNOWN";
  if (!OBSERVABLE_UI_STATES.includes(uiState)) throw new TypeError("INVALID_UI_STATE");

  const visiblePlayerCount = input.visiblePlayerCount;
  if (visiblePlayerCount !== undefined && visiblePlayerCount !== null &&
      (!Number.isSafeInteger(visiblePlayerCount) || visiblePlayerCount < 0)) {
    throw new TypeError("INVALID_PLAYER_COUNT");
  }

  const timestamp = input.timestamp === undefined ? new Date().toISOString() : input.timestamp;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError("INVALID_TIMESTAMP");
  }

  const roundId = cleanText(input.roundId, 80);
  const visibleLabel = cleanText(input.visibleLabel, 120);

  // Intentionally construct a strict allowlisted record. Unknown input keys are discarded.
  return Object.freeze({
    timestamp: new Date(timestamp).toISOString(),
    roundId,
    uiState,
    visiblePlayerCount: visiblePlayerCount ?? null,
    visibleLabel
  });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("OBSERVATIONS_MUST_BE_ARRAY");
  return rows.map((row) => createObservationRecord(row));
}

export function summarizeObservations(rows) {
  const observations = normalizeRows(rows);
  const stateCounts = Object.create(null);
  for (const state of OBSERVABLE_UI_STATES) stateCounts[state] = 0;
  for (const row of observations) stateCounts[row.uiState] += 1;

  const stateShares = Object.create(null);
  for (const state of OBSERVABLE_UI_STATES) {
    stateShares[state] = observations.length ? stateCounts[state] / observations.length : 0;
  }

  const visibleCounts = observations
    .map((row) => row.visiblePlayerCount)
    .filter((count) => Number.isSafeInteger(count));
  const playerCountSummary = visibleCounts.length
    ? {
        sampleSize: visibleCounts.length,
        min: Math.min(...visibleCounts),
        max: Math.max(...visibleCounts),
        mean: visibleCounts.reduce((sum, count) => sum + count, 0) / visibleCounts.length
      }
    : null;

  return Object.freeze({
    sampleSize: observations.length,
    stateCounts,
    stateShares,
    playerCountSummary,
    // Outcome probabilities cannot be inferred from UI-state observations.
    outcomePrediction: null
  });
}

export function predictNextUiState(rows) {
  const observations = normalizeRows(rows);
  if (observations.length < 2) {
    return Object.freeze({
      state: null,
      confidence: 0,
      transitionSamples: 0,
      basis: "observed-ui-transitions",
      outcomePrediction: null,
      reason: "INSUFFICIENT_TRANSITION_HISTORY"
    });
  }

  const currentState = observations[observations.length - 1].uiState;
  const transitions = new Map();
  let transitionSamples = 0;
  for (let index = 0; index < observations.length - 1; index += 1) {
    if (observations[index].uiState !== currentState) continue;
    const nextState = observations[index + 1].uiState;
    transitions.set(nextState, (transitions.get(nextState) || 0) + 1);
    transitionSamples += 1;
  }

  if (!transitionSamples) {
    return Object.freeze({
      state: null,
      confidence: 0,
      transitionSamples: 0,
      basis: "observed-ui-transitions",
      outcomePrediction: null,
      reason: "NO_MATCHING_PRIOR_TRANSITIONS"
    });
  }

  const [state, count] = [...transitions.entries()].sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];

  return Object.freeze({
    state,
    confidence: count / transitionSamples,
    transitionSamples,
    basis: "observed-ui-transitions",
    outcomePrediction: null,
    reason: "HISTORICAL_UI_TRANSITION_FREQUENCY_NOT_A_GAME_OUTCOME_ODDS"
  });
}

export function detectRepeatedSequences(rows, windowLength = 3) {
  const observations = normalizeRows(rows);
  if (!Number.isSafeInteger(windowLength) || windowLength < 2 || windowLength > 100) {
    throw new RangeError("INVALID_WINDOW_LENGTH");
  }
  if (observations.length < windowLength * 2) return [];

  const groups = new Map();
  for (let start = 0; start <= observations.length - windowLength; start += 1) {
    const sequence = observations.slice(start, start + windowLength).map((row) => row.uiState);
    const key = sequence.join(">");
    const entry = groups.get(key) || { sequence, occurrences: 0, starts: [] };
    entry.occurrences += 1;
    entry.starts.push(start);
    groups.set(key, entry);
  }

  return [...groups.values()]
    .filter((entry) => entry.occurrences > 1)
    .map((entry) => Object.freeze({
      sequence: Object.freeze(entry.sequence),
      occurrences: entry.occurrences,
      starts: Object.freeze(entry.starts)
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.sequence.join(">").localeCompare(b.sequence.join(">")));
}

export function authorizeObservationAction(action, options = {}) {
  const allowedMethods = SAFE_ACTIONS.get(action);
  const method = typeof options.method === "string" ? options.method.toUpperCase() : "";
  const allowed = Boolean(allowedMethods && allowedMethods.has(method));
  return Object.freeze({
    allowed,
    action: cleanText(action, 80) || "UNKNOWN",
    method: cleanText(method, 12) || "UNKNOWN",
    reason: allowed ? "EXPLICIT_READ_ONLY_ALLOWLIST" : "DENY_BY_DEFAULT"
  });
}
