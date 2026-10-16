import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

function memoryDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async run() {
          if (sql.startsWith("INSERT INTO conversation_memory")) {
            const [id, owner_scope, session_id, memory_type, state_json, created_at, updated_at] = values;
            const key = [owner_scope, session_id, memory_type].join("|");
            const old = rows.get(key);
            rows.set(key, { id: old?.id || id, owner_scope, session_id, memory_type, state_json, created_at: old?.created_at || created_at, updated_at });
          }
          return { success: true };
        },
        async all() {
          if (sql.includes("FROM conversation_memory")) {
            const owner = values[0], session = values[1], type = values[2];
            return { results: [...rows.values()].filter(row => row.owner_scope === owner && row.session_id === session && (!type || row.memory_type === type)).map(row => ({ ...row })) };
          }
          return { results: [] };
        }
      };
      return statement;
    }
  };
}
function envFor(db, authenticated = true) {
  return { DB: db, SESSIONS: { async get() { return authenticated ? "active" : null; } }, ALLOWED_ORIGINS: "" };
}
const request = (path, method = "GET", token = "test-session-token", body) => new Request("https://unit.test" + path, {
  method,
  headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test("memory bridge rejects requests without a verified owner session", async () => {
  const response = await worker.fetch(request("/api/memory", "GET", ""), envFor(memoryDb(), false));
  assert.equal(response.status, 401);
});

test("memory bridge persists and retrieves owner conversation state", async () => {
  const db = memoryDb();
  const saved = await worker.fetch(request("/api/memory", "POST", "valid-session", {
    session_id: "owner-global", memory_type: "conversation_state",
    state: { commandHistory: [{ command: "test", capturedAt: "2026-10-16T00:00:00.000Z" }], lastCommand: "test" }
  }), envFor(db));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).saved, true);
  const restored = await worker.fetch(request("/api/memory", "GET", "valid-session"), envFor(db));
  const payload = await restored.json();
  assert.equal(restored.status, 200);
  assert.equal(payload.memories.length, 1);
  assert.equal(payload.memories[0].state.lastCommand, "test");
});

test("memory bridge rejects malformed state and unsafe session identifiers", async () => {
  const db = memoryDb();
  const badState = await worker.fetch(request("/api/memory", "POST", "valid-session", {
    session_id: "owner-global", memory_type: "conversation_state", state: []
  }), envFor(db));
  assert.equal(badState.status, 400);
  const badSession = await worker.fetch(request("/api/memory", "POST", "valid-session", {
    session_id: "../other-owner", memory_type: "conversation_state", state: { ok: true }
  }), envFor(db));
  assert.equal(badSession.status, 400);
});
