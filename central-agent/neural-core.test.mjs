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


test("neural core creates a validated non-executing structured plan", async () => {
  let completionInput;
  const core = createNeuralCore({
    complete: async input => {
      completionInput = input;
      return {
        ok: true, provider: "mock", model: "mock-plan-v1",
        text: JSON.stringify({
          goal: "Review a repository change",
          taskType: "coding",
          steps: [
            { id: "inspect", description: "Inspect source and tests", dependsOn: [], capability: "repo:read", acceptanceCriteria: ["Relevant files identified"] },
            { id: "verify", description: "Define verification checks", dependsOn: ["inspect"], capability: "plan:create", acceptanceCriteria: ["Checks are explicit"] }
          ],
          permissions: ["repo:read", "plan:create"],
          modelRoute: { provider: "mock", model: "mock-plan-v1" }
        })
      };
    }
  });
  const result = await core.plan({ goal: "Review a repository change", provider: "openai" });
  assert.equal(result.ok, true);
  assert.equal(result.plan.status, "PLANNED");
  assert.equal(result.plan.steps.length, 2);
  assert.equal(result.plan.permissions[0].approved, false);
  assert.equal(result.execution.toolsExecuted, false);
  assert.equal(result.execution.infrastructureChanged, false);
  assert.match(completionInput.prompt, /JSON object/);
  assert.match(completionInput.prompt, /untrusted/);
});

test("neural core rejects malformed planning JSON and does not return raw model text", async () => {
  const core = createNeuralCore({ complete: async () => ({ ok: true, provider: "mock", model: "m", text: "not-json" }) });
  await assert.rejects(() => core.plan({ goal: "Make a plan", provider: "openai" }), { code: "NEURAL_CORE_INVALID_PLAN_RESPONSE" });
});

test("neural core rejects model-proposed capabilities outside the trusted allowlist", async () => {
  const core = createNeuralCore({
    allowedCapabilities: ["repo:read"],
    complete: async () => ({
      ok: true, provider: "mock", model: "m",
      text: JSON.stringify({
        goal: "Deploy code",
        taskType: "action",
        steps: [{ id: "deploy", description: "Deploy to production", dependsOn: [], capability: "infra:deploy", acceptanceCriteria: ["Deployment finished"] }],
        permissions: ["infra:deploy"]
      })
    })
  });
  await assert.rejects(() => core.plan({ goal: "Deploy code", provider: "openai" }), { code: "BRAIN_PLAN_CAPABILITY_NOT_ALLOWED" });
});

test("neural core planning rejects empty and oversized goals before provider dispatch", async () => {
  let called = false;
  const core = createNeuralCore({ complete: async () => { called = true; return { ok: true, provider: "mock", model: "m", text: "{}" }; } });
  await assert.rejects(() => core.plan({ goal: " " }), { code: "NEURAL_CORE_INVALID_GOAL" });
  await assert.rejects(() => core.plan({ goal: "x".repeat(12001) }), { code: "NEURAL_CORE_GOAL_TOO_LARGE" });
  assert.equal(called, false);
});
