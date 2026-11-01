import test from "node:test";
import assert from "node:assert/strict";
import { runCognitiveCycle, COGNITIVE_NETWORK_VERSION } from "./neural-cognition.mjs";

test("cognitive cycle exposes stable REDULTRON identity and bounded network metadata", () => {
  const result = runCognitiveCycle({ goal: "debug neural memory retrieval", evidence: ["verified memory retrieval test passed"] });
  assert.equal(result.identity.coreId, "redultron.core.primary");
  assert.equal(result.network.version, COGNITIVE_NETWORK_VERSION);
  assert.ok(result.network.nodes.length > 0);
  assert.ok(result.network.nodes.every(node => node.activation >= 0 && node.activation <= 1));
});

test("attention prioritizes relevant modules over unrelated capabilities", () => {
  const result = runCognitiveCycle({ goal: "retrieve verified memory and evaluate evidence", evidence: ["memory test passed", "evidence evaluator verified"] });
  const scores = Object.fromEntries(result.network.nodes.map(node => [node.id, node.activation]));
  assert.ok(scores.memory > scores.robotics);
  assert.ok(scores.evaluation > scores.robotics);
});

test("unverified statements do not count as trusted evidence signals", () => {
  const result = runCognitiveCycle({ goal: "improve system", evidence: ["I think everything passed"] });
  assert.equal(result.evidence.trustedCount, 0);
  assert.equal(result.evidence.verification, "UNVERIFIED");
});

test("input size and node count are bounded", () => {
  assert.throws(() => runCognitiveCycle({ goal: "x".repeat(5001) }), { code: "COGNITIVE_INPUT_TOO_LARGE" });
});
