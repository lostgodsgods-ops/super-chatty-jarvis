import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../jarvis/index.html", import.meta.url), "utf8");

test("PWA dashboard includes live D1 telemetry, activity feed, owner session and sourced research", () => {
  for (const id of [
    "auditCount", "observationCount", "signalCount", "researchFeed",
    "ownerLoginForm", "ownerPassword", "ownerSessionStatus", "ownerLogout",
    "ownerPasskeyLogin", "ownerPasskeyRegister", "ownerBiometricLogin", "ownerSetupOpen",
    "factSearchForm", "factQuery", "sourceResults"
  ]) assert.ok(html.includes('id="' + id + '"'), "missing dashboard control: " + id);
  assert.ok(html.includes("/research/status"));
  assert.ok(html.includes("/research/query"));
  assert.ok(html.includes("navigator.serviceWorker.register"));
  assert.ok(html.includes("/api/memory"));
  assert.ok(html.includes("restoreConversationMemory"));
  assert.ok(html.includes("memory_type:\"conversation_state\""));
  assert.ok(html.includes('id="handsFreeBtn"'));
  assert.ok(html.includes('aria-pressed="false"'), "hands-free must start disabled/off until the owner opts in");
  assert.doesNotMatch(html, /id="micBtn"/, "legacy manual microphone button must remain removed");
  assert.ok(html.includes("connectSentinelEvents"));
  assert.ok(html.includes('base + "/api/events"'));
  assert.ok(html.includes("Authenticated Central Event Bus live"));
});

test("PWA dashboard keeps owner session token in memory rather than persistent browser storage", () => {
  assert.ok(html.includes("ownerToken"));
  assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)\([^)]*(?:token|session|password)/i);
  assert.doesNotMatch(html, /sessionStorage\.(?:setItem|getItem)\([^)]*(?:token|session|password)/i);
});


test("PWA exposes three owner sign-in choices and keeps the device verification controls independent", () => {
  assert.ok(html.includes('id="ownerLogin"'));
  assert.ok(html.includes('id="ownerPasskeyLogin"'));
  assert.ok(html.includes('id="ownerBiometricLogin"'));
  assert.ok(html.includes('ownerBiometricLogin.addEventListener("click", signInBiometric)'));
  assert.ok(html.includes("/auth/biometric/login/options"));
  assert.ok(html.includes("/auth/biometric/login/verify"));
  assert.ok(html.includes('ownerPasskeyLogin:$("ownerPasskeyLogin")'));
  assert.ok(html.includes('ownerPasskeyRegister:$("ownerPasskeyRegister")'));
  assert.ok(html.includes('ownerSetupOpen:$("ownerSetupOpen")'));
});


test("PWA gives owners a visible path to the live operations monitor", () => {
  assert.match(html, /id="liveMonitorLink"[^>]*href="\.\/monitor\.html"/);
  assert.match(html, /LIVE OPERATIONS/i);
});

test("live monitor exposes real GitHub workflow and pull-request activity", () => {
  const monitor = readFileSync(new URL("../jarvis/monitor.html", import.meta.url), "utf8");
  assert.ok(monitor.includes('id="workflowFeed"'), "missing workflow activity panel");
  assert.ok(monitor.includes('id="pullRequestFeed"'), "missing pull request activity panel");
  assert.ok(monitor.includes("/actions/runs?per_page="), "workflow feed must use GitHub Actions read API");
  assert.ok(monitor.includes("/pulls?state=open"), "PR feed must use GitHub pull requests read API");
  assert.ok(monitor.includes("NOT CONNECTED"), "task execution timeline must not be fabricated when no durable task feed is connected");
  assert.ok(monitor.includes("failedRuns.length"), "recent workflow failures must affect the monitor status");
});


test("authenticated PWA exposes a readable owner activity timeline without rendering raw event payloads", () => {
  assert.ok(html.includes('id="ownerActivityFeed"'), "missing owner activity timeline");
  assert.ok(html.includes('aria-live="polite"'), "activity updates must be announced accessibly");
  assert.ok(html.includes("appendOwnerActivity(eventName, payload)"), "SSE events must feed the owner timeline");
  assert.ok(html.includes("MAX_OWNER_ACTIVITY_ITEMS"), "timeline history must be bounded");
  assert.ok(html.includes("summarizeOwnerActivity"), "events must be translated into safe summaries");
  assert.ok(html.includes("task.execution.completed"), "task completion events must be recognized");
  assert.ok(html.includes("neural_core.reasoning.completed"), "Brain plan/reason events must be recognized");
  assert.ok(html.includes("OWNER ACTIVITY"), "the timeline must have a visible user-facing label");
});
