import test from "node:test";
import assert from "node:assert/strict";
import { readOwnerExecutionGate } from "../central-agent/architecture/owner-execution-gate.mjs";

function envWithState(stateJson = null, { fail = false } = {}) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async run() { if (fail) throw new Error("D1 unavailable"); return { meta: { changes: 1 } }; },
          async first() {
            if (fail) throw new Error("D1 unavailable");
            if (sql.includes("SELECT state_json")) return stateJson ? { state_json: stateJson } : null;
            return null;
          }
        };
      }
    }
  };
}

test("missing owner-control row defaults to normal mode with bounded execution", async () => {
  const result = await readOwnerExecutionGate(envWithState());
  assert.equal(result.ok, true);
  assert.equal(result.mode, "normal");
  assert.equal(result.allowOwnerActions, true);
  assert.equal(result.allowBackgroundTasks, true);
});

test("emergency stop blocks owner-triggered and background execution", async () => {
  const result = await readOwnerExecutionGate(envWithState(JSON.stringify({
    mode: "emergency-stop", emergencyStop: true, revision: 2
  })));
  assert.equal(result.ok, true);
  assert.equal(result.allowOwnerActions, false);
  assert.equal(result.allowBackgroundTasks, false);
  assert.equal(result.reason, "EMERGENCY_STOP_ACTIVE");
});

test("owner takeover preserves owner actions but pauses background work", async () => {
  const result = await readOwnerExecutionGate(envWithState(JSON.stringify({
    mode: "owner-takeover", emergencyStop: false, revision: 4
  })));
  assert.equal(result.ok, true);
  assert.equal(result.allowOwnerActions, true);
  assert.equal(result.allowBackgroundTasks, false);
  assert.equal(result.priority, "owner");
});

test("corrupt persisted state fails closed", async () => {
  const result = await readOwnerExecutionGate(envWithState("{not-json"));
  assert.equal(result.ok, false);
  assert.equal(result.allowOwnerActions, false);
  assert.equal(result.allowBackgroundTasks, false);
  assert.equal(result.reason, "OWNER_CONTROL_STATE_CORRUPT");
});

test("missing or unavailable D1 fails closed", async () => {
  const missing = await readOwnerExecutionGate({});
  const unavailable = await readOwnerExecutionGate(envWithState(null, { fail: true }));
  assert.equal(missing.ok, false);
  assert.equal(missing.allowOwnerActions, false);
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.allowBackgroundTasks, false);
});
