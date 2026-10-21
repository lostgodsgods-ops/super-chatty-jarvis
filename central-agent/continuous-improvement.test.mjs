import test from "node:test";
import assert from "node:assert/strict";
import { buildImprovementProposals, runContinuousImprovementCycle } from "./continuous-improvement.mjs";

test("creates bounded proposals only from repeated, explicit failure evidence", () => {
  const proposals = buildImprovementProposals([
    { event_type: "agent_run_failed", error_code: "PROVIDER_TIMEOUT", module: "live-search", created_at: "2026-10-21T00:00:00.000Z" },
    { event_type: "agent_run_failed", error_code: "PROVIDER_TIMEOUT", module: "live-search", created_at: "2026-10-21T00:01:00.000Z" },
    { event_type: "agent_run_failed", error_code: "UNKNOWN", module: "voice", created_at: "2026-10-21T00:02:00.000Z" }
  ]);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].signal, "PROVIDER_TIMEOUT");
  assert.equal(proposals[0].evidenceCount, 2);
  assert.equal(proposals[0].action, "review_and_test");
  assert.equal(proposals[0].requiresOwnerApproval, true);
  assert.equal(proposals[0].upgradeExecution, false);
});

test("caps proposal output and ignores malformed or low-confidence telemetry", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    event_type: "agent_run_failed",
    error_code: "ERROR_" + i,
    module: "module-" + i,
    created_at: "2026-10-21T00:00:00.000Z"
  }));
  rows.push({ event_type: "agent_run_failed", error_code: "", module: "x" });
  assert.ok(buildImprovementProposals(rows).length <= 3);
});

test("fails closed without durable storage and never attempts an upgrade", async () => {
  const result = await runContinuousImprovementCycle({});
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "D1_UNAVAILABLE");
  assert.equal(result.upgradeExecution, false);
});

test("records a proposal cycle as audit-only and does not mutate owner execution controls", async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              if (sql.includes("agent_run_audit")) return { results: [
                { event_type: "agent_run_failed", error_code: "PROVIDER_TIMEOUT", module: "live-search", created_at: "2026-10-21T00:00:00.000Z" },
                { event_type: "agent_run_failed", error_code: "PROVIDER_TIMEOUT", module: "live-search", created_at: "2026-10-21T00:01:00.000Z" }
              ] };
              return { results: [] };
            },
            async run() { statements.push({ sql, values }); return { success: true }; }
          };
        },
        async run() { statements.push({ sql, values: [] }); return { success: true }; }
      };
    }
  };
  const result = await runContinuousImprovementCycle({ DB: db });
  assert.equal(result.ok, true);
  assert.equal(result.status, "proposals-recorded");
  assert.equal(result.proposalCount, 1);
  assert.equal(result.upgradeExecution, false);
  assert.ok(statements.some(item => item.sql.includes("continuous_improvement_audit")));
  assert.ok(!statements.some(item => /UPDATE\s+owner_control_state/i.test(item.sql)));
});
