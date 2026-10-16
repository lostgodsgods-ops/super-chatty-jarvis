import test from "node:test";
import assert from "node:assert/strict";
import { listModules, registerModule, publishEvent, readEventsAfter } from "./event-bus.mjs";

function fakeDb() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async run() {
          if (sql.includes("INSERT INTO central_event_bus_events")) {
            const [type, source, payloadJson, createdAt] = params;
            rows.push({ eventId: nextId++, type, source, payloadJson, createdAt });
            return { success: true, meta: { last_row_id: rows.at(-1).eventId } };
          }
          return { success: true };
        },
        async all() {
          if (sql.includes("SELECT id AS eventId")) {
            const [afterId, limit] = params;
            return { results: rows.filter(row => row.eventId > afterId).slice(0, limit) };
          }
          return { results: [] };
        }
      };
    }
  };
}

test("module registry exposes metadata and accepts independent module registrations", () => {
  const before = listModules().length;
  const added = registerModule({ id: "test-extension", version: "1.0.0", capabilities: ["test", "events"] });
  assert.equal(added.id, "test-extension");
  assert.ok(listModules().some(module => module.id === "test-extension"));
  assert.equal(listModules().length, before + 1);
});

test("module registry rejects invalid and duplicate registrations", () => {
  assert.throws(() => registerModule({ id: "../unsafe", version: "1", capabilities: [] }), /INVALID_EVENT_BUS_MODULE/);
  assert.throws(() => registerModule({ id: "test-extension", version: "1.0.0", capabilities: [] }), /ALREADY_REGISTERED/);
});

test("publishEvent persists an event and updates the KV latest-event hint", async () => {
  const db = fakeDb();
  const kvWrites = [];
  const result = await publishEvent({ DB: db, SESSIONS: { async put(...args) { kvWrites.push(args); } } }, {
    type: "agent.execution.completed", source: "agent-orchestrator", payload: { ok: true, count: 2 }
  });
  assert.equal(result.ok, true);
  assert.equal(result.id, 1);
  assert.equal(db.rows.length, 1);
  assert.equal(kvWrites.length, 1);
  assert.deepEqual(JSON.parse(db.rows[0].payloadJson), { ok: true, count: 2 });
});

test("publishEvent degrades safely when D1 is unavailable or metadata is invalid", async () => {
  assert.equal((await publishEvent({}, { type: "test.event", source: "test" })).ok, false);
  assert.equal((await publishEvent({ DB: fakeDb() }, { type: "Bad Type", source: "test" })).error, "INVALID_EVENT_METADATA");
});

test("readEventsAfter returns ordered events after the reconnect cursor", async () => {
  const db = fakeDb();
  const env = { DB: db };
  await publishEvent(env, { type: "agent.execution.started", source: "agent-orchestrator", payload: { run: 1 } });
  await publishEvent(env, { type: "agent.execution.completed", source: "agent-orchestrator", payload: { run: 1 } });
  const events = await readEventsAfter(env, 1, 10);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 2);
  assert.equal(events[0].type, "agent.execution.completed");
  assert.deepEqual(events[0].payload, { run: 1 });
});
