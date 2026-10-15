import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.mjs";

function mockEnv() {
  return {
    DB: {},
    AI: { run: async () => ({ response: "test" }) },
    SEARCH_API_KEY: "test-only",
    SESSIONS: { get: async () => "active" }
  };
}
async function request(path, auth = true) {
  const headers = auth ? { authorization: "Bearer test-session-token" } : {};
  return worker.fetch(new Request("https://central-agent.test" + path, { method: "GET", headers }), mockEnv());
}

test("architecture and integration status routes require owner session", async () => {
  for (const path of ["/architecture/status", "/mcp/status", "/vectors/status"]) {
    const response = await request(path, false);
    assert.equal(response.status, 401, path);
  }
});

test("architecture status route returns explicit layer and provider readiness", async () => {
  const response = await request("/architecture/status");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.layers.length, 7);
  assert.equal(body.providers.find(x => x.id === "workers-ai").status, "available");
  assert.equal(body.providers.find(x => x.id === "gemini").status, "not_implemented");
});

test("MCP and vector status endpoints cannot imply execution is enabled", async () => {
  const mcp = await (await request("/mcp/status")).json();
  const vectors = await (await request("/vectors/status")).json();
  assert.equal(mcp.executionEnabled, false);
  assert.ok(mcp.integrations.every(x => x.connectionAttempted === false));
  assert.equal(vectors.queryEnabled, false);
  assert.ok(vectors.integrations.every(x => x.connectionAttempted === false));
});
