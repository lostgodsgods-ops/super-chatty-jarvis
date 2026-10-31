import test from "node:test";
import assert from "node:assert/strict";
import { createNeuralCore, NEURAL_CORE_VERSION } from "./neural-core.mjs";

test("neural core exposes bounded capabilities without exposing provider secrets", () => {
  const core = createNeuralCore({
    env: { OPENAI_API_KEY: "never-return-this-secret" },
    complete: async () => ({ ok: true, provider: "openai", model: "test-model", text: "ok" })
  });
  const status = core.inspect();
  assert.equal(status.version, NEURAL_CORE_VERSION);
  assert.equal(status.mode, "reasoning-orchestrator");
  assert.equal(status.providers.find(item => item.id === "openai").configured, true);
  assert.equal(JSON.stringify(status).includes("never-return-this-secret"), false);
});

test("neural core runs bounded reasoning and attaches verified memory context", async () => {
  let completionInput;
  const core = createNeuralCore({
    env: {},
    searchMemory: async (_db, query) => ({ ok: true, records: [{
      title: "Known fix", problem: "A test failed", solution: "Validate the input",
      testSummary: "12 tests passed", testEvidence: ["run 12 PASS"], sources: [{url:"https://example.test"}], status: "verified"
    }] }),
    complete: async input => { completionInput = input; return { ok: true, provider: "mock", model: "mock-v1", text: "Plan ready" }; }
  });
  const result = await core.reason({
    prompt: "Review this bounded engineering task",
    provider: "openai",
    memoryQuery: "known fix"
  }, { DB: {} });
  assert.equal(result.ok, true);
  assert.equal(result.text, "Plan ready");
  assert.equal(result.memory.recordsUsed, 1);
  assert.equal(result.memory.status, "available");
  assert.match(completionInput.prompt, /Verified memory context/);
  assert.match(completionInput.prompt, /Validate the input/);
});

test("neural core rejects unbounded or malformed prompts before provider dispatch", async () => {
  let called = false;
  const core = createNeuralCore({ complete: async () => { called = true; return {ok:true,text:"x"}; } });
  await assert.rejects(() => core.reason({ prompt: " " }), { code: "NEURAL_CORE_INVALID_PROMPT" });
  await assert.rejects(() => core.reason({ prompt: "x".repeat(12001) }), { code: "NEURAL_CORE_PROMPT_TOO_LARGE" });
  assert.equal(called, false);
});

test("neural core fails closed when provider is unavailable", async () => {
  const core = createNeuralCore({ complete: async () => { const error = new Error("down"); error.code = "PROVIDER_UNAVAILABLE"; throw error; } });
  await assert.rejects(() => core.reason({ prompt: "hello", provider: "openai" }), { code: "PROVIDER_UNAVAILABLE" });
});

test("memory retrieval failure does not silently claim memory was used", async () => {
  const core = createNeuralCore({
    searchMemory: async () => ({ ok: false, error: "LEARNING_STORAGE_UNAVAILABLE" }),
    complete: async () => ({ ok: true, provider: "mock", model: "mock-v1", text: "answer" })
  });
  const result = await core.reason({ prompt: "hello", provider: "openai", memoryQuery: "old issue" }, { DB: {} });
  assert.equal(result.ok, true);
  assert.equal(result.memory.recordsUsed, 0);
  assert.equal(result.memory.status, "unavailable");
});
