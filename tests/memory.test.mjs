import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";

function memoryDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith("INSERT INTO conversation_memory")) {
                const [id, sessionId, memoryType, stateJson, createdAt, updatedAt] = args;
                const key = `owner:${sessionId}:${memoryType}`;
                const prior = rows.get(key);
                rows.set(key, {
                  id: prior?.id ?? id,
                  owner_scope: "owner",
                  session_id: sessionId,
                  memory_type: memoryType,
                  state_json: stateJson,
                  created_at: prior?.created_at ?? createdAt,
                  updated_at: updatedAt,
                });
              }
              return { success: true };
            },
            async all() {
              if (sql.includes("SELECT session_id")) {
                const sessionId = args[1];
                return { results: [...rows.values()].filter((r) => r.owner_scope === args[0] && r.session_id === sessionId) };
              }
              return { results: [] };
            },
          };
        },
        async run() { return { success: true }; },
      };
    },
  };
}

test("memory route rejects requests without the bridge token", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/memory"), { DB: memoryDb(), BRIDGE_SECRET: "test-secret" });
  assert.equal(response.status, 401);
});

test("memory route persists and retrieves state across requests", async () => {
  const DB = memoryDb();
  const env = { DB, BRIDGE_SECRET: "test-secret" };
  const write = await worker.fetch(new Request("https://example.test/api/memory", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ session_id: "session_123456", memory_type: "conversation_state", state: { topic: "NEXUS", turn: 3 } }),
  }), env);
  assert.equal(write.status, 200);
  assert.equal((await write.json()).ok, true);

  const read = await worker.fetch(new Request("https://example.test/api/memory?session_id=session_123456", {
    headers: { authorization: "Bearer test-secret" },
  }), env);
  const body = await read.json();
  assert.equal(read.status, 200);
  assert.deepEqual(body.memories[0].state, { topic: "NEXUS", turn: 3 });
});

test("memory route rejects malformed state and invalid session IDs", async () => {
  const env = { DB: memoryDb(), BRIDGE_SECRET: "test-secret" };
  const badSession = await worker.fetch(new Request("https://example.test/api/memory", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ session_id: "x", state: { ok: true } }),
  }), env);
  assert.equal(badSession.status, 400);

  const badState = await worker.fetch(new Request("https://example.test/api/memory", {
    method: "POST",
    headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
    body: JSON.stringify({ session_id: "session_123456", state: ["not", "object"] }),
  }), env);
  assert.equal(badState.status, 400);
});
