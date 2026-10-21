import test from "node:test";
import assert from "node:assert/strict";
import { spawnAgents, listAgentDefinitions } from "./agent-orchestrator.mjs";

function dbMock() {
  const state = { audits: [], memories: [], tasks: [] };
  const statement = (sql) => {
    let args = [];
    return { sql, bind(...values) { args = values; return this; }, async run() {
      if (sql.includes("INSERT INTO agent_run_audit")) state.audits.push({ id: args[0], role: args[1], status: args[2], details: args[8] });
      if (sql.includes("INSERT INTO conversation_memory")) state.memories.push({ session: args[2], type: args[3], json: args[4] });
      if (sql.includes("INSERT INTO agent_tasks")) state.tasks.push({ id: args[0], role: args[1], status: args[2], result: args[4] });
      return { meta: { changes: 1 } };
    }, async all() { return { results: state.audits.slice(-10).reverse().map(row => row) }; } };
  };
  return { state, prepare: statement, async batch(stmts) { for (const stmt of stmts) await stmt.run(); return []; } };
}
test("agent catalogue exposes bounded executors and no self-granted side effects", () => {
  const roles = listAgentDefinitions();
  assert.deepEqual(roles.map(role => role.id), ["agent_saum", "code_mutator", "global_scraper", "api_orchestrator", "testing"]);
  assert.ok(roles.every(role => role.requiresOwnerSession && role.autoExecutesSideEffects === false));
});
test("agent spawn validates role and bounds parallel batch size", async () => {
  assert.equal((await spawnAgents({}, { role: "root", input: "do anything" })).outcomes[0].error, "UNSUPPORTED_AGENT_ROLE");
  assert.equal((await spawnAgents({}, { tasks: Array.from({length:4}, () => ({role:"testing",input:"check"})) })).error, "TASK_BATCH_MUST_BE_1_TO_3");
});
test("missing D1 blocks agent execution without pretending it ran", async () => {
  const result = await spawnAgents({}, { role: "testing", input: "test plan" });
  assert.equal(result.ok, false);
  assert.equal(result.outcomes[0].error, "AGENT_STORAGE_UNAVAILABLE");
});
test("successful bounded agent persists audit, memory and task result", async () => {
  const db = dbMock();
  const env = { DB: db, AI: { async run(model, input) { assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast"); return { response: JSON.stringify({ testCases: ["happy path"], notExecuted: true }) }; } } };
  const result = await spawnAgents(env, { role: "testing", input: "review owner auth" });
  assert.equal(result.ok, true);
  assert.equal(result.outcomes[0].status, "completed");
  assert.equal(db.state.audits.length, 1);
  assert.equal(db.state.memories.length, 1);
  assert.equal(db.state.tasks.length, 1);
  assert.equal(db.state.tasks[0].status, "completed");
  assert.equal(JSON.parse(db.state.memories[0].json).role, "testing");
});
test("code mutator is proposal-only and never writes repository files", async () => {
  const db = dbMock();
  const env = { DB: db, AI: { async run() { return { response: JSON.stringify({ summary: "proposed", filesToReview: [], proposedPatch: null, tests: [], risks: [] }) }; } } };
  const result = await spawnAgents(env, { role: "code_mutator", input: "Suggest a safe fix" });
  assert.equal(result.ok, true);
  assert.equal(result.outcomes[0].mode, "proposal-only");
  assert.equal(result.outcomes[0].result.summary, "proposed");
});

test("Workers AI quota exhaustion falls back to configured Gemini and persists successful run", async (t) => {
  const db = dbMock();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(options.method, "POST");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ testCases: ["fallback"], notExecuted: true }) }] } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  const env = {
    DB: db,
    GEMINI_API_KEY: "test-only-not-a-real-key",
    AI: { async run() { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } }
  };
  const result = await spawnAgents(env, { role: "testing", input: "check quota fallback" });
  assert.equal(result.ok, true);
  assert.equal(result.outcomes[0].status, "completed");
  assert.deepEqual(result.outcomes[0].result.testCases, ["fallback"]);
  assert.equal(db.state.audits.length, 1);
  assert.equal(db.state.tasks[0].status, "completed");
});

test("Workers AI quota exhaustion without a backup route returns a stable quota code", async () => {
  const db = dbMock();
  const env = { DB: db, AI: { async run() { throw new Error("4006 daily free allocation exhausted"); } } };
  const result = await spawnAgents(env, { role: "testing", input: "quota fallback unavailable" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 207);
  assert.equal(result.outcomes[0].error, "AI_QUOTA_EXHAUSTED");
  assert.equal(db.state.audits.length, 1);
  assert.equal(JSON.parse(db.state.audits[0].details).errorCode, "AI_QUOTA_EXHAUSTED");
});

test("backup-provider quota/rate-limit failures degrade to the stable quota code", async (t) => {
  const db = dbMock();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
  const env = {
    DB: db,
    GEMINI_API_KEY: "test-only-not-a-real-key",
    AI: { async run() { throw new Error("Workers AI HTTP 429 rate limit"); } }
  };
  const result = await spawnAgents(env, { role: "testing", input: "backup quota failure" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 207);
  assert.equal(result.outcomes[0].error, "AI_QUOTA_EXHAUSTED");
  assert.equal(db.state.audits.length, 1);
  assert.equal(db.state.memories.length, 1);
});

test("unavailable configured backup model does not turn quota exhaustion into a deployment crash", async (t) => {
  const db = dbMock();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 });
  const env = {
    DB: db,
    GEMINI_API_KEY: "test-only-not-a-real-key",
    AI: { async run() { throw new Error("4006 daily free allocation exhausted"); } }
  };
  const result = await spawnAgents(env, { role: "testing", input: "backup model unavailable" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 207);
  assert.equal(result.outcomes[0].error, "AI_QUOTA_EXHAUSTED");
  assert.equal(db.state.audits.length, 1);
  assert.equal(db.state.memories.length, 1);
});


test("global scraper prefers TAVILY_API_KEY and falls back to SEARCH_API_KEY", async (t) => {
  const db = dbMock();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.authorization, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ results: [
      { title: "Test source", url: "https://example.com/source", content: "Evidence snippet", published_date: "2026-10-20" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const preferred = await spawnAgents({
    DB: db,
    TAVILY_API_KEY: "new-key",
    SEARCH_API_KEY: "legacy-key"
  }, { role: "global_scraper", input: "latest verified test query" });
  assert.equal(preferred.ok, true);
  assert.equal(calls[0].authorization, "Bearer new-key");
  assert.equal(calls[0].body.query, "latest verified test query");
  assert.equal(preferred.outcomes[0].result.sourceCount, 1);

  const fallback = await spawnAgents({
    DB: db,
    SEARCH_API_KEY: "legacy-key"
  }, { role: "global_scraper", input: "legacy compatibility test" });
  assert.equal(fallback.ok, true);
  assert.equal(calls[1].authorization, "Bearer legacy-key");
});

test("global scraper fails closed when neither Tavily key binding exists", async () => {
  const db = dbMock();
  const result = await spawnAgents({ DB: db }, { role: "global_scraper", input: "search without credentials" });
  assert.equal(result.ok, false);
  assert.equal(result.outcomes[0].error, "SEARCH_PROVIDER_UNAVAILABLE");
});


test("Agent Saum validates a plan and coordinates specialist agents without granting permissions", async () => {
  const db = dbMock();
  const env = {
    DB: db,
    AI: { async run(_model, input) {
      if (input.messages[0].content.includes("Act as Agent Saum")) {
        return { response: JSON.stringify({ tasks: [
          { role: "testing", input: "Define auth regression tests" },
          { role: "api_orchestrator", input: "Plan the progress-event integration" }
        ] }) };
      }
      return { response: JSON.stringify({ objective: "Bounded specialist result", steps: ["review", "verify"], risks: [] }) };
    } }
  };
  const result = await spawnAgents(env, { role: "agent_saum", input: "Improve REDULTRON progress reporting" });
  assert.equal(result.ok, true);
  assert.equal(result.coordinator.role, "agent_saum");
  assert.equal(result.delegationMode, "model-plan-validated");
  assert.deepEqual(result.outcomes.map(item => item.role), ["testing", "api_orchestrator"]);
  assert.equal(db.state.audits.length, 3);
  assert.ok(result.outcomes.every(item => item.ok && item.mode !== "unrestricted"));
});

test("Agent Saum forces live research through the global scraper and uses fallback search when Tavily is quota-limited", async (t) => {
  const db = dbMock();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.tavily.com")) return new Response("quota", { status: 432 });
    if (String(url).includes("duckduckgo.com/html")) return new Response(
      '<a class="result__a" href="https://example.com/current">Current report</a><a class="result__snippet">Live evidence</a>',
      { status: 200 }
    );
    throw new Error("Unexpected fallback provider");
  };
  const env = {
    DB: db,
    SEARCH_PROVIDER_MODE: "tavily",
    TAVILY_API_KEY: "test-token",
    AI: { async run(_model, input) {
      if (input.messages[0].content.includes("Act as Agent Saum")) {
        return { response: JSON.stringify({ tasks: [
          { role: "testing", input: "Check source freshness and citations" },
          { role: "api_orchestrator", input: "Plan resilient research integration" }
        ] }) };
      }
      return { response: JSON.stringify({ objective: "bounded", steps: ["verify"], risks: [], notExecuted: true }) };
    } }
  };
  const result = await spawnAgents(env, { role: "agent_saum", input: "Find the latest live information about current technology updates" });
  assert.ok(result.outcomes.some(item => item.role === "global_scraper" && item.ok));
  const research = result.outcomes.find(item => item.role === "global_scraper");
  assert.equal(research.result.provider, "duckduckgo-html");
  assert.equal(research.result.sources[0].url, "https://example.com/current");
});
