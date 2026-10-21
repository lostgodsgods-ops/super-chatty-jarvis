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
async function request(path, auth = true, env = mockEnv()) {
  const headers = auth ? { authorization: "Bearer test-session-token" } : {};
  return worker.fetch(new Request("https://central-agent.test" + path, { method: "GET", headers }), env);
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


test("research status selects only bounded-research-coordinator audit rows", async () => {
  const queries = [];
  const db = {
    prepare(sql) {
      let bindings = [];
      queries.push({ sql, get bindings() { return bindings; } });
      return {
        bind(...values) { bindings = values; return this; },
        async all() {
          if (sql.includes("sqlite_master")) return { results: [
            { name: "research_observations" }, { name: "research_signals" }, { name: "agent_run_audit" }
          ] };
          if (sql.includes("SELECT status, source_count")) {
            assert.match(sql, /agent_id\s*=\s*\?/);
            assert.deepEqual(bindings, ["bounded-research-coordinator"]);
            return { results: [{
              status: "completed", sourceCount: 3, itemCount: 7, errorCount: 0,
              startedAt: "2026-10-21T00:00:00.000Z", completedAt: "2026-10-21T00:00:01.000Z",
              detailsJson: JSON.stringify({ errors: [], warnings: [] })
            }] };
          }
          if (sql.includes("sentiment_label")) return { results: [{ label: "neutral", count: 7, averageScore: 0 }] };
          if (sql.includes("SELECT source, subject, metric")) return { results: [] };
          throw new Error("Unexpected research-status query: " + sql);
        },
        async first() {
          if (sql.includes("AS audits")) return { audits: 10, observations: 7, signals: 0 };
          throw new Error("Unexpected research-status first query: " + sql);
        }
      };
    }
  };
  const env = { ...mockEnv(), DB: db };
  const response = await request("/research/status", true, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.lastRun.status, "completed");
  assert.equal(body.lastRun.errorCount, 0);
  assert.ok(queries.some(query => query.sql.includes("agent_id = ?") && query.bindings[0] === "bounded-research-coordinator"));
});
