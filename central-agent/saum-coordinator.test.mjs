import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSaumDelegation, fallbackSaumPlan } from "./saum-coordinator.mjs";

test("Saum accepts only allowlisted downstream roles and bounded inputs", () => {
  const result = normalizeSaumDelegation({
    tasks: [
      { role: "global_scraper", input: "Research current agent orchestration patterns" },
      { role: "testing", input: "Identify test coverage and risks" }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.tasks.map(task => task.role), ["global_scraper", "testing"]);
});

test("Saum rejects self-delegation and unknown roles", () => {
  const result = normalizeSaumDelegation({
    tasks: [{ role: "agent_saum", input: "Run myself recursively" }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "SAUM_ROLE_NOT_ALLOWED");
});

test("Saum rejects empty, oversized, or excessive task plans", () => {
  assert.equal(normalizeSaumDelegation({ tasks: [] }).ok, false);
  assert.equal(normalizeSaumDelegation({ tasks: Array.from({ length: 4 }, () => ({ role: "testing", input: "test" })) }).error, "SAUM_TOO_MANY_TASKS");
  assert.equal(normalizeSaumDelegation({ tasks: [{ role: "testing", input: "x".repeat(2401) }] }).error, "SAUM_TASK_INPUT_INVALID");
});

test("Saum rejects malformed plans and ignores model-supplied permissions", () => {
  assert.equal(normalizeSaumDelegation(null).ok, false);
  const result = normalizeSaumDelegation({
    tasks: [{ role: "testing", input: "Review auth flow", permissions: ["deploy", "bypass_owner"] }]
  });
  assert.equal(result.ok, true);
  assert.equal("permissions" in result.tasks[0], false);
});

test("fallback plan assigns independent research, implementation, and verification work", () => {
  const result = fallbackSaumPlan("Improve Resultron reliability");
  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 3);
  assert.deepEqual(result.tasks.map(task => task.role), ["global_scraper", "api_orchestrator", "testing"]);
  assert.ok(result.tasks.every(task => task.input.includes("Improve Resultron reliability")));
});
