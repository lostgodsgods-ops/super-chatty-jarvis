import test from "node:test";
import assert from "node:assert/strict";
import { persistResultEnvelope, readResultEnvelope } from "./result-ledger.mjs";

function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          if (sql.includes("INSERT INTO redultron_execution_results")) {
            const [resultId, ownerScope, executionId, traceId, taskId, coreId, status, verification, createdAt, buildSha, deploymentId, envelopeJson] = this.values;
            if (!rows.has(resultId)) rows.set(resultId, { resultId, ownerScope, executionId, traceId, taskId, coreId, status, verification, createdAt, buildSha, deploymentId, envelopeJson });
            return { success: true, meta: { changes: rows.has(resultId) ? 1 : 0 } };
          }
          throw new Error("UNEXPECTED_WRITE");
        },
        async first() {
          if (sql.includes("FROM redultron_execution_results")) {
            const [ownerScope, traceId] = this.values;
            return [...rows.values()].find(row => row.ownerScope === ownerScope && row.traceId === traceId) || null;
          }
          throw new Error("UNEXPECTED_QUERY");
        }
      };
    }
  };
}

const envelope = {
  identity: { core_id: "redultron.core.primary", version: "3.0.0" },
  result: {
    result_id: "result-001", execution_id: "exec-001", trace_id: "trace-001",
    task_id: "task-001", created_at: "2026-11-02T00:00:00.000Z",
    status: "PASS", verification: "UNVERIFIED", summary: "Task completed",
    evidence: ["task-history:task-001:1:SUCCEEDED"], code: null
  },
  provenance: { source: "task-runtime", build_sha: "abcdef1234567", deployment_id: null }
};

test("persists a bounded result envelope and reads it back within its owner scope", async () => {
  const db = fakeDb();
  const saved = await persistResultEnvelope(db, "owner-1", envelope);
  assert.equal(saved.persisted, true);
  const loaded = await readResultEnvelope(db, "owner-1", "trace-001");
  assert.deepEqual(loaded, envelope);
});

test("duplicate result IDs are idempotent and do not overwrite the original record", async () => {
  const db = fakeDb();
  await persistResultEnvelope(db, "owner-1", envelope);
  const changed = { ...envelope, result: { ...envelope.result, summary: "tampered overwrite" } };
  const saved = await persistResultEnvelope(db, "owner-1", changed);
  assert.equal(saved.duplicate, true);
  assert.equal((await readResultEnvelope(db, "owner-1", "trace-001")).result.summary, "Task completed");
});

test("owner scope is required and cross-owner reads do not disclose records", async () => {
  const db = fakeDb();
  await assert.rejects(() => persistResultEnvelope(db, "", envelope), /OWNER_SCOPE_REQUIRED/);
  await persistResultEnvelope(db, "owner-1", envelope);
  assert.equal(await readResultEnvelope(db, "owner-2", "trace-001"), null);
});

test("invalid or oversized envelopes fail closed before database writes", async () => {
  const db = fakeDb();
  await assert.rejects(() => persistResultEnvelope(db, "owner-1", { ...envelope, result: { ...envelope.result, result_id: "" } }), /RESULT_ENVELOPE_INVALID/);
  const huge = { ...envelope, result: { ...envelope.result, summary: "x".repeat(40000) } };
  await assert.rejects(() => persistResultEnvelope(db, "owner-1", huge), /RESULT_ENVELOPE_TOO_LARGE/);
  assert.equal(db.rows.size, 0);
});

test("missing D1 binding fails closed", async () => {
  await assert.rejects(() => persistResultEnvelope(null, "owner-1", envelope), /D1_BINDING_UNAVAILABLE/);
});
