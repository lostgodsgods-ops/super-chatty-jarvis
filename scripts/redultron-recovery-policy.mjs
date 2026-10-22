export const MAX_ATTEMPTS = 3;

export function decideRecovery({ attempt, conclusion }) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError("attempt must be a positive integer");
  if (conclusion === "success") return { action: "none", reason: "source run succeeded" };
  if (["cancelled", "skipped"].includes(conclusion)) return { action: "none", reason: `source run ${conclusion}` };
  if (attempt < MAX_ATTEMPTS) return { action: "retry_failed_jobs", attempt, maxAttempts: MAX_ATTEMPTS };
  return { action: "incident_and_lock", attempt, maxAttempts: MAX_ATTEMPTS };
}
