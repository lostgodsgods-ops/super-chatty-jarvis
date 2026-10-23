import test from "node:test";
import assert from "node:assert/strict";
import { executeToolForge, listToolForgeTools } from "./architecture/tool-forge.mjs";

function dbMock() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...values) {
          return { async run() { rows.push({ sql, values }); return { success: true }; } };
        },
        async run() { return { success: true }; }
      };
    }
  };
}

test("Tool Forge exposes only the explicit allowlisted read-only search tool", () => {
  const tools = listToolForgeTools();
  assert.deepEqual(tools.map(tool => tool.id), ["live-search"]);
  assert.equal(tools[0].sideEffects, "read-only");
  assert.equal(tools[0].approvalRequired, true);
});

test("Tool Forge rejects unknown tools without invoking an executor", async () => {
  let invoked = false;
  await assert.rejects(
    executeToolForge({ toolId: "arbitrary-fetch", input: {}, approved: true, env: { DB: dbMock() }, execute: async () => { invoked = true; } }),
    error => error.code === "TOOL_NOT_ALLOWLISTED"
  );
  assert.equal(invoked, false);
});

test("Tool Forge requires explicit approval and validates the input schema", async () => {
  const env = { DB: dbMock() };
  await assert.rejects(
    executeToolForge({ toolId: "live-search", input: { query: "latest news" }, approved: false, env, execute: async () => ({ sources: [] }) }),
    error => error.code === "OWNER_APPROVAL_REQUIRED"
  );
  await assert.rejects(
    executeToolForge({ toolId: "live-search", input: { query: "   " }, approved: true, env, execute: async () => ({ sources: [] }) }),
    error => error.code === "INPUT_SCHEMA_INVALID"
  );
});

test("Tool Forge fails closed when durable audit storage is unavailable", async () => {
  let invoked = false;
  await assert.rejects(
    executeToolForge({ toolId: "live-search", input: { query: "latest news" }, approved: true, env: {}, execute: async () => { invoked = true; return { sources: [] }; } }),
    error => error.code === "TOOL_AUDIT_UNAVAILABLE"
  );
  assert.equal(invoked, false);
});

test("Tool Forge executes the allowlisted tool in bounded mode and persists start/result audit records", async () => {
  const DB = dbMock();
  const result = await executeToolForge({
    toolId: "live-search",
    input: { query: "latest India news" },
    approved: true,
    env: { DB },
    execute: async query => ({ provider: "bing-news-rss", sources: [{ title: "News", url: "https://example.com/news", snippet: "Test" }], query })
  });
  assert.equal(result.ok, true);
  assert.equal(result.toolId, "live-search");
  assert.equal(result.executionMode, "allowlisted-read-only");
  assert.equal(result.result.sources.length, 1);
  assert.equal(DB.rows.length, 2);
  assert.match(DB.rows[0].sql, /tool_forge_audit/);
  assert.match(DB.rows[1].sql, /tool_forge_audit/);
});

test("Tool Forge rejects non-HTTP result URLs and records the failed attempt", async () => {
  const DB = dbMock();
  await assert.rejects(
    executeToolForge({
      toolId: "live-search",
      input: { query: "latest India news" },
      approved: true,
      env: { DB },
      execute: async query => ({ provider: "test", sources: [{ title: "bad", url: "javascript:alert(1)" }], query })
    }),
    error => error.code === "TOOL_RESULT_SCHEMA_INVALID"
  );
  assert.equal(DB.rows.length, 2);
});
