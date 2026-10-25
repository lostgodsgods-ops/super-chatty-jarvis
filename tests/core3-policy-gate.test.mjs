import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "../core/policy-gate.mjs";

const base = {
  agentId: "AGENT-46",
  action: "analyze",
  mode: "simulation",
};

test("Core 3.0 permits a registered, allowed, non-privileged analysis action", () => {
  assert.deepEqual(evaluateAction(base), {
    decision: "ALLOW",
    reason: "ACTION_ALLOWED",
    execution: "simulation",
  });
});

test("Core 3.0 denies unknown agents by default", () => {
  assert.equal(evaluateAction({ ...base, agentId: "AGENT-999" }).decision, "DENY");
});

test("Core 3.0 requires explicit Commander approval for privileged actions", () => {
  const result = evaluateAction({ ...base, action: "deploy-production" });
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.reason, "COMMANDER_APPROVAL_REQUIRED");
});

test("Core 3.0 rejects malformed or incomplete Commander approval", () => {
  const result = evaluateAction({
    ...base,
    action: "deploy-production",
    approval: { approved: true, actor: "commander" },
  });
  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "APPROVAL_EVIDENCE_INCOMPLETE");
});

test("Core 3.0 never executes live financial actions; approval only records authorization", () => {
  const result = evaluateAction({
    agentId: "AGENT-24",
    action: "broadcast-live-transaction",
    mode: "live",
    approval: {
      approved: true,
      actor: "commander",
      requestId: "req-test-001",
      reason: "controlled test",
    },
  });
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.reason, "FINANCIAL_EXECUTION_DISABLED");
  assert.equal(result.execution, "simulation-only");
});

test("Core 3.0 never permits agents to erase required audit records", () => {
  const result = evaluateAction({ ...base, action: "erase-required-audit-records" });
  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "ACTION_PROHIBITED");
});
