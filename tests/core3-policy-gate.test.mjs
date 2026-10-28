import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "../core/policy-gate.mjs";
import { readFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile(new URL("../config/agent-registry.json", import.meta.url), "utf8")
);

const base = {
  agentId: "AGENT-46",
  action: "analyze",
  mode: "simulation",
};

test("Core 3.0 permits a registered, allowed, non-privileged analysis action", () => {
  assert.deepEqual(evaluateAction(base, registry), {
    decision: "ALLOW",
    reason: "ACTION_ALLOWED",
    execution: "simulation",
  });
});

test("Core 3.0 denies unknown agents by default", () => {
  assert.equal(evaluateAction({ ...base, agentId: "AGENT-999" }, registry).decision, "DENY");
});

test("Core 3.0 requires explicit Commander approval for privileged actions", () => {
  const result = evaluateAction({ ...base, action: "deploy-production" }, registry);
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.reason, "COMMANDER_APPROVAL_REQUIRED");
});

test("Core 3.0 rejects malformed or incomplete Commander approval", () => {
  const result = evaluateAction({
    ...base,
    action: "deploy-production",
    approval: { approved: true, actor: "commander" },
  }, registry);
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
  }, registry);
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.reason, "FINANCIAL_EXECUTION_DISABLED");
  assert.equal(result.execution, "simulation-only");
});

test("Core 3.0 never permits agents to erase required audit records", () => {
  const result = evaluateAction({ ...base, action: "erase-required-audit-records" }, registry);
  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "ACTION_PROHIBITED");
});
