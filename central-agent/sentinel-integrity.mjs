export async function signSentinelCheckpoint(sequence, headHash, secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("SENTINEL_CHECKPOINT_SECRET_MISSING");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`redultron-sentinel-v1:${sequence}:${headHash}`));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalizeAuditPayload(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("AUDIT_PAYLOAD_NUMBER_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalizeAuditPayload).join(",") + "]";
  if (typeof value !== "object") throw new TypeError("AUDIT_PAYLOAD_TYPE_INVALID");
  const keys = Object.keys(value).sort();
  return "{" + keys.map(key => JSON.stringify(key) + ":" + canonicalizeAuditPayload(value[key])).join(",") + "}";
}

export async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashAuditEntry(previousHash, timestamp, canonicalPayload, commitSha) {
  if (!/^[0-9a-f]{64}$/.test(previousHash)) throw new TypeError("AUDIT_PREVIOUS_HASH_INVALID");
  if (typeof timestamp !== "string" || !timestamp) throw new TypeError("AUDIT_TIMESTAMP_REQUIRED");
  if (typeof commitSha !== "string" || !commitSha) throw new TypeError("AUDIT_COMMIT_SHA_REQUIRED");
  return sha256Hex(previousHash + "\\n" + timestamp + "\\n" + canonicalPayload + "\\n" + commitSha);
}


const ZERO_HASH = "0".repeat(64);

export async function ensureSentinelHashSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS sentinel_hash_chain (
    sequence INTEGER PRIMARY KEY,
    record_id TEXT NOT NULL UNIQUE,
    previous_hash TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    canonical_payload TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    record_hash TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS sentinel_hash_chain_head (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sequence INTEGER NOT NULL,
    head_hash TEXT NOT NULL
  )`).run();
  await db.prepare("INSERT OR IGNORE INTO sentinel_hash_chain_head (id, sequence, head_hash) VALUES (1, 0, ?)")
    .bind(ZERO_HASH).run();
}

async function readChainHead(db) {
  const head = await db.prepare("SELECT sequence, head_hash AS headHash FROM sentinel_hash_chain_head WHERE id = 1").first();
  if (!head || !Number.isInteger(Number(head.sequence)) || !/^[0-9a-f]{64}$/.test(head.headHash)) {
    throw new Error("SENTINEL_HASH_CHAIN_HEAD_INVALID");
  }
  return { sequence: Number(head.sequence), hash: head.headHash };
}

export async function backfillSentinelAuditChain(db, commitSha = "25abd1d") {
  await ensureSentinelHashSchema(db);
  for (let attempt = 0; attempt < 4; attempt++) {
    const legacy = await db.prepare(`SELECT h.id, h.status, h.metrics_json AS metricsJson, h.checked_at AS checkedAt
      FROM sentinel_health_audit h LEFT JOIN sentinel_hash_chain c ON c.record_id = h.id
      WHERE c.record_id IS NULL ORDER BY h.checked_at ASC, h.id ASC`).all();
    const rows = legacy?.results || [];
    if (!rows.length) return { ok: true, backfilled: 0 };
    const head = await readChainHead(db);
    let previousHash = head.hash;
    let sequence = head.sequence;
    const statements = [];
    for (const row of rows) {
      const payload = canonicalizeAuditPayload({
        id: row.id, status: row.status, metricsJson: row.metricsJson, checkedAt: row.checkedAt
      });
      const recordHash = await hashAuditEntry(previousHash, row.checkedAt, payload, commitSha);
      sequence++;
      statements.push(db.prepare(`INSERT INTO sentinel_hash_chain
        (sequence, record_id, previous_hash, timestamp, canonical_payload, commit_sha, record_hash)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM sentinel_hash_chain_head WHERE id=1 AND sequence=? AND head_hash=?)
          AND NOT EXISTS (SELECT 1 FROM sentinel_hash_chain WHERE record_id=?)`)
        .bind(sequence, row.id, previousHash, row.checkedAt, payload, commitSha, recordHash, head.sequence, head.hash, row.id));
      previousHash = recordHash;
    }
    statements.push(db.prepare(`UPDATE sentinel_hash_chain_head SET sequence=?, head_hash=?
      WHERE id=1 AND sequence=? AND head_hash=? AND EXISTS
      (SELECT 1 FROM sentinel_hash_chain WHERE sequence=? AND record_hash=?)`)
      .bind(sequence, previousHash, head.sequence, head.hash, sequence, previousHash));
    const results = await db.batch(statements);
    if (Number(results?.[0]?.meta?.changes || 0) > 0) return { ok: true, backfilled: rows.length };
    // A concurrent append won the compare-and-swap. Re-read the head and remaining rows.
  }
  throw new Error("SENTINEL_HASH_CHAIN_CONCURRENT_WRITE");
}

export async function appendSentinelAuditChain(db, entry, commitSha = "25abd1d") {
  const existing = await db.prepare("SELECT record_hash AS recordHash FROM sentinel_hash_chain WHERE record_id=?")
    .bind(entry.id).first();
  if (existing?.recordHash) return { ok: true, duplicate: true, hash: existing.recordHash };
  for (let attempt = 0; attempt < 4; attempt++) {
    const head = await readChainHead(db);
    const payload = canonicalizeAuditPayload({
      id: entry.id, status: entry.status, metricsJson: entry.metrics_json, checkedAt: entry.checked_at
    });
    const recordHash = await hashAuditEntry(head.hash, entry.checked_at, payload, commitSha);
    const nextSequence = head.sequence + 1;
    const results = await db.batch([
      db.prepare(`INSERT INTO sentinel_hash_chain
        (sequence, record_id, previous_hash, timestamp, canonical_payload, commit_sha, record_hash)
        SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM sentinel_hash_chain_head WHERE id=1 AND sequence=? AND head_hash=?)
          AND NOT EXISTS (SELECT 1 FROM sentinel_hash_chain WHERE record_id=?)`)
        .bind(nextSequence, entry.id, head.hash, entry.checked_at, payload, commitSha, recordHash, head.sequence, head.hash, entry.id),
      db.prepare(`UPDATE sentinel_hash_chain_head SET sequence=?, head_hash=?
        WHERE id=1 AND sequence=? AND head_hash=? AND EXISTS
        (SELECT 1 FROM sentinel_hash_chain WHERE sequence=? AND record_id=? AND record_hash=?)`)
        .bind(nextSequence, recordHash, head.sequence, head.hash, nextSequence, entry.id, recordHash)
    ]);
    if (Number(results?.[0]?.meta?.changes || 0) > 0) return { ok: true, duplicate: false, hash: recordHash };
    const raced = await db.prepare("SELECT record_hash AS recordHash FROM sentinel_hash_chain WHERE record_id=?")
      .bind(entry.id).first();
    if (raced?.recordHash) return { ok: true, duplicate: true, hash: raced.recordHash };
  }
  throw new Error("SENTINEL_HASH_CHAIN_CONCURRENT_WRITE");
}


export class SentinelPulse {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
  }

  async fetch() {
    const current = await this.storage.getAlarm();
    if (current == null) await this.storage.setAlarm(Date.now() + 1000);
    return new Response(JSON.stringify({ ok: true, pulse: "scheduled", intervalSeconds: 30 }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  async alarm() {
    const checkedAt = new Date().toISOString();
    let status;
    try {
      if (!this.env?.DB || typeof this.env.DB.prepare !== "function") throw new Error("D1_BINDING_UNAVAILABLE");
      const pulseSchema = this.env.DB.prepare(`CREATE TABLE IF NOT EXISTS sentinel_pulse_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL,
        ok INTEGER NOT NULL,
        component TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        detail TEXT NOT NULL
      )`);
      if (typeof pulseSchema.run === "function") await pulseSchema.run();
      await this.env.DB.prepare("SELECT 1 AS ok").first();
      const checkpointSchema = this.env.DB.prepare(`CREATE TABLE IF NOT EXISTS sentinel_checkpoint_signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        head_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        commit_sha TEXT NOT NULL
      )`);
      if (typeof checkpointSchema.run === "function") await checkpointSchema.run();
      const checkpoint = typeof checkpointSchema.run === "function" ? await this.env.DB.prepare("SELECT sequence, head_hash AS headHash FROM sentinel_hash_chain_head WHERE id=1").first() : null;
      let checkpointSigned = false;
      if (checkpoint && this.env.SENTINEL_CHECKPOINT_SECRET) {
        const signature = await signSentinelCheckpoint(Number(checkpoint.sequence), checkpoint.headHash, this.env.SENTINEL_CHECKPOINT_SECRET);
        await this.env.DB.prepare("INSERT INTO sentinel_checkpoint_signatures (created_at, sequence, head_hash, signature, commit_sha) VALUES (?, ?, ?, ?, ?)")
          .bind(checkedAt, Number(checkpoint.sequence), checkpoint.headHash, signature, this.env.GITHUB_COMMIT_SHA || "UNBOUND_COMMIT_SHA").run();
        checkpointSigned = true;
      }
      status = { ok: true, component: "d1", checkedAt, commitSha: this.env.GITHUB_COMMIT_SHA || "UNBOUND_COMMIT_SHA", checkpointSigned };
    } catch {
      status = { ok: false, component: "d1", checkedAt, commitSha: this.env?.GITHUB_COMMIT_SHA || "UNBOUND_COMMIT_SHA", error: "D1_PROBE_FAILED" };
    }
    await this.storage.put("last-pulse", status);
    try {
      if (this.env?.DB && typeof this.env.DB.prepare === "function") {
        const telemetrySchema = this.env.DB.prepare(`CREATE TABLE IF NOT EXISTS sentinel_pulse_telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          checked_at TEXT NOT NULL,
          ok INTEGER NOT NULL,
          component TEXT NOT NULL,
          commit_sha TEXT NOT NULL,
          detail TEXT NOT NULL
        )`);
        if (typeof telemetrySchema.run === "function") {
          await telemetrySchema.run();
          await this.env.DB.prepare("INSERT INTO sentinel_pulse_telemetry (checked_at, ok, component, commit_sha, detail) VALUES (?, ?, ?, ?, ?)")
            .bind(status.checkedAt, status.ok ? 1 : 0, status.component, status.commitSha, status.error || "D1_PROBE_OK").run();
        } else {
          status.telemetryPersisted = false;
        }
      }
    } catch {
      // D1 may be unavailable; retain the local DO heartbeat and keep scheduling.
      status.telemetryPersisted = false;
      await this.storage.put("last-pulse", status);
    } finally {
      await this.storage.setAlarm(Date.now() + 30_000);
    }
  }
}


/**
 * Verify a materialized Sentinel chain snapshot without mutating storage.
 * Returns the first integrity failure rather than treating partial verification as success.
 */
export async function verifySentinelHashChainRows(rows, head) {
  const fail = (code, sequence) => ({ ok: false, code, sequence });
  if (!Array.isArray(rows) || !head || !Number.isInteger(Number(head.sequence)) ||
      Number(head.sequence) < 0 || !/^[0-9a-f]{64}$/.test(String(head.headHash || ""))) {
    return fail("SENTINEL_CHAIN_METADATA_INVALID", 0);
  }

  let expectedPreviousHash = ZERO_HASH;
  let expectedSequence = 1;
  for (const row of rows) {
    const sequence = Number(row?.sequence);
    if (!Number.isInteger(sequence) || sequence !== expectedSequence) {
      return fail("SENTINEL_SEQUENCE_MISMATCH", Number.isFinite(sequence) ? sequence : expectedSequence);
    }
    if (row.previousHash !== expectedPreviousHash) {
      return fail("SENTINEL_PREVIOUS_HASH_MISMATCH", sequence);
    }
    if (typeof row.timestamp !== "string" || !row.timestamp ||
        typeof row.commitSha !== "string" || !row.commitSha ||
        typeof row.canonicalPayload !== "string" ||
        !/^[0-9a-f]{64}$/.test(String(row.recordHash || ""))) {
      return fail("SENTINEL_RECORD_METADATA_INVALID", sequence);
    }
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(row.canonicalPayload);
      if (canonicalizeAuditPayload(parsedPayload) !== row.canonicalPayload) {
        return fail("SENTINEL_PAYLOAD_NOT_CANONICAL", sequence);
      }
      if (typeof row.recordId !== "string" || !row.recordId ||
          typeof parsedPayload?.id !== "string" || parsedPayload.id !== row.recordId) {
        return fail("SENTINEL_RECORD_ID_MISMATCH", sequence);
      }
    } catch {
      return fail("SENTINEL_PAYLOAD_INVALID", sequence);
    }
    const computedHash = await hashAuditEntry(
      row.previousHash, row.timestamp, row.canonicalPayload, row.commitSha
    );
    if (computedHash !== row.recordHash) return fail("SENTINEL_RECORD_HASH_MISMATCH", sequence);
    expectedPreviousHash = computedHash;
    expectedSequence++;
  }

  const verifiedSequence = expectedSequence - 1;
  if (Number(head.sequence) !== verifiedSequence || head.headHash !== expectedPreviousHash) {
    return fail("SENTINEL_HEAD_MISMATCH", verifiedSequence);
  }
  return {
    ok: true,
    verifiedEntries: rows.length,
    sequence: verifiedSequence,
    headHash: expectedPreviousHash
  };
}

/** Read and verify the persisted D1 chain and head; fails closed on D1 errors. */
export async function verifySentinelAuditChain(db) {
  if (!db || typeof db.prepare !== "function") {
    return { ok: false, code: "D1_BINDING_UNAVAILABLE", sequence: 0 };
  }
  try {
    // Verification is strictly read-only: schema creation and initialization belong to migrations/setup.
    const [chainResult, head] = await Promise.all([
      db.prepare(`SELECT sequence, record_id AS recordId, previous_hash AS previousHash,
        timestamp, canonical_payload AS canonicalPayload, commit_sha AS commitSha,
        record_hash AS recordHash FROM sentinel_hash_chain ORDER BY sequence ASC`).all(),
      db.prepare("SELECT sequence, head_hash AS headHash FROM sentinel_hash_chain_head WHERE id=1").first()
    ]);
    if (!head) return { ok: false, code: "SENTINEL_CHAIN_HEAD_MISSING", sequence: 0 };
    return await verifySentinelHashChainRows(chainResult?.results || [], head);
  } catch {
    return { ok: false, code: "SENTINEL_CHAIN_READ_FAILED", sequence: 0 };
  }
}
