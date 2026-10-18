import test from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_MODULES, getPlatformModule, getPlatformModuleSummary } from "../central-agent/architecture/platform-module-registry.mjs";

test("platform registry lists the complete known module families", () => {
  const ids = new Set(PLATFORM_MODULES.map(module => module.id));
  for (const id of [
    "owner-control", "chat-core", "voice", "memory", "knowledge-research",
    "provider-router", "security-sentinel", "agent-orchestration",
    "scheduled-intel", "pwa-notifications", "finance-sandbox",
    "robotics-iot", "backup-recovery", "android-accessibility"
  ]) assert.ok(ids.has(id), `missing module: ${id}`);
});

test("registry does not describe planned or unverified modules as production-ready", () => {
  for (const module of PLATFORM_MODULES) {
    assert.ok(["implemented", "partial", "planned", "blocked", "unverified"].includes(module.status));
    if (module.status !== "implemented") assert.notEqual(module.productionVerified, true);
  }
});

test("module lookup rejects unknown identifiers", () => {
  assert.equal(getPlatformModule("not-a-real-module"), null);
});

test("summary counts module statuses consistently", () => {
  const summary = getPlatformModuleSummary();
  assert.equal(summary.total, PLATFORM_MODULES.length);
  assert.equal(summary.total, Object.values(summary.byStatus).reduce((sum, count) => sum + count, 0));
});
