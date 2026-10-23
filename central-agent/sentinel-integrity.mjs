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
