/**
 * REDULTRON runtime identity and result-envelope primitives.
 *
 * Identity is provenance metadata, never an authentication or authorization
 * credential. Verification is granted only from the designated evidence
 * evaluator evidence must be independently resolved before verification; callers
 * cannot promote a result by supplying an attestation-shaped object.
 */
const CORE_ID = "redultron.core.primary";
const CORE_NAME = "REDULTRON";
const PRODUCT_NAME = "REDULTRON CORE";
const IDENTITY_SCHEMA_VERSION = "1.0.0";
const VALID_STATUSES = new Set(["PASS", "FAIL", "BLOCKED", "NOT_TESTED"]);
const MAX_SUMMARY = 500;
const MAX_EVIDENCE = 20;
const MAX_EVIDENCE_LENGTH = 300;
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(token|secret|password|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
  /\b(sk-[A-Za-z0-9_-]{12,})\b/gi
];

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  let output = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED]");
  return output.slice(0, limit);
}

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error("SECURE_UUID_UNAVAILABLE");
}

export function buildCoreIdentity({ version = "3.0.0", instanceId = null, buildSha = null, deploymentId = null } = {}) {
  const safeVersion = cleanText(version, 40);
  if (!safeVersion) throw new TypeError("CORE_IDENTITY_INVALID");
  return Object.freeze({
    core_id: CORE_ID,
    name: CORE_NAME,
    product: PRODUCT_NAME,
    version: safeVersion,
    identity_schema_version: IDENTITY_SCHEMA_VERSION,
    instance_id: validId(instanceId) ? instanceId : null,
    build_sha: typeof buildSha === "string" && /^[a-f0-9]{7,64}$/i.test(buildSha) ? buildSha : null,
    deployment_id: validId(deploymentId) ? deploymentId : null
  });
}

export function buildResultEnvelope(input = {}) {
  const ids = input.ids || {};
  const resultId = ids.resultId ?? uuid();
  const executionId = ids.executionId ?? uuid();
  const traceId = ids.traceId ?? uuid();
  if (![resultId, executionId, traceId].every(validId)) throw new TypeError("RESULT_IDENTITY_INVALID");

  const requestedStatus = input.status;
  if (!VALID_STATUSES.has(requestedStatus)) throw new TypeError("RESULT_STATUS_INVALID");

  const evidence = Array.isArray(input.evidence)
    ? input.evidence.slice(0, MAX_EVIDENCE).map(item => cleanText(item, MAX_EVIDENCE_LENGTH)).filter(Boolean)
    : [];
  let status = requestedStatus;
  let verification = "UNVERIFIED";
  let code = cleanText(input.code, 80) || null;

  if (status === "PASS" && evidence.length === 0) {
    status = "NOT_TESTED";
    code = "MISSING_EVIDENCE";
  } else if (status === "PASS") {
    // Evidence references are currently recorded, not independently resolved.
    // Never trust caller-supplied attestation-shaped data as a trust boundary.
    verification = "UNVERIFIED";
  } else if (status === "FAIL") {
    verification = "FAILED";
  }

  const clock = typeof input.clock === "function" ? input.clock : () => new Date().toISOString();
  const createdAt = clock();
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
    throw new TypeError("RESULT_TIMESTAMP_INVALID");
  }

  const rawProvenance = input.provenance || {};
  const provenance = {
    source: cleanText(rawProvenance.source, 100) || "unspecified",
    build_sha: typeof rawProvenance.buildSha === "string" && /^[a-f0-9]{7,64}$/i.test(rawProvenance.buildSha) ? rawProvenance.buildSha : null,
    deployment_id: validId(rawProvenance.deploymentId) ? rawProvenance.deploymentId : null
  };

  return Object.freeze({
    identity: buildCoreIdentity(input.identity || {}),
    result: Object.freeze({
      result_id: resultId,
      execution_id: executionId,
      trace_id: traceId,
      task_id: validId(input.taskId) ? input.taskId : null,
      created_at: createdAt,
      status,
      verification,
      summary: cleanText(input.summary, MAX_SUMMARY) || null,
      evidence: Object.freeze(evidence),
      code
    }),
    provenance: Object.freeze(provenance)
  });
}

export const CORE_IDENTITY_CONSTANTS = Object.freeze({
  coreId: CORE_ID,
  name: CORE_NAME,
  identitySchemaVersion: IDENTITY_SCHEMA_VERSION
});
