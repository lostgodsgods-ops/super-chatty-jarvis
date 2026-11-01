import test from "node:test";
import assert from "node:assert/strict";
import { createLearningState, applyVerifiedFeedback, rankCandidates, summarizeLearningState } from "./adaptive-learning-core.mjs";

test("learning state starts with bounded neutral weights", () => {
  const state = createLearningState(["accuracy", "relevance"]);
  assert.deepEqual(state.weights, { accuracy: 0.5, relevance: 0.5 });
  assert.equal(state.updates, 0);
});

test("only independently verified feedback updates weights", () => {
  const state = createLearningState(["accuracy", "relevance"]);
  const ignored = applyVerifiedFeedback(state, { feature: "accuracy", reward: 1, verification: "UNVERIFIED" });
  assert.equal(ignored.updated, false);
  assert.equal(state.updates, 0);
  const applied = applyVerifiedFeedback(state, { feature: "accuracy", reward: 1, verification: "VERIFIED", evidenceRef: "test://accuracy-1" });
  assert.equal(applied.updated, true);
  assert.ok(state.weights.accuracy > 0.5);
  assert.equal(state.updates, 1);
});

test("feedback is bounded, validated and cannot create unknown features", () => {
  const state = createLearningState(["accuracy"]);
  assert.equal(applyVerifiedFeedback(state, { feature: "accuracy", reward: 100, verification: "VERIFIED", evidenceRef: "test://x" }).updated, false);
  assert.equal(applyVerifiedFeedback(state, { feature: "unknown", reward: 1, verification: "VERIFIED", evidenceRef: "test://x" }).updated, false);
  assert.equal(applyVerifiedFeedback(state, { feature: "accuracy", reward: 1, verification: "VERIFIED" }).updated, false);
  assert.equal(state.updates, 0);
});

test("candidate ranking is deterministic and does not mutate learning state", () => {
  const state = createLearningState(["accuracy", "relevance"]);
  const before = structuredClone(state);
  const ranked = rankCandidates(state, [
    { id: "a", signals: { accuracy: 1, relevance: 0 } },
    { id: "b", signals: { accuracy: 0, relevance: 1 } }
  ]);
  assert.deepEqual(ranked.map(x => x.id), ["a", "b"]);
  assert.deepEqual(state, before);
});

test("learning state summary exposes no raw evidence or private payloads", () => {
  const state = createLearningState(["accuracy"]);
  applyVerifiedFeedback(state, { feature: "accuracy", reward: 1, verification: "VERIFIED", evidenceRef: "internal://opaque-evidence" });
  const summary = summarizeLearningState(state);
  assert.equal(summary.algorithm, "bounded-weighted-feedback-v1");
  assert.equal(summary.updates, 1);
  assert.equal("evidence" in summary, false);
});
