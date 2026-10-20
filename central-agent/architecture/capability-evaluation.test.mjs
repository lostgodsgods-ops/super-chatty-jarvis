import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCapabilityRun } from "./capability-evaluation.mjs";

test("reports PASS only when every check has passing evidence", () => {
  const report = evaluateCapabilityRun({ checks: [
    { id: "unit", status: "PASS", weight: 2, evidence: "ci://unit-42" },
    { id: "auth", status: "PASS", weight: 1, evidence: "ci://auth-42" }
  ] });
  assert.equal(report.status, "PASS");
  assert.equal(report.scorePercent, 100);
  assert.equal(report.untestedCount, 0);
  assert.deepEqual(report.nextActions, []);
});

test("never counts missing evidence as a pass", () => {
  const report = evaluateCapabilityRun({ checks: [
    { id: "unit", status: "PASS", evidence: "" }
  ] });
  assert.equal(report.status, "NOT_TESTED");
  assert.equal(report.scorePercent, 0);
  assert.equal(report.checks[0].status, "NOT_TESTED");
  assert.equal(report.checks[0].code, "MISSING_EVIDENCE");
});

test("a failed check prevents a passing overall report", () => {
  const report = evaluateCapabilityRun({ checks: [
    { id: "unit", status: "PASS", evidence: "ci://unit" },
    { id: "privacy", status: "FAIL", evidence: "ci://privacy", detail: "provider leak" }
  ] });
  assert.equal(report.status, "FAIL");
  assert.equal(report.scorePercent, 50);
  assert.match(report.nextActions[0], /privacy/);
});

test("blocked checks remain distinct from failed checks", () => {
  const report = evaluateCapabilityRun({ checks: [
    { id: "live-provider", status: "BLOCKED", evidence: "run://17", detail: "credential missing" }
  ] });
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.blockedCount, 1);
  assert.match(report.nextActions[0], /live-provider/);
});

test("empty or malformed input is not tested, not a pass", () => {
  assert.equal(evaluateCapabilityRun({ checks: [] }).status, "NOT_TESTED");
  assert.equal(evaluateCapabilityRun(null).status, "NOT_TESTED");
});

test("rejects duplicate check ids and invalid weights deterministically", () => {
  assert.throws(() => evaluateCapabilityRun({ checks: [
    { id: "unit", status: "PASS", evidence: "ci://1" },
    { id: "unit", status: "PASS", evidence: "ci://2" }
  ] }), { code: "DUPLICATE_CHECK_ID" });
  assert.throws(() => evaluateCapabilityRun({ checks: [
    { id: "unit", status: "PASS", weight: 0, evidence: "ci://1" }
  ] }), { code: "INVALID_CHECK_WEIGHT" });
});
