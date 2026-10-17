import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../src/worker.mjs";

function makeEnv({ authenticated = false } = {}) {
  const events = [];
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes("SELECT status, expires_at FROM owner_sessions")) return null;
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes("INSERT INTO central_event_bus_events")) {
            events.push({ type: args[0], source: args[1], payload: JSON.parse(args[2] || "{}") });
          }
          return { meta: { changes: 1, last_row_id: events.length } };
        }
      };
    }
  };
  const sessions = {
    async get(key) {
      if (authenticated && key.startsWith("session:")) return "active";
      return null;
    },
    async put() {},
    async delete() {}
  };
  return {
    events,
    env: {
      DB: db,
      SESSIONS: sessions,
      AI: { async run() { throw new Error("AI must not run for mission planning assessment"); } }
    }
  };
}

test("mission assessment rejects unauthenticated requests before assessment or AI execution", async () => {
  const { env, events } = makeEnv();
  const response = await worker.fetch(new Request("https://example.test/api/mission/assess", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ moduleId: "aerospace-research", action: "Compare public orbital concepts", mode: "plan" })
  }), env);

  assert.equal(response.status, 401);
  assert.equal(events.some(event => event.type === "mission.request.assessed"), false);
});

test("authenticated mission planning returns a bounded plan-only result and records an audit event", async () => {
  const { env, events } = makeEnv({ authenticated: true });
  const response = await worker.fetch(new Request("https://example.test/api/mission/assess", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-owner-session",
      "cf-connecting-ip": "203.0.113.11"
    },
    body: JSON.stringify({ moduleId: "aerospace-research", action: "Compare public orbital research concepts", mode: "plan" })
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.status, "PLAN_ONLY");
  assert.equal(body.sideEffectsExecuted, false);
  assert.ok(events.some(event => event.type === "mission.request.assessed" && event.source === "mission-grid"));
});

test("authenticated request cannot enable live mission execution even when approval is claimed", async () => {
  const { env, events } = makeEnv({ authenticated: true });
  const response = await worker.fetch(new Request("https://example.test/api/mission/assess", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-owner-session",
      "cf-connecting-ip": "203.0.113.12"
    },
    body: JSON.stringify({
      moduleId: "robotics-workforce",
      action: "move robot",
      mode: "execute",
      humanApproval: true
    })
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.status, "HUMAN_REVIEW_REQUIRED");
  assert.equal(body.reason, "LIVE_EXECUTION_DISABLED");
  assert.equal(body.sideEffectsExecuted, false);
  assert.ok(events.some(event => event.type === "mission.request.rejected"));
});
