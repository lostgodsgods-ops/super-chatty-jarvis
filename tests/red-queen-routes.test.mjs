import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../central-agent/worker.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function makeEnv({ ownerState = null, financeLedger = null, auditFails = false, simulatorEnabled = false } = {}) {
  const kv = new Map();
  const data = { ownerState, financeLedger };
  const env = {
    ROBOT_SIMULATOR_ENABLED: simulatorEnabled ? "true" : "false",
    SESSIONS: {
      async get(key) {
        if (key.startsWith("session:")) return "active";
        return kv.get(key) ?? null;
      },
      async put(key, value) { kv.set(key, value); }
    },
    DB: {
      prepare(sql) {
        let params = [];
        return {
          bind(...values) { params = values; return this; },
          async run() {
            if (auditFails && sql.includes("INSERT INTO central_event_bus_events")) throw new Error("audit store unavailable");
            if (sql.includes("INSERT INTO owner_control_state")) {
              data.ownerState = { state_json: params[0], revision: params[1] };
            } else if (sql.includes("UPDATE owner_control_state")) {
              data.ownerState = { state_json: params[0], revision: params[1] };
            } else if (sql.includes("INSERT INTO finance_sandbox_ledger")) {
              data.financeLedger = { ledger_json: params[0], revision: params[1] };
            } else if (sql.includes("UPDATE finance_sandbox_ledger")) {
              data.financeLedger = { ledger_json: params[0], revision: params[1] };
            }
            return { meta: { last_row_id: 1, changes: 1 } };
          },
          async first() {
            if (sql.includes("FROM owner_sessions")) return null;
            if (sql.includes("FROM owner_control_state")) return data.ownerState;
            if (sql.includes("FROM finance_sandbox_ledger")) return data.financeLedger;
            return null;
          },
          async all() { return { results: [] }; }
        };
      }
    }
  };
  return { env, data };
}

async function send(path, method = "POST", body = {}, env = makeEnv().env, authenticated = false) {
  return worker.fetch(new Request("https://unit.test" + path, {
    method,
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "127.0.0.1",
      ...(authenticated ? { authorization: "Bearer valid-test-session" } : {})
    },
    ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) })
  }), env);
}

async function request(path, method = "POST", body = {}) {
  return send(path, method, body, makeEnv().env, false);
}

test("owner-control mutation rejects requests without a real owner session", async () => {
  const response = await request("/api/owner-control", "POST", { action: "takeover", enabled: true });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("finance sandbox rejects requests without a real owner session", async () => {
  const response = await request("/api/finance/sandbox", "POST", {
    idempotencyKey: "test-1", kind: "credit", amountMinor: 100
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("robotics simulator assessment rejects requests without a real owner session", async () => {
  const response = await request("/api/robotics/simulator/assess", "POST", {
    action: "move-simulated", x: 1, y: 1, speed: 0.2
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("robotics simulator endpoint remains protected by the global owner gate", async () => {
  const response = await request("/api/robotics/simulator/assess", "GET");
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("authenticated owner can persist takeover state only after an audit event", async () => {
  const { env, data } = makeEnv();
  const response = await send("/api/owner-control", "POST", { action: "takeover", enabled: true }, env, true);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.state.mode, "owner-takeover");
  assert.equal(body.audit.recorded, true);
  assert.equal(JSON.parse(data.ownerState.state_json).mode, "owner-takeover");
});

test("owner-control mutation fails closed and does not persist when audit storage is unavailable", async () => {
  const { env, data } = makeEnv({ auditFails: true });
  const response = await send("/api/owner-control", "POST", { action: "takeover", enabled: true }, env, true);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "AUDIT_STORAGE_UNAVAILABLE");
  assert.equal(data.ownerState, null);
});

test("finance sandbox persists simulated credits and refuses live payment requests", async () => {
  const { env, data } = makeEnv();
  const credit = await send("/api/finance/sandbox", "POST", {
    idempotencyKey: "credit-1", kind: "credit", amountMinor: 1000
  }, env, true);
  assert.equal(credit.status, 200);
  assert.equal((await credit.json()).ledger.balanceMinor, 1000);
  assert.equal(JSON.parse(data.financeLedger.ledger_json).livePaymentsEnabled, false);

  const live = await send("/api/finance/sandbox", "POST", {
    idempotencyKey: "live-1", kind: "credit", amountMinor: 1000, livePayment: true
  }, env, true);
  assert.equal(live.status, 400);
  assert.equal((await live.json()).error, "LIVE_PAYMENTS_DISABLED");
});

test("robotics simulator respects persisted emergency stop and never actuates hardware", async () => {
  const { env } = makeEnv({
    ownerState: { state_json: JSON.stringify({ mode: "emergency-stop", emergencyStop: true, revision: 3 }), revision: 3 },
    simulatorEnabled: true
  });
  const response = await send("/api/robotics/simulator/assess", "POST", {
    action: "move-simulated", x: 1, y: 1, speed: 0.2
  }, env, true);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.assessment.reason, "EMERGENCY_STOP_ACTIVE");
  assert.equal(body.assessment.sideEffectsExecuted, false);
});
