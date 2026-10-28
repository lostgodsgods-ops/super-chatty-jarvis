import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityRequest, listCapabilityRequests } from "./capability-request-queue.mjs";

const catalog = [
  { id: "github", category: "developer-platform", capabilities: ["repositories", "pull-requests"] },
  { id: "tavily", category: "search", capabilities: ["web-search"] }
];

function createD1Mock() {
  const state = { schemaCreated: false, rows: [], lastLimit: null, statements: [] };
  const db = {
    prepare(sql) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      let boundValues = [];
      const statementRecord = {
        sql: normalizedSql,
        get values() { return boundValues; }
      };
      state.statements.push(statementRecord);
      const statement = {
        bind(...values) {
          boundValues = values;
          return statement;
        },
        async run() {
          if (normalizedSql.startsWith("CREATE TABLE IF NOT EXISTS capability_requests")) {
            state.schemaCreated = true;
            return { success: true };
          }
          if (normalizedSql.startsWith("INSERT INTO capability_requests")) {
            if (!state.schemaCreated) throw new Error("schema was not created before insert");
            const [id, goal, rationale, requestedToolsJson, createdAt] = boundValues;
            state.rows.push({
              id, goal, rationale, requestedToolsJson,
              status: "pending_owner_review",
              executionEnabled: 0,
              requiresOwnerApproval: 1,
              createdAt
            });
            return { success: true, meta: { changes: 1 } };
          }
          throw new Error("Unexpected D1 run statement");
        },
        async all() {
          if (!normalizedSql.startsWith("SELECT id,goal,rationale,requested_tools_json AS requestedToolsJson")) {
            throw new Error("Unexpected D1 query statement");
          }
          state.lastLimit = boundValues[0];
          const results = [...state.rows]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, state.lastLimit)
            .map(row => ({
              id: row.id,
              goal: row.goal,
              rationale: row.rationale,
              requestedToolsJson: row.requestedToolsJson,
              status: row.status,
              executionEnabled: row.executionEnabled,
              requiresOwnerApproval: row.requiresOwnerApproval,
              createdAt: row.createdAt
            }));
          return { results };
        }
      };
      return statement;
    }
  };
  return { env: { DB: db }, state };
}

test("capability requests persist to D1 and round-trip with owner approval still required", async () => {
  const { env, state } = createD1Mock();
  const created = await createCapabilityRequest(env, {
    goal: "Verify repository state and current search evidence",
    requestedTools: ["github", "tavily"],
    rationale: "Repository inspection and current public evidence are needed."
  }, catalog);

  assert.equal(state.schemaCreated, true, "the capability_requests schema is ensured before insertion");
  assert.equal(state.rows.length, 1, "one durable row is inserted");
  assert.ok(state.statements.some(item => item.sql.startsWith("INSERT INTO capability_requests")));
  assert.equal(created.status, "pending_owner_review");
  assert.equal(created.executionEnabled, false);
  assert.equal(created.requiresOwnerApproval, true);
  assert.deepEqual(created.requestedTools, ["github", "tavily"]);

  const listed = await listCapabilityRequests(env, 1);
  assert.equal(state.lastLimit, 1, "list limit is bound as a query parameter");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);
  assert.deepEqual(listed[0].requestedTools, ["github", "tavily"]);
  assert.equal(listed[0].status, "pending_owner_review");
  assert.equal(listed[0].executionEnabled, false);
  assert.equal(listed[0].requiresOwnerApproval, true);
});


test("D1 schema initialization failures return a sanitized storage error", async () => {
  const internalDetail = "SQLITE_INTERNAL_PATH_DO_NOT_EXPOSE";
  const env = {
    DB: {
      prepare() {
        return {
          async run() { throw new Error(internalDetail); },
          bind() { return this; },
          async all() { throw new Error(internalDetail); }
        };
      }
    }
  };
  const input = {
    goal: "Verify repository state",
    requestedTools: ["github"],
    rationale: "Need bounded repository inspection."
  };
  const isSanitizedStorageError = error =>
    error.code === "CAPABILITY_REQUEST_STORAGE_UNAVAILABLE" &&
    error.status === 503 &&
    error.message === "CAPABILITY_REQUEST_STORAGE_UNAVAILABLE" &&
    !error.message.includes(internalDetail);

  await assert.rejects(createCapabilityRequest(env, input, catalog), isSanitizedStorageError);
  await assert.rejects(listCapabilityRequests(env, 10), isSanitizedStorageError);
});


test("D1 list query failures return a sanitized storage error", async () => {
  const internalDetail = "SQLITE_QUERY_PLAN_INTERNAL_DETAIL";
  const env = {
    DB: {
      prepare(sql) {
        if (sql.startsWith("CREATE TABLE IF NOT EXISTS capability_requests")) {
          return { async run() { return { success: true }; } };
        }
        return {
          bind() { return this; },
          async all() { throw new Error(internalDetail); }
        };
      }
    }
  };
  await assert.rejects(listCapabilityRequests(env, 10), error =>
    error.code === "CAPABILITY_REQUEST_STORAGE_UNAVAILABLE" &&
    error.status === 503 &&
    error.message === "CAPABILITY_REQUEST_STORAGE_UNAVAILABLE" &&
    !error.message.includes(internalDetail)
  );
});

test("an idempotency key makes repeated capability requests return one durable record", async () => {
  const { env, state } = createD1Mock();
  const input = {
    idempotencyKey: "overnight-capability-request-001",
    goal: "Verify repository state",
    requestedTools: ["github"],
    rationale: "Need bounded repository inspection."
  };

  const first = await createCapabilityRequest(env, input, catalog);
  const replay = await createCapabilityRequest(env, input, catalog);

  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.id, first.id);
  assert.equal(state.rows.length, 1, "a replay must not insert a second row");
  assert.equal(replay.status, "pending_owner_review");
  assert.equal(replay.executionEnabled, false);
  assert.equal(replay.requiresOwnerApproval, true);
});

test("reusing an idempotency key for a different payload returns a conflict", async () => {
  const { env, state } = createD1Mock();
  const firstInput = {
    idempotencyKey: "overnight-capability-request-002",
    goal: "Verify repository state",
    requestedTools: ["github"],
    rationale: "Need bounded repository inspection."
  };
  await createCapabilityRequest(env, firstInput, catalog);

  await assert.rejects(
    createCapabilityRequest(env, {
      ...firstInput,
      goal: "Install an unreviewed tool"
    }, catalog),
    error => error.code === "CAPABILITY_REQUEST_IDEMPOTENCY_CONFLICT" && error.status === 409
  );
  assert.equal(state.rows.length, 1, "conflicting replay must not mutate the original row");
});
