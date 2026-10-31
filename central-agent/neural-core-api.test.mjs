import test from "node:test";
import assert from "node:assert/strict";
import { handleNeuralCoreRequest } from "./neural-core-api.mjs";
import { createNeuralCore } from "./neural-core.mjs";

function makeCore(overrides = {}) {
  return createNeuralCore({
    complete: async input => ({ ok: true, provider: input.provider, model: "mock-v1", text: "Reasoned result" }),
    ...overrides
  });
}
const get = () => new Request("https://example.test/api/neural-core");
const post = body => new Request("https://example.test/api/neural-core", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

test("GET returns neural core capability status without credentials", async () => {
  const response = await handleNeuralCoreRequest(get(), { OPENAI_API_KEY: "do-not-leak" }, { core: makeCore() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.core.name, "REDULTRON NEURAL CORE");
  assert.equal(body.core.version, "1.0.0");
  assert.equal(JSON.stringify(body).includes("do-not-leak"), false);
});

test("POST invokes the core and records request plus completion audit without logging prompt", async () => {
  const events = [];
  const response = await handleNeuralCoreRequest(post({ prompt: "Explain the architecture", provider: "openai" }), {}, {
    core: makeCore(),
    publishEvent: async event => { events.push(event); return { ok: true, id: "audit-" + events.length }; }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.text, "Reasoned result");
  assert.equal(body.result.execution.toolsExecuted, false);
  assert.deepEqual(events.map(event => event.type), ["neural_core.reasoning.requested", "neural_core.reasoning.completed"]);
  assert.equal(JSON.stringify(events).includes("Explain the architecture"), false);
});

test("POST fails closed if audit storage is unavailable before model dispatch", async () => {
  let invoked = false;
  const core = { inspect: () => ({}), reason: async () => { invoked = true; return {}; } };
  const response = await handleNeuralCoreRequest(post({ prompt: "hello" }), {}, {
    core, publishEvent: async () => ({ ok: false })
  });
  assert.equal(response.status, 503);
  assert.equal(invoked, false);
});

test("POST returns a sanitized failure and records failure event", async () => {
  const events = [];
  const core = { inspect: () => ({}), reason: async () => { const error = new Error("private detail"); error.code = "PROVIDER_UNAVAILABLE"; throw error; } };
  const response = await handleNeuralCoreRequest(post({ prompt: "hello" }), {}, {
    core, publishEvent: async event => { events.push(event); return { ok: true }; }
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "PROVIDER_UNAVAILABLE");
  assert.equal(JSON.stringify(events).includes("private detail"), false);
  assert.equal(events.at(-1).type, "neural_core.reasoning.failed");
});

test("POST validates method, content type, JSON, and streaming size", async () => {
  assert.equal((await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", { method: "DELETE" }))).status, 405);
  assert.equal((await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status, 400);
  const oversized = await handleNeuralCoreRequest(new Request("https://example.test/api/neural-core", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "x".repeat(17000) })
  }));
  assert.equal(oversized.status, 413);
});
