const MAX_CHECKS = 20;
const MAX_EVIDENCE = 40;
const SECRET_PATTERN = /(?:bearer\\s+\\S+|(?:secret|token|password|api[_-]?key)\\s*[:=]\\s*\\S+)/i;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,119}$/;

function safeReference(value) {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  return candidate.length <= 120 && SAFE_REFERENCE.test(candidate) && !SECRET_PATTERN.test(candidate)
    ? candidate : "";
}

/**
 * Independent, deterministic gate for externally evidenced outcomes.
 * Model self-assessment is deliberately ignored. This evaluator does not
 * execute checks; it only assesses supplied, bounded evidence references.
 */
export function evaluateNeuralResult(input = {}) {
  const checks = Array.isArray(input.checks) ? input.checks.slice(0, MAX_CHECKS) : [];
  const evidence = Array.isArray(input.evidence)
    ? input.evidence.slice(0, MAX_EVIDENCE).map(safeReference).filter(Boolean)
    : [];
  const evidenceSet = new Set(evidence);
  const ids = new Set();
  const reasons = [];
  let checksPassed = 0;
  let checksFailed = 0;
  let checksPending = 0;

  if (checks.length === 0) reasons.push("NO_INDEPENDENT_CHECKS");

  for (const check of checks) {
    const id = typeof check?.id === "string" ? check.id.trim().slice(0, 80) : "";
    const reference = safeReference(check?.evidenceRef);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id)) {
      reasons.push("CHECK_ID_INVALID");
      checksPending++;
      continue;
    }
    if (ids.has(id)) {
      reasons.push("DUPLICATE_CHECK_ID");
      checksPending++;
      continue;
    }
    ids.add(id);
    if (!reference || !evidenceSet.has(reference)) {
      reasons.push("CHECK_EVIDENCE_INVALID");
      checksPending++;
      continue;
    }
    if (check.status === "failed") checksFailed++;
    else if (check.status === "passed") checksPassed++;
    else checksPending++;
  }

  if (checks.length > MAX_CHECKS || (Array.isArray(input.evidence) && input.evidence.length > MAX_EVIDENCE)) {
    reasons.push("EVIDENCE_LIMIT_EXCEEDED");
  }
  if (evidence.length === 0) reasons.push("NO_VERIFIABLE_EVIDENCE");

  let verdict = "REVIEW_REQUIRED";
  if (checksFailed > 0) verdict = "FAIL";
  else if (checks.length > 0 && checksPending === 0 && checksPassed === checks.length &&
           evidence.length > 0 && reasons.length === 0) verdict = "PASS";

  const summary = verdict === "PASS"
    ? "All supplied independent checks passed with matching evidence references."
    : verdict === "FAIL"
      ? "At least one independently reported check failed."
      : "Evidence is incomplete or invalid; human review is required.";

  return Object.freeze({
    verdict,
    independent: true,
    checksPassed,
    checksFailed,
    checksPending,
    evidenceCount: evidence.length,
    reasons: [...new Set(reasons)].slice(0, 12),
    summary
  });
}
