/**
 * Evidence-based capability evaluation for agent runs.
 *
 * This module measures supplied test evidence; it does not grant permissions,
 * execute tools, or infer success from a model's self-report.
 */
const VALID_STATUSES = new Set(["PASS", "FAIL", "BLOCKED", "NOT_TESTED"]);
const MAX_CHECKS = 100;
const MAX_TEXT = 500;

function clean(value, max = MAX_TEXT) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function reportStatus(checks) {
  if (!checks.length) return "NOT_TESTED";
  if (checks.some(check => check.status === "FAIL")) return "FAIL";
  if (checks.some(check => check.status === "BLOCKED")) return "BLOCKED";
  if (checks.some(check => check.status === "NOT_TESTED")) return "NOT_TESTED";
  return "PASS";
}

export function evaluateCapabilityRun(input) {
  const rawChecks = Array.isArray(input?.checks) ? input.checks : [];
  if (rawChecks.length > MAX_CHECKS) {
    const error = new Error("TOO_MANY_CAPABILITY_CHECKS");
    error.code = "TOO_MANY_CAPABILITY_CHECKS";
    throw error;
  }

  const ids = new Set();
  const checks = rawChecks.map((raw, index) => {
    const id = clean(raw?.id, 80);
    if (!id) {
      const error = new Error("CHECK_ID_REQUIRED");
      error.code = "CHECK_ID_REQUIRED";
      throw error;
    }
    if (ids.has(id)) {
      const error = new Error("DUPLICATE_CHECK_ID");
      error.code = "DUPLICATE_CHECK_ID";
      throw error;
    }
    ids.add(id);

    const weight = raw?.weight === undefined ? 1 : raw.weight;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
      const error = new Error("INVALID_CHECK_WEIGHT");
      error.code = "INVALID_CHECK_WEIGHT";
      throw error;
    }

    const requestedStatus = clean(raw?.status, 20).toUpperCase();
    const evidence = clean(raw?.evidence, 300);
    let status = VALID_STATUSES.has(requestedStatus) ? requestedStatus : "NOT_TESTED";
    let code = clean(raw?.code, 80) || null;

    if (status === "PASS" && !evidence) {
      status = "NOT_TESTED";
      code = "MISSING_EVIDENCE";
    } else if (!VALID_STATUSES.has(requestedStatus)) {
      code = "INVALID_STATUS";
    }

    return {
      id, index, weight, status, evidence: evidence || null,
      code, detail: clean(raw?.detail, 300) || null
    };
  });

  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks.reduce((sum, check) => sum + (check.status === "PASS" ? check.weight : 0), 0);
  const scorePercent = totalWeight ? Math.round((passedWeight / totalWeight) * 10000) / 100 : 0;
  const nextActions = checks
    .filter(check => check.status !== "PASS")
    .map(check => {
      if (check.status === "FAIL") return "Fix failing check '" + check.id + "' and rerun it.";
      if (check.status === "BLOCKED") return "Resolve blocker for '" + check.id + "': " + (check.detail || "inspect its evidence") + ".";
      return "Run '" + check.id + "' and attach verifiable evidence" + (check.code ? " (" + check.code + ")" : "") + ".";
    });

  return {
    schemaVersion: "1.0.0",
    status: reportStatus(checks),
    scorePercent,
    totalCount: checks.length,
    passedCount: checks.filter(check => check.status === "PASS").length,
    failedCount: checks.filter(check => check.status === "FAIL").length,
    blockedCount: checks.filter(check => check.status === "BLOCKED").length,
    untestedCount: checks.filter(check => check.status === "NOT_TESTED").length,
    checks,
    nextActions
  };
}
