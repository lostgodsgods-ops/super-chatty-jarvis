import test from "node:test";
import assert from "node:assert/strict";
import {
  createNeuralLearningState,
  learnVerifiedExample,
  classifyVector
} from "./neural-learning-engine.mjs";

test("new learning state has stable schema and no learned classes", () => {
  const state = createNeuralLearningState();
  assert.equal(state.schemaVersion, "1.0.0");
  assert.deepEqual(state.classes, []);
});

test("only evidence-verified examples update prototype centroids", () => {
  const state = createNeuralLearningState();
  const rejected = learnVerifiedExample(state, {
    label: "network_error", vector: [1, 0, 0],
    evidenceVerified: false, evidenceRef: "run:123"
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "VERIFIED_EVIDENCE_REQUIRED");
  assert.equal(state.classes.length, 0);

  const learned = learnVerifiedExample(state, {
    label: "network_error", vector: [1, 0, 0],
    evidenceVerified: true, evidenceRef: "workflow:123"
  });
  assert.equal(learned.ok, true);
  assert.equal(learned.state.classes[0].sampleCount, 1);
  assert.deepEqual(learned.state.classes[0].centroid, [1, 0, 0]);
  assert.equal(state.classes.length, 0, "learning returns a new state");
});

test("prototype learning updates a normalized running centroid", () => {
  const first = learnVerifiedExample(createNeuralLearningState(), {
    label: "auth_failure", vector: [1, 0], evidenceVerified: true, evidenceRef: "test:1"
  });
  const second = learnVerifiedExample(first.state, {
    label: "auth_failure", vector: [0, 1], evidenceVerified: true, evidenceRef: "test:2"
  });
  assert.equal(second.state.classes[0].sampleCount, 2);
  assert.ok(Math.abs(second.state.classes[0].centroid[0] - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(second.state.classes[0].centroid[1] - Math.SQRT1_2) < 1e-9);
});

test("classification ranks learned patterns and abstains below threshold", () => {
  const learned = learnVerifiedExample(createNeuralLearningState(), {
    label: "latency_spike", vector: [1, 0], evidenceVerified: true, evidenceRef: "probe:7"
  });
  const match = classifyVector(learned.state, [0.99, 0.01]);
  assert.equal(match.status, "MATCH");
  assert.equal(match.label, "latency_spike");
  const unknown = classifyVector(learned.state, [0, 1], { minSimilarity: 0.9 });
  assert.equal(unknown.status, "ABSTAIN");
  assert.equal(unknown.label, null);
});

test("invalid vectors, dimensions, labels and unbounded state fail closed", () => {
  const state = createNeuralLearningState();
  assert.equal(learnVerifiedExample(state, {
    label: "bad label", vector: [1, 0], evidenceVerified: true, evidenceRef: "x"
  }).error, "INVALID_LABEL");
  assert.equal(learnVerifiedExample(state, {
    label: "valid", vector: [1, Infinity], evidenceVerified: true, evidenceRef: "x"
  }).error, "INVALID_VECTOR");
  const one = learnVerifiedExample(state, {
    label: "valid", vector: [1, 0], evidenceVerified: true, evidenceRef: "x"
  });
  assert.equal(learnVerifiedExample(one.state, {
    label: "valid", vector: [1, 0, 0], evidenceVerified: true, evidenceRef: "y"
  }).error, "VECTOR_DIMENSION_MISMATCH");
});

test("evidence references are required and capped", () => {
  const state = createNeuralLearningState();
  assert.equal(learnVerifiedExample(state, {
    label: "valid", vector: [1], evidenceVerified: true, evidenceRef: ""
  }).error, "EVIDENCE_REFERENCE_REQUIRED");
});
