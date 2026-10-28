import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCapabilityRequest, createCapabilityRequest, listCapabilityRequests } from "./capability-request-queue.mjs";

const catalog = [
  { id: "github", category: "developer-platform", capabilities: ["repositories", "pull-requests"] },
  { id: "tavily", category: "search", capabilities: ["web-search"] }
];

test("normalizer accepts only known tool ids and produces a review-only request", () => {
  const request = normalizeCapabilityRequest({
    goal: "Make the agent verify production health",
    requestedTools: ["github", "tavily", "github"],
    rationale: "Need repository inspection and current public web evidence."
  }, catalog);
  assert.deepEqual(request.requestedTools, ["github", "tavily"]);
  assert.equal(request.status, "pending_owner_review");
  assert.equal(request.executionEnabled, false);
  assert.equal(request.requiresOwnerApproval, true);
});

test("normalizer rejects arbitrary tool ids and URL injection", () => {
  assert.throws(() => normalizeCapabilityRequest({
    goal: "test", requestedTools: ["https://attacker.example"], rationale: "test"
  }, catalog), error => error.code === "CAPABILITY_TOOL_NOT_ALLOWLISTED");
});

test("normalizer bounds and validates user-controlled fields", () => {
  assert.throws(() => normalizeCapabilityRequest({ goal: " ", requestedTools: ["github"], rationale: "why" }, catalog),
    error => error.code === "CAPABILITY_GOAL_REQUIRED");
  assert.throws(() => normalizeCapabilityRequest({ goal: "test", requestedTools: [], rationale: "why" }, catalog),
    error => error.code === "CAPABILITY_TOOLS_REQUIRED");
  assert.throws(() => normalizeCapabilityRequest({ goal: "test", requestedTools: ["github"], rationale: "x".repeat(801) }, catalog),
    error => error.code === "CAPABILITY_RATIONALE_TOO_LONG");
});

test("creating a capability request fails closed without D1", async () => {
  await assert.rejects(
    createCapabilityRequest({}, { goal: "test", requestedTools: ["github"], rationale: "need repository tools" }, catalog),
    error => error.code === "CAPABILITY_REQUEST_STORAGE_UNAVAILABLE"
  );
});

test("listing capability requests fails closed without D1", async () => {
  await assert.rejects(listCapabilityRequests({}, 10), error => error.code === "CAPABILITY_REQUEST_STORAGE_UNAVAILABLE");
});
