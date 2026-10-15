import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeKnowledgeQuery,
  validateKnowledgeApproval,
  enqueueKnowledgeTask,
  processApprovedKnowledgeTasks,
  OWNER_APPROVAL_PHRASE
} from "./task-queue.mjs";

test("knowledge query normalization rejects empty, non-string, and oversized input", () => {
  assert.equal(normalizeKnowledgeQuery("  Cloudflare   Workers  "), "Cloudflare Workers");
  assert.equal(normalizeKnowledgeQuery(""), "");
  assert.equal(normalizeKnowledgeQuery("x".repeat(401)), "");
  assert.equal(normalizeKnowledgeQuery(null), "");
});

test("knowledge queue requires exact action, query, phrase, and a UUID nonce", () => {
  const query = "Cloudflare Workers docs";
  const approval = { approved: true, action: "knowledge_search", query, confirmation: OWNER_APPROVAL_PHRASE, nonce: "550e8400-e29b-41d4-a716-446655440000" };
  assert.equal(validateKnowledgeApproval(query, approval), true);
  assert.equal(validateKnowledgeApproval(query, { ...approval, query: "different query" }), false);
  assert.equal(validateKnowledgeApproval(query, { ...approval, action: "deploy" }), false);
  assert.equal(validateKnowledgeApproval(query, { ...approval, approved: false }), false);
  assert.equal(validateKnowledgeApproval(query, { ...approval, nonce: "replay" }), false);
});

test("task enqueue refuses missing approval before touching storage", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("should not be called"); }, batch() { touched = true; } } };
  const result = await enqueueKnowledgeTask(env, "search this", null);
  assert.equal(result.status, 403);
  assert.equal(result.ok, false);
  assert.equal(touched, false);
});

test("task enqueue fails closed when durable D1 storage is unavailable", async () => {
  const result = await enqueueKnowledgeTask({}, "search this", {
    approved: true, action: "knowledge_search", query: "search this",
    confirmation: OWNER_APPROVAL_PHRASE, nonce: "550e8400-e29b-41d4-a716-446655440000"
  });
  assert.equal(result.status, 503);
  assert.equal(result.ok, false);
});


function mockD1(initialTasks = []) {
  const state = { tasks: initialTasks.map(task => ({ attempts: 0, ...task })), audits: [], nonces: new Set() };
  function statement(sql) {
    return {
      sql,
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() {
        const a = this.args;
        if (sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
        if (sql.startsWith("INSERT INTO knowledge_audit")) {
          state.audits.push({ id: a[0], taskId: a[1], eventType: a[2], scope: a[3], details: a[5] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO knowledge_tasks")) {
          if (state.nonces.has(a[2])) throw new Error("UNIQUE constraint failed: approval_nonce");
          state.nonces.add(a[2]);
          state.tasks.push({ id: a[0], query: a[1], status: "queued", owner_approved: 1, approval_scope: a[3], attempts: 0 });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status = 'running'")) {
          const task = state.tasks.find(item => item.id === a[2]);
          if (!task || task.status !== "queued" || task.owner_approved !== 1) return { meta: { changes: 0 } };
          Object.assign(task, { status: "running", started_at: a[0], updated_at: a[1], attempts: task.attempts + 1 });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status = 'completed'")) {
          const task = state.tasks.find(item => item.id === a[3]);
          Object.assign(task, { status: "completed", result_json: a[0], completed_at: a[1], updated_at: a[2], error_code: null });
          return { meta: { changes: 1 } };
        }
        if (sql.includes("SET status = 'failed'")) {
          const task = state.tasks.find(item => item.id === a[3]);
          Object.assign(task, { status: "failed", error_code: a[0], completed_at: a[1], updated_at: a[2] });
          return { meta: { changes: 1 } };
        }
        throw new Error("Unexpected mock SQL: " + sql);
      },
      async all() {
        if (sql.includes("WHERE status = 'queued'")) {
          return { results: state.tasks.filter(item => item.status === "queued" && item.owner_approved === 1).map(({ id, query, approval_scope }) => ({ id, query, approval_scope })) };
        }
        return { results: [] };
      },
      async first() { return null; }
    };
  }
  return {
    state,
    prepare: statement,
    async batch(statements) {
      const taskInsert = statements.find(item => item.sql.startsWith("INSERT INTO knowledge_tasks"));
      if (taskInsert && state.nonces.has(taskInsert.args[2])) throw new Error("UNIQUE constraint failed: approval_nonce");
      for (const item of statements) await item.run();
      return [];
    }
  };
}

test("approved task is persisted with audit, and reusing its nonce is rejected", async () => {
  const DB = mockD1();
  const query = "Cloudflare Workers docs";
  const approval = {
    approved: true,
    action: "knowledge_search",
    query,
    confirmation: OWNER_APPROVAL_PHRASE,
    nonce: "550e8400-e29b-41d4-a716-446655440000"
  };
  const first = await enqueueKnowledgeTask({ DB }, query, approval);
  assert.equal(first.ok, true);
  assert.equal(first.status, 201);
  assert.equal(DB.state.tasks.length, 1);
  assert.equal(DB.state.tasks[0].status, "queued");
  assert.equal(DB.state.audits[0].eventType, "owner_approved_and_queued");
  const replay = await enqueueKnowledgeTask({ DB }, query, approval);
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
  assert.equal(DB.state.tasks.length, 1);
});

test("scheduled processor fetches only persisted owner-approved tasks and audits the result", async () => {
  const DB = mockD1([{
    id: "task-approved-1",
    query: "Cloudflare Workers docs",
    status: "queued",
    owner_approved: 1,
    approval_scope: "knowledge_search:Cloudflare Workers docs"
  }]);
  const originalFetch = globalThis.fetch;
  let sentBody;
  let sentAuthorization;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.tavily.com/search");
    sentBody = JSON.parse(options.body);
    sentAuthorization = options.headers.authorization;
    return new Response(JSON.stringify({ results: [
      { title: "Workers docs", url: "https://developers.cloudflare.com/workers/", content: "Official documentation." },
      { title: "Rejected scheme", url: "javascript:alert(1)", content: "Must not be saved." }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const outcome = await processApprovedKnowledgeTasks({ DB, SEARCH_API_KEY: "test-key" });
    assert.deepEqual(outcome, { processed: 1, blocked: false });
    assert.equal(sentBody.query, "Cloudflare Workers docs");
    assert.equal(sentAuthorization, "Bearer test-key");
    assert.equal(DB.state.tasks[0].status, "completed");
    const result = JSON.parse(DB.state.tasks[0].result_json);
    assert.equal(result.sourceCount, 1);
    assert.equal(result.sources[0].url, "https://developers.cloudflare.com/workers/");
    assert.deepEqual(DB.state.audits.map(event => event.eventType), [
      "approved_task_started",
      "approved_task_completed"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
