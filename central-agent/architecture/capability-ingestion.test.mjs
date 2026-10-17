import test from "node:test";
import assert from "node:assert/strict";
import { ingestCapabilitySpec, normalizeCapabilityDocument } from "./capability-ingestion.mjs";
import { runIntelCycle } from "../intel-cron.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" }
});

test("OpenAPI ingestion extracts bounded metadata and never enables execution", () => {
  const result = normalizeCapabilityDocument({
    openapi: "3.0.3",
    info: { title: "Example API", version: "1.2" },
    paths: {
      "/items": { get: { operationId: "listItems", summary: "List items", responses: { "200": { description: "ok" } } } },
      "/items/{id}": { delete: { operationId: "deleteItem", summary: "Delete item", responses: { "204": { description: "ok" } } } }
    }
  }, { sourceUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"] });
  assert.equal(result.title, "Example API");
  assert.equal(result.operations.length, 2);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.approvalRequired, true);
  assert.equal(result.operations.some(x => x.method === "DELETE"), true);
  assert.equal(JSON.stringify(result).includes("authorization"), false);
});

test("OpenAPI ingestion rejects unapproved hosts and unsupported documents", () => {
  assert.throws(() => normalizeCapabilityDocument({ openapi: "3.0.0", info: {}, paths: {} }, {
    sourceUrl: "https://evil.example/openapi.json", allowedHosts: ["api.example.com"]
  }), /HOST_NOT_ALLOWLISTED/);
  assert.throws(() => normalizeCapabilityDocument({ swagger: "1.0", paths: {} }, {
    sourceUrl: "https://api.example.com/openapi.json", allowedHosts: ["api.example.com"]
  }), /UNSUPPORTED_API_SCHEMA/);
});

test("remote ingestion blocks redirects and persists only normalized metadata", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) { calls.push({ sql, values }); return { run: async () => ({ success: true }) }; },
        run: async () => ({ success: true })
      };
    }
  };
  const result = await ingestCapabilitySpec("https://api.example.com/openapi.json", {
    CAPABILITY_SPEC_HOSTS: "api.example.com", DB: db
  }, async (_url, init) => {
    assert.equal(init.redirect, "error");
    return json({ openapi: "3.0.3", info: { title: "Example", version: "1" }, paths: { "/health": { get: { summary: "Health", responses: { "200": { description: "ok" } } } } } });
  });
  assert.equal(result.persisted, true);
  assert.equal(result.executionEnabled, false);
  assert.ok(calls.some(call => /capability_snapshots/.test(call.sql)));
});

test("intel cron uses fixed repository endpoint and writes proposal-only telemetry", async () => {
  const writes = [];
  const db = {
    prepare(sql) {
      return { bind(...values) { return { run: async () => { writes.push({ sql, values }); return { success: true }; } }; },
        run: async () => ({ success: true }) };
    }
  };
  const result = await runIntelCycle({ DB: db, GITHUB_REPOSITORY: "lostgodsgods-ops/super-chatty-jarvis" }, {
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://api.github.com/repos/lostgodsgods-ops/super-chatty-jarvis");
      return json({ full_name: "lostgodsgods-ops/super-chatty-jarvis", open_issues_count: 2, stargazers_count: 1, pushed_at: "2026-10-17T00:00:00Z" });
    },
    now: "2026-10-17T00:00:00.000Z"
  });
  assert.equal(result.ok, true);
  assert.equal(result.upgradeExecution, false);
  assert.equal(result.telemetry.repository.open_issues_count, 2);
  assert.ok(writes.some(write => /intel_snapshots/.test(write.sql)));
});
