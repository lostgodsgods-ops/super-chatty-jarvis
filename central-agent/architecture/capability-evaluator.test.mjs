import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCapabilityReadiness } from "./capability-evaluator.mjs";

const providers = [
  { id: "workers-ai", families: ["llm", "slm"], implemented: true, configured: true },
  { id: "tavily", families: ["search"], implemented: true, configured: false },
  { id: "claude", families: ["llm", "vlm"], implemented: false, configured: false }
];

test("readiness marks configured implemented capabilities ready", () => {
  const result = evaluateCapabilityReadiness({ requiredCapabilities: ["llm"], providers });
  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.readyCount, 1);
  assert.equal(result.capabilities[0].status, "ready");
  assert.deepEqual(result.blockers, []);
});

test("readiness distinguishes missing, unconfigured, and unimplemented capabilities", () => {
  const result = evaluateCapabilityReadiness({
    requiredCapabilities: ["search", "vlm", "robotics"],
    providers
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.capabilities.map(item => item.status), [
    "not_configured", "not_implemented", "missing"
  ]);
  assert.equal(result.blockers.length, 3);
  assert.match(result.capabilities[0].nextStep, /configure/i);
  assert.match(result.capabilities[1].nextStep, /adapter/i);
  assert.match(result.capabilities[2].nextStep, /register/i);
});

test("duplicate requirements are deduplicated and output order is deterministic", () => {
  const result = evaluateCapabilityReadiness({
    requiredCapabilities: ["search", "llm", "search", "llm"],
    providers
  });
  assert.deepEqual(result.capabilities.map(item => item.capability), ["search", "llm"]);
});

test("invalid and oversized input fails closed without throwing", () => {
  assert.deepEqual(
    evaluateCapabilityReadiness({ requiredCapabilities: "llm", providers }),
    { ok: false, ready: false, code: "INVALID_INPUT", capabilities: [], blockers: [] }
  );
  const tooMany = evaluateCapabilityReadiness({
    requiredCapabilities: Array.from({ length: 21 }, (_, i) => "cap-" + i),
    providers
  });
  assert.equal(tooMany.code, "INPUT_LIMIT_EXCEEDED");
  assert.equal(tooMany.ready, false);
});

test("malformed provider records are ignored rather than treated as capability", () => {
  const result = evaluateCapabilityReadiness({
    requiredCapabilities: ["llm"],
    providers: [{ id: "spoof", families: "llm", implemented: true, configured: true }]
  });
  assert.equal(result.ready, false);
  assert.equal(result.capabilities[0].status, "missing");
});

test("empty requirements cannot produce a false ready result", () => {
  const result = evaluateCapabilityReadiness({ requiredCapabilities: [], providers });
  assert.equal(result.ok, false);
  assert.equal(result.ready, false);
  assert.equal(result.code, "NO_REQUIREMENTS");
  assert.deepEqual(result.capabilities, []);
  assert.deepEqual(result.blockers, []);
});


test("sparse requirement and provider-family arrays fail closed", () => {
  const sparseRequirements = new Array(1);
  const requirementsResult = evaluateCapabilityReadiness({
    requiredCapabilities: sparseRequirements,
    providers
  });
  assert.equal(requirementsResult.ok, false);
  assert.equal(requirementsResult.ready, false);
  assert.equal(requirementsResult.code, "INVALID_INPUT");

  const sparseFamilies = new Array(1);
  const providerResult = evaluateCapabilityReadiness({
    requiredCapabilities: ["llm"],
    providers: [{ id: "sparse", families: sparseFamilies, implemented: true, configured: true }]
  });
  assert.equal(providerResult.ready, false);
  assert.equal(providerResult.capabilities[0].status, "missing");
});
