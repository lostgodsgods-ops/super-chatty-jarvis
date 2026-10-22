import test from "node:test";
import assert from "node:assert/strict";
import { listUniversalTools, getUniversalToolStatus } from "./universal-tool-registry.mjs";

test("registry catalogs provider families without claiming they are live", () => {
  const tools = listUniversalTools({});
  assert.ok(tools.length >= 50);
  assert.ok(tools.some(tool => tool.id === "openai"));
  assert.ok(tools.some(tool => tool.id === "cloudflare"));
  assert.ok(tools.some(tool => tool.id === "github"));
  assert.ok(tools.every(tool => ["not_configured", "public_metadata_only"].includes(tool.status)));
  assert.ok(tools.every(tool => tool.connectionAttempted === false));
});

test("provider status uses server-side binding presence only and never returns secrets", () => {
  const tools = listUniversalTools({ OPENAI_API_KEY: "never-return-this", TAVILY_API_KEY: "also-secret" });
  const openai = tools.find(tool => tool.id === "openai");
  const tavily = tools.find(tool => tool.id === "tavily");
  assert.equal(openai.status, "configured_not_verified");
  assert.equal(tavily.status, "configured_not_verified");
  assert.equal(JSON.stringify(tools).includes("never-return-this"), false);
  assert.equal(JSON.stringify(tools).includes("also-secret"), false);
  assert.equal(openai.connectionAttempted, false);
});

test("unknown provider status is rejected without reflecting user input", () => {
  assert.throws(() => getUniversalToolStatus("https://attacker.example/?secret=x", {}), error =>
    error.code === "UNKNOWN_TOOL_PROVIDER" && !error.message.includes("attacker.example")
  );
});

test("status distinguishes configured, implementation readiness, and live verification", () => {
  const result = getUniversalToolStatus("openai", { OPENAI_API_KEY: "x" });
  assert.equal(result.status, "configured_not_verified");
  assert.equal(result.configured, true);
  assert.equal(result.liveVerified, false);
  assert.equal(result.connectionAttempted, false);
  assert.deepEqual(result.missingBindings, []);
});

test("provider registry rejects malformed binding values as not configured", () => {
  const result = getUniversalToolStatus("anthropic", { ANTHROPIC_API_KEY: "   " });
  assert.equal(result.status, "not_configured");
  assert.equal(result.configured, false);
  assert.deepEqual(result.missingBindings, ["ANTHROPIC_API_KEY"]);
});

test("registry exposes blockchain simulation and quantum adapter without claiming live verification", () => {
  const tools = listUniversalTools({});
  const blockchain = tools.find(tool => tool.id === "blockchain-simulation");
  const quantum = tools.find(tool => tool.id === "quantum-compute");
  assert.ok(blockchain);
  assert.ok(blockchain.capabilities.includes("simulation-only"));
  assert.equal(blockchain.liveVerified, false);
  assert.ok(quantum);
  assert.equal(quantum.status, "not_configured");
  assert.equal(quantum.liveVerified, false);
  assert.deepEqual(quantum.missingBindings, ["QUANTUM_API_URL", "QUANTUM_API_KEY"]);
});
