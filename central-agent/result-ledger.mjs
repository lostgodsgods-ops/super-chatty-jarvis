const MAX_ENVELOPE_BYTES = 32 * 1024;
const VALID_STATUS = new Set(["PASS", "FAIL", "BLOCKED", "NOT_TESTED"]);
const VALID_VERIFICATION = new Set(["VERIFIED", "UNVERIFIED", "FAILED"]);

function requireDb(db) {
  if (!db || typeof db.prepare !== "function") throw new Error("D1_BINDING_UNAVAILABLE");
}
function validText(value, max = 128) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function validateEnvelope(ownerScope, envelope) {
  if (!validText(ownerScope) || !envelope || typeof envelope !== "object") {
    throw new TypeError("OWNER_SCOPE_REQUIRED");
  }
  const identity = envelope.identity;
  const result = envelope.result;
  const provenance = envelope.provenance || {};
  if (identity?.core_id !== "redultron.core.primary" ||
      !validText(result?.result_id) ||
      !validText(result?.execution_id) ||
      !validText(result?.trace_id) ||
      !VALID_STATUS.has(result?.status) ||
      !VALID_VERIFICATION.has(result?.verification) ||
      typeof result?.created_at !== "string" ||
      !Number.isFinite(Date.parse(result.created_at))) {
    throw new TypeError("RESULT_ENVELOPE_INVALID");
  }
  const serialized = JSON.stringify(envelope);
  if (new TextEncoder().encode(serialized).byteLength > MAX_ENVELOPE_BYTES) {
    throw new RangeError("RESULT_ENVELOPE_TOO_LARGE");
  }
  return {
    serialized,
    result,
    identity,
    provenance
  };
}

/**
 * Append-only, owner-scoped persistence for result envelopes.
 * Duplicate result IDs are ignored; records are never overwritten.
 * This function does not grant VERIFIED status or validate external evidence.
 */
export async function persistResultEnvelope(db, ownerScope, envelope) {
  requireDb(db);
  const safe = validateEnvelope(ownerScope, envelope);
  const result = safe.result;
  const write = await db.prepare(`INSERT OR IGNORE INTO redultron_execution_results
    (result_id, owner_scope, execution_id, trace_id, task_id, core_id, status,
     verification, created_at, build_sha, deployment_id, envelope_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      result.result_id,
      ownerScope,
      result.execution_id,
      result.trace_id,
      result.task_id || null,
      safe.identity.core_id,
      result.status,
      result.verification,
      result.created_at,
      safe.provenance.build_sha || null,
      safe.provenance.deployment_id || null,
      safe.serialized
    ).run();
  const changes = Number(write?.meta?.changes ?? 0);
  return { persisted: changes > 0, duplicate: changes === 0, traceId: result.trace_id };
}

export async function readResultEnvelope(db, ownerScope, traceId) {
  requireDb(db);
  if (!validText(ownerScope) || !validText(traceId)) return null;
  const row = await db.prepare(`SELECT envelope_json AS envelopeJson
    FROM redultron_execution_results
    WHERE owner_scope = ? AND trace_id = ?
    ORDER BY created_at DESC LIMIT 1`)
    .bind(ownerScope, traceId).first();
  if (!row || typeof row.envelopeJson !== "string") return null;
  if (new TextEncoder().encode(row.envelopeJson).byteLength > MAX_ENVELOPE_BYTES) {
    throw new Error("RESULT_LEDGER_RECORD_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(row.envelopeJson);
    validateEnvelope(ownerScope, parsed);
    return parsed;
  } catch {
    throw new Error("RESULT_LEDGER_RECORD_INVALID");
  }
}
