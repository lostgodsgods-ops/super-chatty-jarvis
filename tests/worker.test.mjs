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
