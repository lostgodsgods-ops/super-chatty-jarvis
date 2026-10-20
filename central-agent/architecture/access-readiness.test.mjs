import { buildRedQueenStatus } from "./red-queen-registry.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildAccessReadiness } from "./access-readiness.mjs";

test("access readiness reports missing services without exposing credential values", () => {
  const report = buildAccessReadiness({
    TAVILY_API_KEY: "never-return-this-secret",
    DB: {},
    SESSIONS: {}
  });
  assert.equal(report.schemaVersion, "1.0");
  assert.equal(report.overallStatus, "PARTIAL");
  assert.ok(report.services.some(item => item.id === "web-research" && item.status === "CONFIGURED"));
  assert.ok(report.services.some(item => item.id === "owner-data" && item.status === "CONFIGURED"));
  assert.ok(report.services.some(item => item.id === "github-automation" && item.status === "MISSING"));
  assert.equal(JSON.stringify(report).includes("never-return-this-secret"), false);
});

test("missing or malformed environment never grants a capability", () => {
  const report = buildAccessReadiness(null);
  assert.equal(report.overallStatus, "BLOCKED");
  assert.ok(report.services.every(item => ["MISSING", "PARTIAL"].includes(item.status)));
});

test("complete configuration is reported as configured, not as proof of live reachability", () => {
  const report = buildAccessReadiness({
    AI: {},
    DB: {},
    SESSIONS: {},
    JARVIS_KV: {},
    TAVILY_API_KEY: "configured",
    AGENT_GATEWAY_TOKEN: "configured",
    MCP_GITHUB_URL: "https://mcp.example.com",
    MCP_GITHUB_TOKEN: "configured",
    PINECONE_INDEX_HOST: "https://index.example.com",
    PINECONE_API_KEY: "configured",
    SCHEDULED_TASKS_ENABLED: true
  });
  assert.equal(report.services.find(item => item.id === "web-research").status, "CONFIGURED");
  assert.equal(report.services.find(item => item.id === "github-automation").status, "CONFIGURED");
  assert.equal(report.services.find(item => item.id === "vector-memory").status, "CONFIGURED");
  assert.equal(report.services.find(item => item.id === "scheduled-work").status, "CONFIGURED");
  assert.equal(report.reachabilityVerified, false);
});

test("credential presence alone does not claim broad phone or physical access", () => {
  const report = buildAccessReadiness({
    AI: {},
    DB: {},
    SESSIONS: {},
    TAVILY_API_KEY: "configured",
    AGENT_GATEWAY_TOKEN: "configured"
  });
  assert.equal(report.deviceControl.status, "NOT_GRANTED");
  assert.equal(report.physicalActuation.status, "DISABLED");
});

test("owner status projection includes the read-only access readiness report", () => {
  const status = buildRedQueenStatus({ DB: {}, SESSIONS: {}, TAVILY_API_KEY: "private-value" });
  assert.equal(status.accessReadiness.services.find(item => item.id === "owner-data").status, "CONFIGURED");
  assert.equal(status.accessReadiness.services.find(item => item.id === "web-research").status, "CONFIGURED");
  assert.equal(JSON.stringify(status.accessReadiness).includes("private-value"), false);
  assert.equal(status.accessReadiness.deviceControl.status, "NOT_GRANTED");
});
