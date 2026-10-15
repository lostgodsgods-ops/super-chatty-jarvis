import test from "node:test";
import assert from "node:assert/strict";
import { listProviderCapabilities, resolveProvider, MODEL_FAMILIES } from "./provider-router.mjs";
import { createMiddlewarePipeline, requireOwnerApproval, enforceBudget } from "./middleware.mjs";
import { listMcpCapabilities, listVectorCapabilities, resolveMcpServer, resolveVectorBackend } from "./integration-registry.mjs";

test("model families are catalogued without claiming AGI readiness", () => {
  assert.ok(MODEL_FAMILIES.includes("agentic-ai"));
  assert.ok(MODEL_FAMILIES.includes("classical-ai"));
});
test("only implemented providers can resolve", () => {
  assert.equal(resolveProvider("workers-ai", { AI: {} }).ok, true);
  assert.equal(resolveProvider("openai", { OPENAI_API_KEY: "configured" }).code, "PROVIDER_ADAPTER_NOT_IMPLEMENTED");
  assert.equal(resolveProvider("gemini", {}).status, 501);
  assert.equal(resolveProvider("workers-ai", {}).status, 503);
  assert.equal(resolveProvider("unknown", {}).status, 400);
});
test("registry distinguishes configured from implemented", () => {
  assert.equal(listProviderCapabilities({ OPENAI_API_KEY: "present" }).find(x => x.id === "openai").status, "not_implemented");
});
test("middleware denies side effects without matching owner approval", async () => {
  const run = createMiddlewarePipeline([requireOwnerApproval]);
  assert.equal((await run({ action: "deploy", sideEffect: true })).code, "OWNER_APPROVAL_REQUIRED");
  assert.equal((await run({ action: "deploy", sideEffect: true, ownerApproval: { approved: true, action: "deploy", nonce: "n" } })).ok, true);
  assert.equal((await run({ action: "summarize", sideEffect: false })).ok, true);
});
test("middleware budget is bounded and fail-closed", async () => {
  const run = createMiddlewarePipeline([enforceBudget]);
  assert.equal((await run({ budget: { maxSteps: 3, stepsUsed: 1 } })).ok, true);
  assert.equal((await run({ budget: { maxSteps: 3, stepsUsed: 3 } })).code, "AGENT_BUDGET_EXHAUSTED");
  assert.equal((await run({})).ok, false);
});
test("MCP and vector integrations stay disabled until configured", () => {
  assert.ok(listMcpCapabilities({}).every(x => x.status === "not_configured" && !x.connectionAttempted));
  assert.ok(listVectorCapabilities({}).every(x => x.status === "not_configured" && !x.connectionAttempted));
  assert.equal(resolveMcpServer("github", {}).status, 503);
  assert.equal(resolveVectorBackend("qdrant", {}).status, 503);
});
test("configured integrations deny execution until adapters exist", () => {
  assert.equal(resolveMcpServer("github", { MCP_GITHUB_URL: "https://example.invalid", MCP_GITHUB_TOKEN: "present" }).status, 501);
  assert.equal(resolveVectorBackend("qdrant", { QDRANT_URL: "https://example.invalid", QDRANT_API_KEY: "present" }).status, 501);
});
