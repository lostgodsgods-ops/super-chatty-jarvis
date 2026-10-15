import test from "node:test";
import assert from "node:assert/strict";
import { handleModuleRoute, isModuleRoute } from "../staging/modules.mjs";

const owner = { ownerId: 1 };
const req = (path, method = "GET", body, headers = {}) => new Request("https://staging.example" + path, {
  method,
  headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("module route matcher is explicit and method-bounded", () => {
  assert.equal(isModuleRoute("GET", "/tasks"), true);
  assert.equal(isModuleRoute("POST", "/tasks"), true);
  assert.equal(isModuleRoute("PUT", "/tasks"), false);
  assert.equal(isModuleRoute("POST", "/tasks/abc/approve"), false);
  assert.equal(isModuleRoute("GET", "/audit"), true);
});

test("task endpoints reject missing Owner sessions before database access", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const response = await handleModuleRoute(req("/tasks"), env, "/tasks", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("task creation queues only allowlisted task types and starts pending approval", async () => {
  const batched = [];
  const env = { DB: {
    prepare(sql) { return { sql, bind(...args) { return { sql, args }; } }; },
    async batch(statements) { batched.push(...statements); return []; },
  } };
  const response = await handleModuleRoute(req("/tasks", "POST", {
    taskType: "read_only_research", payload: { question: "Summarize public documentation" },
  }), env, "/tasks", owner);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.task.status, "pending_approval");
  assert.equal(body.task.taskType, "read_only_research");
  assert.equal(batched.length, 2);
  assert.match(batched[0].sql, /INSERT INTO owner_tasks/);
  assert.match(batched[1].sql, /INSERT INTO owner_audit_log/);
});

test("task creation rejects unsupported task types without database writes", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const response = await handleModuleRoute(req("/tasks", "POST", {
    taskType: "shell_command", payload: { command: "anything" },
  }), env, "/tasks", owner);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Unsupported task type" });
  assert.equal(touched, false);
});

test("task approval requires an explicit approved=true value", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const response = await handleModuleRoute(req("/tasks/123e4567-e89b-12d3-a456-426614174000/approve", "POST", {}), env, "/tasks/123e4567-e89b-12d3-a456-426614174000/approve", owner);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Explicit approval is required" });
  assert.equal(touched, false);
});

test("agent result submission fails closed until a private gateway token exists", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/results", "POST", {
    taskId: "123e4567-e89b-12d3-a456-426614174000", result: { summary: "test" },
  }), { DB: { prepare() { touched = true; } } }, "/results", null);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Agent result submission is disabled until gateway authentication is configured" });
  assert.equal(touched, false);
});

test("agent result submission rejects an incorrect gateway token", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/results", "POST", {
    taskId: "123e4567-e89b-12d3-a456-426614174000", result: { summary: "test" },
  }, { "x-agent-gateway-token": "wrong" }), {
    AGENT_GATEWAY_TOKEN: "correct-token",
    DB: { prepare() { touched = true; } },
  }, "/results", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("authenticated memory creation, search, and audit writes work together", async () => {
  const memories = [], events = [];
  const env = { DB: {
    prepare(sql) { return { sql, bind(...args) { return {
      sql, args,
      async all() {
        if (sql.includes("FROM owner_memory")) {
          const query = args.length > 1 ? String(args[1]).toLowerCase() : "";
          return { results: memories.filter(row => row.owner_id === args[0] && (!query || row.content.toLowerCase().includes(query))) };
        }
        if (sql.includes("FROM owner_audit_log")) return { results: events.filter(row => row.owner_id === args[0]).slice(0, args[1] || 50) };
        throw new Error("Unexpected all query: " + sql);
      },
      async first() { throw new Error("Unexpected first query: " + sql); },
      async run() { throw new Error("Unexpected run query: " + sql); },
    }; } }; },
    async batch(statements) {
      for (const s of statements) {
        if (s.sql.startsWith("INSERT INTO owner_memory")) {
          const [id, owner_id, content, tags_json, created_at, updated_at] = s.args;
          memories.push({ id, owner_id, content, tags_json, created_at, updated_at });
        } else if (s.sql.startsWith("INSERT INTO owner_audit_log")) {
          if (s.sql.includes("'memory.created'")) {
            const [id, owner_id, resource_id, detail_json, created_at] = s.args;
            events.push({ id, owner_id, action: "memory.created", resource_type: "memory", resource_id, detail_json, created_at });
          } else {
            const [id, owner_id, action, resource_type, resource_id, detail_json, created_at] = s.args;
            events.push({ id, owner_id, action, resource_type, resource_id, detail_json, created_at });
          }
        } else throw new Error("Unexpected batch query: " + s.sql);
      }
      return [];
    },
  } };

  const created = await handleModuleRoute(req("/memory", "POST", {
    content: "Super Chatty authenticated integration memory",
    tags: ["integration", "staging"],
  }), env, "/memory", owner);
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.memory.content, "Super Chatty authenticated integration memory");
  assert.deepEqual(createdBody.memory.tags, ["integration", "staging"]);

  const searched = await handleModuleRoute(req("/memory?q=authenticated integration"), env, "/memory", owner);
  assert.equal(searched.status, 200);
  const searchBody = await searched.json();
  assert.equal(searchBody.memories.length, 1);
  assert.equal(searchBody.memories[0].id, createdBody.memory.id);

  const audit = await handleModuleRoute(req("/audit?limit=10"), env, "/audit", owner);
  assert.equal(audit.status, 200);
  const auditBody = await audit.json();
  assert.ok(auditBody.events.some(event => event.action === "memory.created" && event.resourceId === createdBody.memory.id));
});

test("memory writes require an Owner session and reject oversized content", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const unauthorized = await handleModuleRoute(req("/memory", "POST", { content: "test" }), env, "/memory", null);
  assert.equal(unauthorized.status, 401);
  const tooLong = await handleModuleRoute(req("/memory", "POST", { content: "x".repeat(4001) }), env, "/memory", owner);
  assert.equal(tooLong.status, 400);
  assert.equal(touched, false);
});

test("task, memory, and audit reads bind the fixed Owner ID", async () => {
  const queries = [];
  const env = { DB: {
    prepare(sql) {
      return { sql, bind(...args) { queries.push({ sql, args }); return {
        async all() { return { results: [] }; },
        async first() { return { id: "123e4567-e89b-12d3-a456-426614174000" }; },
      }; } };
    },
  } };
  await handleModuleRoute(req("/tasks"), env, "/tasks", owner);
  await handleModuleRoute(req("/memory?q=project"), env, "/memory", owner);
  await handleModuleRoute(req("/audit?limit=20"), env, "/audit", owner);
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.match(query.sql, /owner_id = \?/);
    assert.ok(query.args.includes(1), "every query must bind the fixed Owner ID");
  }
});


test("agent task claiming is disabled without a private gateway token", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/tasks/claim", "POST", {}), {
    DB: { prepare() { touched = true; } },
  }, "/tasks/claim", null);
  assert.equal(response.status, 503);
  assert.equal(touched, false);
});

test("agent task claiming atomically claims queued work and audits it", async () => {
  const statements = [];
  const env = {
    AGENT_GATEWAY_TOKEN: "test-private-token",
    DB: {
      prepare(sql) {
        return { sql, bind(...args) { return {
          sql, args,
          async first() {
            if (sql.startsWith("UPDATE owner_tasks")) return {
              id: "123e4567-e89b-12d3-a456-426614174000",
              task_type: "read_only_research",
              payload_json: JSON.stringify({ question: "Public documentation only" }),
              created_at: "2026-10-14T00:00:00.000Z",
              updated_at: "2026-10-14T00:00:01.000Z",
            };
            throw new Error("Unexpected first query");
          },
          async run() { statements.push({ sql, args }); return { success: true }; },
        }; } };
      },
    },
  };
  const response = await handleModuleRoute(req("/tasks/claim", "POST", {}, { "x-agent-gateway-token": "test-private-token" }), env, "/tasks/claim", null);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.task.status, "running");
  assert.equal(body.task.payload.question, "Public documentation only");
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /INSERT INTO owner_audit_log/);
});

test("agent results can only complete an owned queued or running task", async () => {
  const batchStatements = [];
  const env = {
    AGENT_GATEWAY_TOKEN: "test-private-token",
    DB: {
      prepare(sql) { return { sql, bind(...args) { return {
        sql, args,
        async first() { return { id: args[0], task_type: "read_only_research", status: "running" }; },
      }; } }; },
      async batch(statements) { batchStatements.push(...statements); return []; },
    },
  };
  const taskId = "123e4567-e89b-12d3-a456-426614174000";
  const response = await handleModuleRoute(req("/results", "POST", { taskId, result: { summary: "Public sources reviewed" } }, { "x-agent-gateway-token": "test-private-token" }), env, "/results", null);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.accepted, true);
  assert.equal(body.taskId, taskId);
  assert.equal(batchStatements.length, 3);
  assert.match(batchStatements[0].sql, /INSERT INTO owner_task_results/);
  assert.match(batchStatements[1].sql, /status = 'completed'/);
  assert.match(batchStatements[2].sql, /INSERT INTO owner_audit_log/);
});


test("autonomous executor route is explicit and POST-only", () => {
  assert.equal(isModuleRoute("POST", "/tasks/execute"), true);
  assert.equal(isModuleRoute("GET", "/tasks/execute"), false);
});

test("autonomous executor rejects a wrong gateway token before database or AI access", async () => {
  let dbTouched = false, aiTouched = false;
  const response = await handleModuleRoute(req("/tasks/execute", "POST", {}, {
    "x-agent-gateway-token": "wrong",
  }), {
    AGENT_GATEWAY_TOKEN: "correct-token",
    DB: { prepare() { dbTouched = true; throw new Error("database must not be touched"); } },
    AI: { async run() { aiTouched = true; throw new Error("AI must not be touched"); } },
  }, "/tasks/execute", null);
  assert.equal(response.status, 401);
  assert.equal(dbTouched, false);
  assert.equal(aiTouched, false);
});

test("autonomous executor runs only an approved queued allowlisted task and records result plus audit", async () => {
  const batches = [];
  let aiInput = null;
  const queuedTask = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    task_type: "read_only_research",
    payload_json: JSON.stringify({ question: "Summarize public API documentation" }),
    created_at: "2026-10-15T10:00:00.000Z",
    updated_at: "2026-10-15T10:00:00.000Z",
  };
  const env = {
    AGENT_GATEWAY_TOKEN: "correct-token",
    CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    AI: { async run(model, input) { aiInput = { model, input }; return { response: "Summary from the bounded AI executor." }; } },
    DB: {
      prepare(sql) { return { sql, bind(...args) { return {
        sql, args,
        async first() {
          if (sql.includes("UPDATE owner_tasks") && sql.includes("RETURNING id, task_type")) return queuedTask;
          throw new Error("Unexpected first query: " + sql);
        },
        async run() { return { success: true }; },
      }; } }; },
      async batch(statements) { batches.push(...statements); return []; },
    },
  };
  const response = await handleModuleRoute(req("/tasks/execute", "POST", {}, {
    "x-agent-gateway-token": "correct-token",
  }), env, "/tasks/execute", null);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.taskId, queuedTask.id);
  assert.equal(body.status, "completed");
  assert.match(body.result.summary, /bounded AI executor/);
  assert.equal(aiInput.model, "@cf/meta/llama-3.1-8b-instruct");
  assert.match(aiInput.input.messages[0].content, /read-only research-style summary/);
  assert.match(aiInput.input.messages[1].content, /read_only_research/);
  assert.match(aiInput.input.messages[1].content, /Summarize public API documentation/);
  assert.equal(batches.length, 3);
  assert.match(batches[0].sql, /INSERT INTO owner_task_results/);
  assert.match(batches[1].sql, /status = 'completed'/);
  assert.match(batches[2].sql, /INSERT INTO owner_audit_log/);
});


test("agent result submission cannot bypass claiming by completing a merely queued task", async () => {
  let batchTouched = false;
  const env = {
    AGENT_GATEWAY_TOKEN: "correct-token",
    DB: {
      prepare(sql) { return { sql, bind(...args) { return {
        sql, args,
        async first() { return { id: args[0], task_type: "read_only_research", status: "queued" }; },
      }; } }; },
      async batch() { batchTouched = true; return []; },
    },
  };
  const response = await handleModuleRoute(req("/results", "POST", {
    taskId: "123e4567-e89b-12d3-a456-426614174000", result: { summary: "unauthorized bypass" },
  }, { "x-agent-gateway-token": "correct-token" }), env, "/results", null);
  assert.equal(response.status, 409);
  assert.equal(batchTouched, false);
});


test("Owner run-next route is explicit and POST-only", () => {
  assert.equal(isModuleRoute("POST", "/tasks/run-next"), true);
  assert.equal(isModuleRoute("GET", "/tasks/run-next"), false);
});

test("Owner run-next requires a verified Owner session before touching database", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/tasks/run-next", "POST", {}), {
    DB: { prepare() { touched = true; throw new Error("database must not be touched"); } },
  }, "/tasks/run-next", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("Owner can execute one previously approved queued task and persist its result", async () => {
  const batches = [];
  let aiTouched = false;
  const queuedTask = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    task_type: "code_review",
    payload_json: JSON.stringify({ material: "const value = 1;" }),
    created_at: "2026-10-15T10:00:00.000Z",
    updated_at: "2026-10-15T10:00:00.000Z",
  };
  const env = {
    CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    AI: { async run() { aiTouched = true; return { response: "Read-only review complete." }; } },
    DB: {
      prepare(sql) { return { sql, bind(...args) { return {
        sql, args,
        async first() {
          if (sql.includes("UPDATE owner_tasks") && sql.includes("RETURNING id, task_type")) return queuedTask;
          throw new Error("Unexpected first query: " + sql);
        },
        async run() { return { success: true }; },
      }; } }; },
      async batch(statements) { batches.push(...statements); return []; },
    },
  };
  const response = await handleModuleRoute(req("/tasks/run-next", "POST", {}), env, "/tasks/run-next", owner);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.taskId, queuedTask.id);
  assert.equal(body.status, "completed");
  assert.match(body.result.summary, /Read-only review complete/);
  assert.equal(aiTouched, true);
  assert.equal(batches.length, 3);
});


test("mission routes expose a bounded agent catalog and require Owner authentication", async () => {
  assert.equal(isModuleRoute("GET", "/agents"), true);
  assert.equal(isModuleRoute("GET", "/missions"), true);
  assert.equal(isModuleRoute("POST", "/missions"), true);
  let touched = false;
  const response = await handleModuleRoute(req("/missions", "POST", { goal: "Review my app" }), {
    DB: { prepare() { touched = true; throw new Error("database must not be touched"); } },
  }, "/missions", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("mission creation recruits a bounded three-role swarm and requires approval for every task", async () => {
  const batches = [];
  const env = {
    DB: {
      prepare(sql) { return { sql, bind(...args) { return { sql, args }; } }; },
      async batch(statements) { batches.push(statements); return []; },
    },
  };
  const response = await handleModuleRoute(req("/missions", "POST", {
    goal: "Assess this pasted app code and suggest safe improvements",
    context: "const answer = 42;",
  }), env, "/missions", owner);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.mission.status, "awaiting_task_approval");
  assert.equal(body.mission.agentCount, 3);
  assert.equal(body.tasks.length, 3);
  assert.ok(body.tasks.every(task => task.status === "pending_approval"));
  assert.deepEqual(body.tasks.map(task => task.agentRole), ["pathfinder", "research_synthesizer", "code_reviewer"]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 4);
  assert.ok(batches[0].every(statement => statement.sql.includes("owner_tasks") || statement.sql.includes("owner_audit_log")));
});

test("mission creation rejects oversized goals and never creates an unbounded swarm", async () => {
  let touched = false;
  const env = { DB: { prepare() { touched = true; throw new Error("database must not be touched"); } } };
  const tooLong = await handleModuleRoute(req("/missions", "POST", { goal: "x".repeat(12001) }), env, "/missions", owner);
  assert.equal(tooLong.status, 413);
  const badCount = await handleModuleRoute(req("/missions", "POST", { goal: "Do a task", agentCount: 999 }), env, "/missions", owner);
  assert.equal(badCount.status, 400);
  assert.equal(touched, false);
});


test("mission synthesis route is explicit and POST-only", () => {
  assert.equal(isModuleRoute("POST", "/missions/123e4567-e89b-12d3-a456-426614174000/synthesize"), true);
  assert.equal(isModuleRoute("GET", "/missions/123e4567-e89b-12d3-a456-426614174000/synthesize"), false);
});

test("mission synthesis requires Owner authentication before database access", async () => {
  let touched = false;
  const response = await handleModuleRoute(req("/missions/123e4567-e89b-12d3-a456-426614174000/synthesize", "POST", {}), {
    DB: { prepare() { touched = true; throw new Error("database must not be touched"); } },
  }, "/missions/123e4567-e89b-12d3-a456-426614174000/synthesize", null);
  assert.equal(response.status, 401);
  assert.equal(touched, false);
});

test("mission synthesis waits for all three specialist results before calling AI", async () => {
  let aiTouched = false;
  const env = {
    AI: { async run() { aiTouched = true; return { response: "combined" }; } },
    DB: { prepare(sql) { return { sql, bind() { return {
      async first() { return null; },
      async all() { return { results: [{ id: "task-a", task_type: "read_only_research", payload_json: JSON.stringify({ agentRole: "pathfinder" }), result_json: JSON.stringify({ summary: "plan" }) }] }; },
    }; } }; } },
  };
  const path = "/missions/123e4567-e89b-12d3-a456-426614174000/synthesize";
  const response = await handleModuleRoute(req(path, "POST", {}), env, path, owner);
  assert.equal(response.status, 409);
  assert.equal(aiTouched, false);
});

test("mission synthesis combines and persists the completed specialist results", async () => {
  const batches = [];
  let aiInput;
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const rows = [
    { id: "task-a", task_type: "read_only_research", payload_json: JSON.stringify({ missionId: id, agentRole: "pathfinder" }), result_json: JSON.stringify({ summary: "plan" }) },
    { id: "task-b", task_type: "read_only_research", payload_json: JSON.stringify({ missionId: id, agentRole: "research_synthesizer" }), result_json: JSON.stringify({ summary: "research" }) },
    { id: "task-c", task_type: "code_review", payload_json: JSON.stringify({ missionId: id, agentRole: "code_reviewer" }), result_json: JSON.stringify({ summary: "review" }) },
  ];
  const env = {
    CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    AI: { async run(model, input) { aiInput = input; return { response: "Unified mission summary." }; } },
    DB: {
      prepare(sql) { return { sql, bind(...args) { return {
        sql, args,
        async first() { return null; },
        async all() { return { results: rows }; },
      }; } }; },
      async batch(statements) { batches.push(statements); return []; },
    },
  };
  const path = "/missions/"+id+"/synthesize";
  const response = await handleModuleRoute(req(path, "POST", {}), env, path, owner);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.summary, "Unified mission summary.");
  assert.equal(body.result.agentCount, 3);
  assert.match(aiInput.messages[1].content, /pathfinder/);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  assert.ok(batches[0][0].sql.includes("owner_mission_results"));
  assert.ok(batches[0][1].sql.includes("owner_audit_log"));
});

// Regression coverage for bounded, Owner-approved mission synthesis.
