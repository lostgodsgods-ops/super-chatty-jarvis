import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../central-agent/worker.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function ownerEnv(state) {
  const kv = new Map();
  return {
    DB: {
      prepare(sql) {
        let params = [];
        return {
          bind(...values) { params = values; return this; },
          async run() {
            return { meta: { last_row_id: 1, changes: 1 } };
          },
          async first() {
            if (sql.includes("FROM owner_sessions")) return null;
            if (sql.includes("FROM owner_control_state")) {
              return state ? { state_json: JSON.stringify(state), revision: state.revision || 0 } : null;
            }
            return null;
          },
          async all() { return { results: [] }; }
        };
      }
    },
    SESSIONS: {
      async get(key) {
        if (key.startsWith("session:")) return "active";
        return kv.get(key) ?? null;
      },
      async put(key, value) { kv.set(key, value); }
    }
  };
}

async function post(path, env) {
  return worker.fetch(new Request("https://unit.test" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer valid-test-session",
      "cf-connecting-ip": "127.0.0.1"
    },
    body: JSON.stringify({ tasks: [{ role: "testing", input: "safe test" }] })
  }), env);
}

test("emergency stop blocks authenticated agent execution and records an audit event", async () => {
  const env = ownerEnv({ mode: "emergency-stop", emergencyStop: true, revision: 3 });
  const response = await post("/agents", env);
  assert.equal(response.status, 423);
  const body = await response.json();
  assert.equal(body.executionBlocked, true);
  assert.equal(body.error, "EMERGENCY_STOP_ACTIVE");
});

test("emergency stop blocks authenticated task queue submission before enqueue", async () => {
  const env = ownerEnv({ mode: "emergency-stop", emergencyStop: true, revision: 3 });
  const response = await post("/tasks", env);
  assert.equal(response.status, 423);
  const body = await response.json();
  assert.equal(body.executionBlocked, true);
  assert.equal(body.error, "EMERGENCY_STOP_ACTIVE");
});
