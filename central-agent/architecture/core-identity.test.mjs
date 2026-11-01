import test from "node:test";
import assert from "node:assert/strict";
import { buildCoreIdentity, buildResultEnvelope } from "./core-identity.mjs";

test("core identity is stable and never acts as an authorization credential", () => {
  const identity = buildCoreIdentity({ version: "3.0.0", buildSha: "abc123" });
  assert.equal(identity.core_id, "redultron.core.primary");
  assert.equal(identity.name, "REDULTRON");
  assert.equal(identity.build_sha, "abc123");
  assert.equal(identity.authorization, undefined);
});

test("each emitted result carries independent result, execution and trace identifiers", () => {
  const envelope = buildResultEnvelope({
    ids: { resultId: "r-1", executionId: "e-1", traceId: "t-1" },
    clock: () => "2026-11-01T10:00:00.000Z",
    status: "PASS",
    evidence: ["workflow:123/job:456"],
    provenance: { source: "task-runtime", buildSha: "abc123" }
  });
  assert.equal(envelope.result.result_id, "r-1");
  assert.equal(envelope.result.execution_id, "e-1");
  assert.equal(envelope.result.trace_id, "t-1");
  assert.equal(envelope.result.verification, "UNVERIFIED");
  assert.equal(envelope.result.status, "PASS");
});

test("a PASS without evidence is downgraded and cannot be marked verified", () => {
  const envelope = buildResultEnvelope({
    ids: { resultId: "r-2", executionId: "e-2", traceId: "t-2" },
    status: "PASS",
    evidence: []
  });
  assert.equal(envelope.result.status, "NOT_TESTED");
  assert.equal(envelope.result.verification, "UNVERIFIED");
  assert.equal(envelope.result.code, "MISSING_EVIDENCE");
});

test("verification requires a structured evaluator attestation and evidence", () => {
  const base = {
    ids: { resultId: "r-3", executionId: "e-3", traceId: "t-3" },
    status: "PASS",
    evidence: ["test-report:abc"],
    evaluatorAttestation: { evaluatorId: "redultron.evidence-evaluator", status: "PASS", evidenceCount: 1 }
  };
  assert.equal(buildResultEnvelope(base).result.verification, "VERIFIED");
  assert.equal(buildResultEnvelope({ ...base, evaluatorAttestation: { evaluatorId: "model", status: "PASS", evidenceCount: 1 } }).result.verification, "UNVERIFIED");
});

test("sensitive-looking evidence and summaries are redacted before publication", () => {
  const envelope = buildResultEnvelope({
    ids: { resultId: "r-4", executionId: "e-4", traceId: "t-4" },
    status: "FAIL",
    summary: "Authorization: Bearer abc.def.ghi",
    evidence: ["token=secret-value", "commit:abc123"]
  });
  assert.doesNotMatch(envelope.result.summary, /abc\.def\.ghi/);
  assert.doesNotMatch(JSON.stringify(envelope.result.evidence), /secret-value/);
  assert.ok(envelope.result.evidence.includes("[REDACTED]"));
});

test("malformed IDs and statuses fail closed", () => {
  assert.throws(() => buildResultEnvelope({ ids: {}, status: "PASS" }), /RESULT_IDENTITY_INVALID/);
  assert.throws(() => buildResultEnvelope({
    ids: { resultId: "r", executionId: "e", traceId: "t" }, status: "MAGIC"
  }), /RESULT_STATUS_INVALID/);
});
