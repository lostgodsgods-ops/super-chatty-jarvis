/**
 * Evidence-gated adaptive strategy scoring for REDULTRON.
 *
 * A bounded online-learning primitive, not a neural network or model trainer.
 * Only independently verified outcomes update scores. It ranks strategies;
 * it never grants permissions, executes tools, or mutates infrastructure.
 */
const DEFAULT_LEARNING_RATE = 0.2;
const DEFAULT_MAX_STRATEGIES = 64;
const MAX_ID_LENGTH = 80;
const MAX_EVIDENCE_LENGTH = 300;

function rejection(reason) {
  return Object.freeze({ accepted: false, reason });
}

function validId(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value);
}

function cleanEvidence(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_EVIDENCE_LENGTH)
    : "";
}

export function createAdaptiveStrategyLearner(options = {}) {
  const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
  const maxStrategies = options.maxStrategies ?? DEFAULT_MAX_STRATEGIES;
  if (typeof learningRate !== "number" || !Number.isFinite(learningRate) ||
      learningRate <= 0 || learningRate > 1) {
    throw new TypeError("LEARNING_RATE_OUT_OF_RANGE");
  }
  if (!Number.isInteger(maxStrategies) || maxStrategies < 1 || maxStrategies > 256) {
    throw new TypeError("MAX_STRATEGIES_OUT_OF_RANGE");
  }

  const strategies = new Map();

  function recordOutcome(input = {}) {
    if (!validId(input.strategyId)) return rejection("INVALID_STRATEGY_ID");
    if (input.outcome !== "success" && input.outcome !== "failure") return rejection("INVALID_OUTCOME");
    const evidence = cleanEvidence(input.evidence);
    if (input.verified !== true || !evidence) return rejection("VERIFIED_EVIDENCE_REQUIRED");

    const previous = strategies.get(input.strategyId);
    if (!previous && strategies.size >= maxStrategies) return rejection("STRATEGY_CAPACITY_REACHED");

    const signal = input.outcome === "success" ? 1 : 0;
    const nextScore = previous
      ? previous.score + learningRate * (signal - previous.score)
      : 0.5 + learningRate * (signal - 0.5);
    const next = Object.freeze({
      strategyId: input.strategyId,
      score: Math.round(nextScore * 10000) / 10000,
      samples: (previous?.samples || 0) + 1,
      successes: (previous?.successes || 0) + (signal ? 1 : 0),
      failures: (previous?.failures || 0) + (signal ? 0 : 1),
      lastEvidence: evidence
    });
    strategies.set(input.strategyId, next);
    return Object.freeze({
      accepted: true,
      strategyId: next.strategyId,
      score: next.score,
      samples: next.samples
    });
  }

  function rankStrategies() {
    return Array.from(strategies.values())
      .sort((a, b) => b.score - a.score || b.samples - a.samples || a.strategyId.localeCompare(b.strategyId))
      .map(item => Object.freeze({ ...item }));
  }

  function snapshot() {
    return Object.freeze({
      schemaVersion: "1.0.0",
      learningMode: "verified-outcome-exponential-moving-average",
      modelTraining: false,
      permissionChanges: false,
      strategyCount: strategies.size,
      strategies: Object.freeze(rankStrategies())
    });
  }

  return Object.freeze({ recordOutcome, rankStrategies, snapshot });
}
