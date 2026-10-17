import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";

test("API tool gateway rejects unauthenticated requests before tool execution", async () => {
  let d1Touched = false;
  const response = await worker.fetch(new Request("https://example.test/api/tools", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "integration.status" })
  }), {
    DB: { prepare() { d1Touched = true; throw new Error("must not access D1"); } },
    SESSIONS: { get: async () => null }
  });
  assert.equal(response.status, 401);
  assert.equal(d1Touched, true); // D1 is consulted only to verify the supplied session token.
});

test("authenticated tool capability route reports unavailable integrations honestly", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/tools/capabilities", {
    headers: { authorization: "Bearer test-owner-session" }
  }), {
    DB: { prepare() { return { bind() { return this; }, first: async () => null }; } },
    SESSIONS: { get: async () => "active" }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.capabilities.bindings.vectorize, false);
  assert.equal(body.capabilities.productionDeployment.workflow, "deploy-cloudflare.yml");
});
