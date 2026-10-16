const MAX_ARCHIVE_ROWS = 100;

export async function ensureSentinelSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS sentinel_health_audit (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, metrics_json TEXT NOT NULL,
    checked_at TEXT NOT NULL, archived_at TEXT
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_sentinel_health_checked ON sentinel_health_audit(checked_at DESC)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, ip_hash TEXT NOT NULL,
    path TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC)").run();
}

async function timed(fn) {
  const started = Date.now();
  try { const value = await fn(); return { ok: true, latencyMs: Date.now() - started, value }; }
  catch (error) { return { ok: false, latencyMs: Date.now() - started, error: String(error?.message || "PROBE_FAILED").slice(0, 100) }; }
}

async function probeD1(db) {
  return timed(async () => {
    await db.prepare("SELECT 1 AS ok").first();
    const tables = await db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").first();
    let pageCount = null, pageSize = null;
    try {
      const pages = await db.prepare("PRAGMA page_count").first();
      const size = await db.prepare("PRAGMA page_size").first();
      pageCount = Number(pages?.page_count ?? Object.values(pages || {})[0]) || null;
      pageSize = Number(size?.page_size ?? Object.values(size || {})[0]) || null;
    } catch {}
    return { tableCount: Number(tables?.count) || 0, pageCount, pageSize, estimatedBytes: pageCount && pageSize ? pageCount * pageSize : null };
  });
}

async function probeKV(kv) {
  if (!kv || typeof kv.put !== "function" || typeof kv.get !== "function" || typeof kv.delete !== "function") {
    return { ok: false, latencyMs: 0, error: "KV_BINDING_UNAVAILABLE" };
  }
  return timed(async () => {
    const key = "sentinel:probe:" + crypto.randomUUID();
    const value = crypto.randomUUID();
    await kv.put(key, value, { expirationTtl: 60 });
    const readback = await kv.get(key);
    await kv.delete(key);
    if (readback !== value) throw new Error("KV_READBACK_MISMATCH");
    return { readbackVerified: true };
  });
}

async function archiveOldest(env, now) {
  if (!env.ARCHIVE || typeof env.ARCHIVE.put !== "function") return { configured: false, archivedRows: 0 };
  const rows = await env.DB.prepare("SELECT id,status,metrics_json,checked_at FROM sentinel_health_audit WHERE archived_at IS NULL ORDER BY checked_at ASC LIMIT ?")
    .bind(MAX_ARCHIVE_ROWS).all();
  const batch = rows?.results || [];
  if (!batch.length) return { configured: true, archivedRows: 0 };
  const first = batch[0].id, last = batch[batch.length - 1].id;
  const day = now.slice(0, 10);
  const key = "sentinel/" + day + "/" + first + "-" + last + ".json";
  await env.ARCHIVE.put(key, JSON.stringify({ schemaVersion: 1, archivedAt: now, records: batch.map(row => ({
    id: row.id, status: row.status, metrics: safeJson(row.metrics_json), checkedAt: row.checked_at
  })) }), { httpMetadata: { contentType: "application/json" } });
  const statements = batch.map(row => env.DB.prepare("UPDATE sentinel_health_audit SET archived_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, row.id));
  if (typeof env.DB.batch === "function") await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
  return { configured: true, archivedRows: batch.length, objectKey: key };
}
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }

export async function runSentinelCycle(env, options = {}) {
  const now = options.now || new Date().toISOString();
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return { ok: false, status: "blocked", checkedAt: now, error: "D1_BINDING_UNAVAILABLE" };
  }
  let schemaOk = false;
  try { await ensureSentinelSchema(env.DB); schemaOk = true; }
  catch { return { ok: false, status: "blocked", checkedAt: now, error: "SENTINEL_SCHEMA_UNAVAILABLE" }; }

  const [d1, kv] = await Promise.all([probeD1(env.DB), probeKV(env.SESSIONS)]);
  const errors = [];
  if (!d1.ok) errors.push({ component: "d1", code: d1.error });
  if (!kv.ok) errors.push({ component: "kv", code: kv.error });
  const metrics = {
    schemaOk, d1: { ok: d1.ok, latencyMs: d1.latencyMs, ...(d1.ok ? d1.value : { error: d1.error }) },
    kv: { ok: kv.ok, latencyMs: kv.latencyMs, ...(kv.ok ? kv.value : { error: kv.error }) },
    archive: { configured: Boolean(env.ARCHIVE), archivedRows: 0 },
    errors
  };
  let archive = { configured: Boolean(env.ARCHIVE), archivedRows: 0 };
  if (d1.ok && env.ARCHIVE) {
    try { archive = await archiveOldest(env, now); }
    catch { archive = { configured: true, archivedRows: 0, error: "ARCHIVE_WRITE_FAILED" }; errors.push({ component: "r2", code: "ARCHIVE_WRITE_FAILED" }); }
  }
  metrics.archive = archive;
  const status = errors.length ? "degraded" : "healthy";
  const record = { id: crypto.randomUUID(), status, metrics_json: JSON.stringify(metrics), checked_at: now };
  try {
    await env.DB.prepare("INSERT INTO sentinel_health_audit (id,status,metrics_json,checked_at) VALUES (?,?,?,?)")
      .bind(record.id, record.status, record.metrics_json, record.checked_at).run();
  } catch {
    return { ok: false, status: "degraded", checkedAt: now, metrics, error: "SENTINEL_AUDIT_WRITE_FAILED" };
  }
  return { ok: errors.length === 0, status, checkedAt: now, metrics };
}

export async function getSentinelStatus(db, limit = 10) {
  await ensureSentinelSchema(db);
  const result = await db.prepare("SELECT id,status,metrics_json AS metricsJson,checked_at AS checkedAt,archived_at AS archivedAt FROM sentinel_health_audit ORDER BY checked_at DESC LIMIT ?")
    .bind(Math.max(1, Math.min(20, Number(limit) || 10))).all();
  return (result?.results || []).map(row => ({ id: row.id, status: row.status, checkedAt: row.checkedAt,
    archivedAt: row.archivedAt || null, metrics: safeJson(row.metricsJson) }));
}
