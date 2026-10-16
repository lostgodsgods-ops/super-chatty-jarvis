import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../jarvis/index.html", import.meta.url), "utf8");

test("PWA dashboard includes live D1 telemetry, activity feed, owner session and sourced research", () => {
  for (const id of [
    "auditCount", "observationCount", "signalCount", "researchFeed",
    "ownerLoginForm", "ownerPassword", "ownerSessionStatus", "ownerLogout",
    "factSearchForm", "factQuery", "sourceResults"
  ]) assert.ok(html.includes('id="' + id + '"'), "missing dashboard control: " + id);
  assert.ok(html.includes("/research/status"));
  assert.ok(html.includes("/research/query"));
  assert.ok(html.includes("navigator.serviceWorker.register"));
  assert.ok(html.includes("/api/memory"));
  assert.ok(html.includes("restoreConversationMemory"));
  assert.ok(html.includes("memory_type:\"conversation_state\""));
  assert.ok(html.includes('id="micBtn"'));
  assert.ok(html.includes("connectSentinelEvents"));
  assert.ok(html.includes('base + "/api/events"'));
  assert.ok(html.includes("Authenticated Central Event Bus live"));
});

test("PWA dashboard keeps owner session token in memory rather than persistent browser storage", () => {
  assert.ok(html.includes("ownerToken"));
  assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)\([^)]*(?:token|session|password)/i);
  assert.doesNotMatch(html, /sessionStorage\.(?:setItem|getItem)\([^)]*(?:token|session|password)/i);
});
