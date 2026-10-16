/**
 * R2-free event bus for the Central Agent.
 * D1 is the durable ordered event log; KV holds a short-lived latest-event hint.
 * SSE consumers reconnect with Last-Event-ID and replay events from D1.
 */
const MAX_PAYLOAD_BYTES = 4096;
const MODULES = new Map();
const CORE_MODULES = [
  { id: "central-router", version: "1.0.0", capabilities: ["http-routing", "auth-gate"] },
  { id: "agent-orchestrator", version: "1.0.0", capabilities: ["agent-execution", "bounded-concurrency"] },
  { id: "sentinel", version: "1.0.0", capabilities: ["health-monitoring", "audit-events"] },
  { id: "security-edge", version: "1.0.0", capabilities: ["request-guard", "security-events"] },
  { id: "task-queue", version: "1.0.0", capabilities: ["durable-queue", "owner-approval"] },
  { id: "pwa-event-stream", version: "1.0.0", capabilities: ["sse", "replay", "heartbeat"] },
  { id: "kv-d1-storage", version: "1.0.0", capabilities: ["hot-cache", "durable-event-log"] }
];
for (const module of CORE_MODULES) MODULES.set(module.id, Object.freeze({ ...module }));

export function registerModule(module) {
  if (!module || typeof module.id !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(module.id) ||
      typeof module.version !== "string" || !Array.isArray(module.capabilities) ||
      module.capabilities.some(value => typeof value !== "string" || value.length > 64)) {
    throw new TypeError("INVALID_EVENT_BUS_MODULE");
  }
  if (MODULES.has(module.id)) throw new Error("EVENT_BUS_MODULE_ALREADY_REGISTERED");
  const registered = Object.freeze({ id: module.id, version: module.version, capabilities: Object.freeze([...new Set(module.capabilities)]) });
  MODULES.set(registered.id, registered);
  return registered;
}

export function listModules() {
  return [...MODULES.values()].map(module => ({ id: module.id, version: module.version, capabilities: [...module.capabilities] }));
}

export async function ensureEventSchema(db) {
  if (!db || typeof db.prepare !== "function") throw new Error("EVENT_BUS_STORAGE_UNAVAILABLE");
  await db.prepare("CREATE TABLE IF NOT EXISTS central_event_bus_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_central_event_bus_events_created_at ON central_event_bus_events(created_at)").run();
}

export async function publishEvent(env, event) {
  try {
    if (!env?.DB || typeof env.DB.prepare !== "function") return { ok: false, error: "EVENT_BUS_STORAGE_UNAVAILABLE" };
    const type = typeof event?.type === "string" ? event.type.slice(0, 96) : "";
    const source = typeof event?.source === "string" ? event.source.slice(0, 96) : "";
    if (!/^[a-z][a-z0-9._-]{1,95}$/.test(type) || !/^[a-z][a-z0-9._-]{1,95}$/.test(source)) return { ok: false, error: "INVALID_EVENT_METADATA" };
    let payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {};
    let serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) {
      payload = { truncated: true, keys: Object.keys(payload).slice(0, 32) };
      serialized = JSON.stringify(payload);
    }
    await ensureEventSchema(env.DB);
    const createdAt = new Date().toISOString();
    const result = await env.DB.prepare("INSERT INTO central_event_bus_events (event_type, source, payload_json, created_at) VALUES (?, ?, ?, ?)")
      .bind(type, source, serialized, createdAt).run();
    const id = Number(result?.meta?.last_row_id || result?.meta?.lastRowId || 0);
    if (env.SESSIONS && typeof env.SESSIONS.put === "function") {
      try { await env.SESSIONS.put("event-bus:latest", JSON.stringify({ id, type, source, createdAt }), { expirationTtl: 86400 }); } catch {}
    }
    return { ok: true, id, type, source, createdAt };
  } catch {
    return { ok: false, error: "EVENT_BUS_PUBLISH_FAILED" };
  }
}

export async function readEventsAfter(env, afterId = 0, limit = 50) {
  await ensureEventSchema(env?.DB);
  const cursor = Number.isSafeInteger(Number(afterId)) && Number(afterId) > 0 ? Number(afterId) : 0;
  const pageSize = Number.isSafeInteger(Number(limit)) ? Math.min(100, Math.max(1, Number(limit))) : 50;
  const result = await env.DB.prepare("SELECT id AS eventId, event_type AS type, source, payload_json AS payloadJson, created_at AS createdAt FROM central_event_bus_events WHERE id > ? ORDER BY id ASC LIMIT ?")
    .bind(cursor, pageSize).all();
  return (result?.results || []).map(row => {
    let payload = {};
    try { payload = JSON.parse(row.payloadJson || "{}"); } catch {}
    return { id: Number(row.eventId), type: row.type, source: row.source, payload, createdAt: row.createdAt };
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function eventStreamResponse(request, env, corsHeaders = {}) {
  try { await ensureEventSchema(env?.DB); }
  catch {
    return new Response(JSON.stringify({ ok: false, error: "EVENT_BUS_STORAGE_UNAVAILABLE" }), {
      status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders }
    });
  }
  const encoder = new TextEncoder();
  const headerCursor = Number(request.headers.get("last-event-id") || 0);
  const queryCursor = Number(new URL(request.url).searchParams.get("after") || 0);
  let cursor = Number.isSafeInteger(headerCursor) && headerCursor > 0 ? headerCursor :
    (Number.isSafeInteger(queryCursor) && queryCursor > 0 ? queryCursor : 0);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      const emit = (name, payload, id) => {
        if (cancelled) return;
        const idLine = Number.isSafeInteger(id) && id > 0 ? "id: " + id + "\n" : "";
        controller.enqueue(encoder.encode(idLine + "event: " + name + "\ndata: " + JSON.stringify(payload) + "\n\n"));
      };
      const run = async () => {
        const startedAt = Date.now();
        let lastHeartbeat = 0;
        while (!cancelled && Date.now() - startedAt < 20000) {
          try {
            const events = await readEventsAfter(env, cursor, 50);
            for (const event of events) {
              emit(event.type, { source: event.source, payload: event.payload, createdAt: event.createdAt }, event.id);
              cursor = Math.max(cursor, event.id);
            }
          } catch { emit("bus.degraded", { code: "EVENT_BUS_READ_TEMPORARILY_UNAVAILABLE", at: new Date().toISOString() }); }
          const now = Date.now();
          if (now - lastHeartbeat >= 10000) { emit("heartbeat", { at: new Date().toISOString(), cursor }); lastHeartbeat = now; }
          if (!cancelled) await sleep(1000);
        }
        if (!cancelled) { try { controller.close(); } catch {} }
      };
      run().catch(() => { if (!cancelled) { try { controller.close(); } catch {} } });
    },
    cancel() { cancelled = true; }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no", ...corsHeaders
    }
  });
}
