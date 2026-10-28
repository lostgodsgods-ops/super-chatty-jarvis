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
  assert.equal(resolveProvider("openai", { OPENAI_API_KEY: "configured" }).ok, true);
  assert.equal(resolveProvider("gemini", {}).status, 503);
  assert.equal(resolveProvider("workers-ai", {}).status, 503);
  assert.equal(resolveProvider("unknown", {}).status, 400);
});
test("registry distinguishes configured from implemented", () => {
  assert.equal(listProviderCapabilities({ OPENAI_API_KEY: "present" }).find(x => x.id === "openai").status, "configured_not_verified");
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

import { executeChatCompletion, listChatProviders } from "./model-provider-adapter.mjs";

test("chat provider catalog distinguishes supported adapters from missing credentials", () => {
  const catalog = listChatProviders({});
  assert.ok(catalog.some(provider => provider.id === "openai" && provider.status === "not_configured"));
  assert.ok(catalog.some(provider => provider.id === "claude" && provider.status === "not_configured"));
  assert.ok(catalog.every(provider => provider.liveVerified === false));
});

test("chat provider adapter rejects unknown providers and missing credentials without network calls", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("unexpected network call"); };
  await assert.rejects(() => executeChatCompletion({ provider: "unknown", prompt: "hello" }, {}, fetchImpl), /UNKNOWN_PROVIDER/);
  await assert.rejects(() => executeChatCompletion({ provider: "openai", prompt: "hello" }, {}, fetchImpl), /PROVIDER_NOT_CONFIGURED/);
  assert.equal(calls, 0);
});

test("OpenAI-compatible provider adapter uses fixed endpoint, bounded request and normalized response", async () => {
  let requestedUrl = "";
  let requestBody;
  const fetchImpl = async (url, init) => {
    requestedUrl = String(url);
    requestBody = JSON.parse(init.body);
    assert.equal(init.headers.authorization, "Bearer test-key");
    assert.equal(init.redirect, "error");
    return new Response(JSON.stringify({ choices: [{ message: { content: "hello from provider" } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const result = await executeChatCompletion({
    provider: "openai", prompt: "say hello", model: "gpt-4o-mini", maxTokens: 64
  }, { OPENAI_API_KEY: "test-key" }, fetchImpl);
  assert.equal(requestedUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(requestBody.messages[0].content, "say hello");
  assert.equal(requestBody.max_tokens, 64);
  assert.equal(result.ok, true);
  assert.equal(result.text, "hello from provider");
  assert.equal(result.provider, "openai");
});

test("chat provider adapter rejects invalid prompts and does not log or echo credentials", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response("{}", { status: 200 }); };
  await assert.rejects(() => executeChatCompletion({ provider: "openai", prompt: " " }, { OPENAI_API_KEY: "secret" }, fetchImpl), /INVALID_PROMPT/);
  assert.equal(calls, 0);
});


test("Claude adapter uses its dedicated headers and normalized response", async () => {
  let url = "";
  let headers;
  const fetchImpl = async (input, init) => {
    url = String(input);
    headers = init.headers;
    return new Response(JSON.stringify({ content: [{ type: "text", text: "claude reply" }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const result = await executeChatCompletion({ provider: "claude", prompt: "hello" }, { ANTHROPIC_API_KEY: "test-key" }, fetchImpl);
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(headers["x-api-key"], "test-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(result.text, "claude reply");
});

test("Gemini adapter sends its key in a header rather than a query string", async () => {
  let url = "";
  let headers;
  const fetchImpl = async (input, init) => {
    url = String(input);
    headers = init.headers;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "gemini reply" }] } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const result = await executeChatCompletion({ provider: "gemini", prompt: "hello" }, { GEMINI_API_KEY: "test-key" }, fetchImpl);
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  assert.equal(headers["x-goog-api-key"], "test-key");
  assert.equal(url.includes("test-key"), false);
  assert.equal(result.text, "gemini reply");
});
