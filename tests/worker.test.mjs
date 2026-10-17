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
  assert.equal(body.version, "1.4.0");
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
    SESSIONS: { get: async () => "active" }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.registry.executionMode, "planning-and-simulation-only");
  assert.deepEqual(body.registry.missionModules.map(item => item.id), [
    "secure-transit", "subsurface-habitat", "robotics-workforce", "aerospace-research"
  ]);
  assert.equal(body.registry.livePhysicalExecution, false);
  assert.equal(body.registry.quantumMeshImplemented, false);
});
