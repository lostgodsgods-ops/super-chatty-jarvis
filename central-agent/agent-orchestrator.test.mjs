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
  assert.deepEqual(roles.map(role => role.id), ["code_mutator", "global_scraper", "api_orchestrator", "testing"]);
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
