import test from "node:test";
import assert from "node:assert/strict";
import { createAdaptiveStrategyLearner } from "./adaptive-strategy-learning.mjs";

test("unverified outcomes never change strategy learning state", () => {
  const learner = createAdaptiveStrategyLearner();
  const before = learner.snapshot();
  const result = learner.recordOutcome({ strategyId: "plan-a", outcome: "success", verified: false, evidence: "model says pass" });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "VERIFIED_EVIDENCE_REQUIRED");
  assert.deepEqual(learner.snapshot(), before);
});

test("verified outcomes update a bounded strategy score", () => {
  const learner = createAdaptiveStrategyLearner({ learningRate: 0.5 });
  assert.equal(learner.recordOutcome({ strategyId: "plan-a", outcome: "success", verified: true, evidence: "test-run:123" }).accepted, true);
  const state = learner.snapshot().strategies[0];
  assert.equal(state.samples, 1);
  assert.equal(state.score, 0.75);
  assert.equal(state.lastEvidence, "test-run:123");
});

test("ranking prefers strategies with stronger verified outcomes", () => {
  const learner = createAdaptiveStrategyLearner({ learningRate: 1 });
  learner.recordOutcome({ strategyId: "weak", outcome: "failure", verified: true, evidence: "ci:1" });
  learner.recordOutcome({ strategyId: "strong", outcome: "success", verified: true, evidence: "ci:2" });
  assert.deepEqual(learner.rankStrategies().map(item => item.strategyId), ["strong", "weak"]);
});

test("malformed identifiers and evidence are rejected without mutation", () => {
  const learner = createAdaptiveStrategyLearner();
  for (const input of [
    { strategyId: "../unsafe", outcome: "success", verified: true, evidence: "test" },
    { strategyId: "safe", outcome: "success", verified: true, evidence: "" },
    { strategyId: "safe", outcome: "maybe", verified: true, evidence: "test" }
  ]) assert.equal(learner.recordOutcome(input).accepted, false);
  assert.equal(learner.snapshot().strategies.length, 0);
});

test("snapshot is isolated and strategy state is bounded", () => {
  const learner = createAdaptiveStrategyLearner({ maxStrategies: 2 });
  for (const strategyId of ["a", "b"]) learner.recordOutcome({ strategyId, outcome: "success", verified: true, evidence: "test" });
  assert.equal(learner.recordOutcome({ strategyId: "c", outcome: "success", verified: true, evidence: "test" }).reason, "STRATEGY_CAPACITY_REACHED");
  const snapshot = learner.snapshot();
  snapshot.strategies[0].score = 0;
  assert.notEqual(learner.snapshot().strategies[0].score, 0);
});
