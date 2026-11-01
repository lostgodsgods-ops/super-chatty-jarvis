import test from "node:test";
import assert from "node:assert/strict";
import { runTaskWithIdentity } from "./task-result-envelope.mjs";
import { createTaskContract } from "./task-runtime.mjs";

const registry = [{ id: "reader", capabilities: ["read:public"], enabled: true }];
function contract() {
  return createTaskContract({
    taskId: "identity-task-1",
    capability: "read:public",
    input: { query: "status" },
    timeoutMs: 100,
    maxRetries: 0
  });
}

test("successful task returns a correlated REDULTRON result envelope", async () => {
  const output = await runTaskWithIdentity(contract(), registry, {
    reader: async () => ({ answer: "ok" })
  }, { buildSha: "abcdef1234567" });
  assert.equal(output.status, "SUCCEEDED");
  assert.equal(output.resultEnvelope.identity.core_id, "redultron.core.primary");
  assert.match(output.resultEnvelope.result.result_id, /^[0-9a-f-]{36}$/i);
  assert.match(output.resultEnvelope.result.execution_id, /^[0-9a-f-]{36}$/i);
  assert.match(output.resultEnvelope.result.trace_id, /^[0-9a-f-]{36}$/i);
  assert.equal(output.resultEnvelope.result.task_id, "identity-task-1");
  assert.equal(output.resultEnvelope.result.status, "PASS");
  assert.equal(output.resultEnvelope.result.verification, "UNVERIFIED");
  assert.equal(output.resultEnvelope.provenance.build_sha, "abcdef1234567");
});

test("blocked task is represented as BLOCKED and is never verified", async () => {
  const output = await runTaskWithIdentity(contract(), [], {});
  assert.equal(output.status, "BLOCKED");
  assert.equal(output.resultEnvelope.result.status, "BLOCKED");
  assert.equal(output.resultEnvelope.result.verification, "UNVERIFIED");
});

test("executor failure is represented as FAIL with failed verification state", async () => {
  const output = await runTaskWithIdentity(contract(), registry, {
    reader: async () => { throw new Error("private upstream detail"); }
  });
  assert.equal(output.status, "FAILED");
  assert.equal(output.resultEnvelope.result.status, "FAIL");
  assert.equal(output.resultEnvelope.result.verification, "FAILED");
  assert.doesNotMatch(JSON.stringify(output.resultEnvelope), /private upstream detail/);
});

test("caller-supplied evaluator claims cannot forge VERIFIED", async () => {
  const output = await runTaskWithIdentity(contract(), registry, {
    reader: async () => ({ answer: "ok" })
  }, {
    evaluatorAttestation: { evaluatorId: "redultron.evidence-evaluator", status: "PASS", evidenceCount: 99 }
  });
  assert.equal(output.resultEnvelope.result.verification, "UNVERIFIED");
});
