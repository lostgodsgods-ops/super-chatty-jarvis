import test from "node:test";
import assert from "node:assert/strict";
import {
  IntegrationError,
  listMcpCapabilities,
  listVectorCapabilities,
  connectMcpAndListTools,
  vectorUpsertQueryReadback
} from "./integration-registry.mjs";

const json = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers }
});

test("capability inventory never claims a live connection", () => {
  const mcp = listMcpCapabilities({ MCP_GITHUB_URL: "https://mcp.example", MCP_GITHUB_TOKEN: "secret" });
  assert.equal(mcp.find(x => x.id === "github").status, "configured_not_verified");
  assert.equal(mcp.find(x => x.id === "github").connectionAttempted, false);
  assert.equal(listVectorCapabilities({})[0].status, "not_configured");
});

test("unknown MCP server fails closed before network access", async () => {
  let called = false;
  await assert.rejects(connectMcpAndListTools("arbitrary", {}, async () => { called = true; }), e => e.code === "UNKNOWN_MCP_SERVER");
  assert.equal(called, false);
});

test("unsafe MCP endpoint fails closed before network access", async () => {
  let called = false;
  await assert.rejects(connectMcpAndListTools("github", {
    MCP_GITHUB_URL: "http://127.0.0.1/private", MCP_GITHUB_TOKEN: "x"
  }, async () => { called = true; }), e => e.code === "UNSAFE_ENDPOINT");
  assert.equal(called, false);
});

test("MCP handshake lists tools but does not execute any tool", async () => {
  const methods = [];
  const result = await connectMcpAndListTools("github", {
    MCP_GITHUB_URL: "https://mcp.example/mcp", MCP_GITHUB_TOKEN: "test-token"
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    methods.push(body.method);
    if (body.method === "initialize") return json({
      jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "mock", version: "1" }, capabilities: {} }
    }, 200, { "mcp-session-id": "session-1" });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/list") return json({
      jsonrpc: "2.0", id: 2, result: { tools: [{ name: "read_file", description: "read only" }] }
    });
    throw new Error("Unexpected method");
  });
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(result.tools[0].name, "read_file");
  assert.equal(result.toolsExecuted, false);
});

test("Pinecone adapter performs upsert and exact-ID vector readback", async () => {
  const calls = [];
  const record = { id: "smoke-test-1", values: [0.25, -0.5], metadata: { purpose: "ci-smoke" } };
  const result = await vectorUpsertQueryReadback("pinecone", {
    PINECONE_INDEX_HOST: "https://index.example", PINECONE_API_KEY: "test-key"
  }, { record }, async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).endsWith("/vectors/upsert")) return json({ upsertedCount: 1 });
    if (String(url).includes("/vectors/fetch?")) return json({ vectors: { [record.id]: { id: record.id, values: [0.25, -0.5] } } });
    throw new Error("Unexpected endpoint");
  });
  assert.equal(result.upsert, "PASS");
  assert.equal(result.readback, "PASS");
  assert.equal(calls.length, 2);
});

test("Qdrant rejects invalid point IDs before network access", async () => {
  let called = false;
  await assert.rejects(vectorUpsertQueryReadback("qdrant", {
    QDRANT_URL: "https://qdrant.example", QDRANT_API_KEY: "test-key", QDRANT_COLLECTION: "memory"
  }, { record: { id: "not-a-qdrant-id", values: [1, 2] } }, async () => { called = true; }),
  e => e.code === "QDRANT_ID_MUST_BE_UUID_OR_UNSIGNED_INTEGER");
  assert.equal(called, false);
});

test("missing vector credentials fail closed", async () => {
  await assert.rejects(vectorUpsertQueryReadback("pinecone", {}, {
    record: { id: "smoke", values: [1] }
  }), e => e instanceof IntegrationError && e.code.startsWith("MISSING_CONFIGURATION:"));
});
