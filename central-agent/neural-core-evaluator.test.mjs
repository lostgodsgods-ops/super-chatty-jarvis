import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNeuralResult } from "./neural-core-evaluator.mjs";

test("independent evaluator does not trust a model self-declared pass", () => {
  const result = evaluateNeuralResult({
    answer: "Implemented the requested change.",
    selfAssessment: "PASS",
    checks: [],
    evidence: []
  });
  assert.equal(result.verdict, "REVIEW_REQUIRED");
  assert.equal(result.independent, true);
});

test("independent evaluator passes only with explicit successful checks and evidence", () => {
  const result = evaluateNeuralResult({
    answer: "Validated implementation.",
    selfAssessment: "FAIL",
    checks: [
      { id: "unit-tests", status: "passed", evidenceRef: "workflow:612" },
      { id: "policy", status: "passed", evidenceRef: "audit:abc123" }
    ],
    evidence: ["workflow:612", "audit:abc123"]
  });
  assert.equal(result.verdict, "PASS");
  assert.equal(result.checksPassed, 2);
  assert.equal(result.checksFailed, 0);
});

test("independent evaluator fails closed when any required check fails", () => {
  const result = evaluateNeuralResult({
    answer: "Looks good.",
    checks: [
      { id: "unit-tests", status: "passed", evidenceRef: "workflow:612" },
      { id: "security", status: "failed", evidenceRef: "workflow:613" }
    ],
    evidence: ["workflow:612", "workflow:613"]
  });
  assert.equal(result.verdict, "FAIL");
});

test("independent evaluator rejects missing, duplicate, or malformed check evidence", () => {
  const result = evaluateNeuralResult({
    answer: "Done",
    checks: [
      { id: "unit-tests", status: "passed", evidenceRef: "" },
      { id: "unit-tests", status: "passed", evidenceRef: "workflow:612" }
    ],
    evidence: ["workflow:612"]
  });
  assert.equal(result.verdict, "REVIEW_REQUIRED");
  assert.ok(result.reasons.includes("CHECK_EVIDENCE_INVALID"));
  assert.ok(result.reasons.includes("DUPLICATE_CHECK_ID"));
});

test("independent evaluator bounds and sanitizes untrusted evidence", () => {
  const result = evaluateNeuralResult({
    answer: "x".repeat(50000),
    checks: [{ id: "x".repeat(200), status: "passed", evidenceRef: "secret=do-not-leak" }],
    evidence: ["Bearer abc.def.ghi"]
  });
  assert.ok(result.summary.length <= 500);
  assert.equal(JSON.stringify(result).includes("abc.def.ghi"), false);
  assert.equal(JSON.stringify(result).includes("do-not-leak"), false);
});