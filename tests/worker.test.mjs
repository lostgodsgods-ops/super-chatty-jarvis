import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";

test("unified Worker serves the NEXUS shell from the ASSETS binding", async () => {
  const response = await worker.fetch(new Request("https://example.test/"), {
    ASSETS: { fetch: async request => new Response("<title>Super Chatty Jarvis · Neural Console</title>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) }
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Neural Console/);
});

test("unified Worker health reports Central Agent without exposing credentials", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "super-chatty-central-agent");
  assert.equal(body.version, "1.4.1");
  assert.equal(JSON.stringify(body).includes("token"), false);
});

test("owner-only policy endpoint rejects unauthenticated requests", async () => {
  const response = await worker.fetch(new Request("https://example.test/policy"), { DB: { prepare() { throw new Error("database should not be queried"); } }, SESSIONS: { get: async () => null } });
  assert.equal(response.status, 401);
});

test("memory bridge rejects unauthenticated requests before reading or writing D1", async () => {
  let databaseTouched = false;
  const response = await worker.fetch(new Request("https://example.test/api/memory"), {
    DB: { prepare() { databaseTouched = true; throw new Error("must not access DB"); } }
  });
  assert.equal(response.status, 401);
  assert.equal(databaseTouched, false);
});

test("unknown routes fail closed when Owner authentication storage is unavailable", async () => {
  const response = await worker.fetch(new Request("https://example.test/unknown"), {});
  assert.equal(response.status, 503);
});


test("Red Queen status rejects unauthenticated requests before exposing the registry", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/red-queen/status"), {
    DB: { prepare() { throw new Error("unauthenticated request must not query D1"); } },
    SESSIONS: { get: async () => null }
  });
  assert.equal(response.status, 401);
});

test("Red Queen status exposes only declared simulation capabilities to an authenticated owner", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/red-queen/status", {
    headers: { authorization: "Bearer test-owner-session" }
  }), {
    DB: { prepare() { return { bind() { return this; }, first: async () => null, run: async () => ({ meta: { last_row_id: 7 } }) }; } },
    SESSIONS: { get: async () => "active", put: async () => {} }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.registry.executionMode, "planning-and-simulation-only");
  assert.deepEqual(body.registry.missionModules.map(item => item.id), [
    "secure-transit", "subsurface-habitat", "robotics-workforce", "aerospace-research"
  ]);
  assert.equal(body.registry.livePhysicalExecution, false);
  assert.equal(body.registry.infrastructure.quantumMeshImplemented, false);
});


test("mission-grid API rejects unauthenticated commands before audit or assessment", async () => {
  let auditWrites = 0;
  const response = await worker.fetch(new Request("https://example.test/api/mission-grid/assess", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ moduleId: "secure-transit", action: "Plan a route", mode: "plan" })
  }), {
    DB: { prepare() { return { bind() { return this; }, first: async () => null, run: async () => { auditWrites++; return { meta: { last_row_id: 1 } }; } }; } },
    SESSIONS: { get: async () => null, put: async () => {} }
  });
  assert.equal(response.status, 401);
  assert.ok(auditWrites > 0, "auth denial should be audited before the protected route is reached");
});

test("mission-grid API returns an authenticated planning-only assessment and records audit", async () => {
  const events = [];
  const response = await worker.fetch(new Request("https://example.test/api/mission-grid/assess", {
    method: "POST",
    headers: { authorization: "Bearer test-owner-session", "content-type": "application/json" },
    body: JSON.stringify({ moduleId: "secure-transit", action: "Plan authorized freight routing", mode: "plan" })
  }), {
    DB: { prepare(sql) {
      let boundArgs = [];
      return {
        bind(...args) { boundArgs = args; return this; },
        first: async () => null,
        run: async () => {
          if (sql.includes("INSERT INTO central_event_bus_events")) events.push({ sql, args: boundArgs });
          return { meta: { last_row_id: events.length || 1 } };
        }
      };
    } },
    SESSIONS: { get: async () => "active", put: async () => {} }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.assessment.status, "PLAN_ONLY");
  assert.equal(body.assessment.sideEffectsExecuted, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].args[0], "mission_grid.request.assessed");
});

test("mission-grid API fails closed for live execution requests even if authenticated", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/mission-grid/assess", {
    method: "POST",
    headers: { authorization: "Bearer test-owner-session", "content-type": "application/json" },
    body: JSON.stringify({ moduleId: "robotics-workforce", action: "Move a live robot", mode: "execute" })
  }), {
    DB: { prepare() { return { bind() { return this; }, first: async () => null, run: async () => ({ meta: { last_row_id: 1 } }) }; } },
    SESSIONS: { get: async () => "active", put: async () => {} }
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.assessment.reason, "LIVE_EXECUTION_DISABLED");
});

test("mission-grid API fails closed when the audit store is unavailable", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/mission-grid/assess", {
    method: "POST",
    headers: { authorization: "Bearer test-owner-session", "content-type": "application/json" },
    body: JSON.stringify({ moduleId: "aerospace-research", action: "Compare public research concepts", mode: "simulate" })
  }), {
    DB: { prepare() { return { bind() { return this; }, first: async () => null, run: async () => { throw new Error("D1 unavailable"); } }; } },
    SESSIONS: { get: async () => "active", put: async () => {} }
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "AUDIT_STORAGE_UNAVAILABLE");
});


test("persistent learning GET and POST reject unauthenticated requests before touching D1", async () => {
  for (const method of ["GET", "POST"]) {
    let databaseTouched = false;
    const init = method === "POST"
      ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify({}) }
      : { method };
    const response = await worker.fetch(new Request("https://example.test/api/learning/knowledge?q=private", init), {
      DB: { prepare() { databaseTouched = true; throw new Error("unauthenticated learning request must not touch D1"); } },
      SESSIONS: { get: async () => null }
    });
    assert.equal(response.status, 401, `${method} must require owner authentication`);
    assert.equal(databaseTouched, false, `${method} must not touch D1 before authentication`);
  }
});
