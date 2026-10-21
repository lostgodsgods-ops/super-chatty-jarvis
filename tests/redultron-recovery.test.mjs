import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decideRecovery, MAX_ATTEMPTS } from "../scripts/redultron-recovery-policy.mjs";

test("retries failed run on attempt one", () => {
  assert.deepEqual(decideRecovery({ attempt: 1, conclusion: "failure" }), { action: "retry_failed_jobs", attempt: 1, maxAttempts: 3 });
});
test("retries attempt two but exhausts at attempt three", () => {
  assert.equal(decideRecovery({ attempt: 2, conclusion: "timed_out" }).action, "retry_failed_jobs");
  assert.equal(decideRecovery({ attempt: 3, conclusion: "failure" }).action, "incident_and_lock");
  assert.equal(MAX_ATTEMPTS, 3);
});
test("successful, cancelled, and skipped runs are not retried", () => {
  for (const conclusion of ["success", "cancelled", "skipped"]) assert.equal(decideRecovery({ attempt: 3, conclusion }).action, "none");
});
test("invalid attempt metadata fails closed", () => {
  for (const attempt of [0, -1, 1.5, NaN, "2"]) assert.throws(() => decideRecovery({ attempt, conclusion: "failure" }), TypeError);
});
test("workflow is permanent, event-driven, bounded, and fork-isolated", async () => {
  const w = await readFile(new URL("../.github/workflows/redultron-failure-sentinel.yml", import.meta.url), "utf8");
  assert.match(w, /  push:/);
  assert.match(w, /  workflow_run:/);
  assert.match(w, /      - CI\n      - Test Central Agent/);
  assert.match(w, /actions: write/);
  assert.match(w, /contents: read/);
  assert.match(w, /issues: write/);
  assert.match(w, /steps\.source\.outputs\.attempt < 3/);
  assert.match(w, /steps\.source\.outputs\.attempt >= 3/);
  assert.match(w, /\[REDULTRON\]\[FAIL\]/);
  assert.match(w, /head_repository\.full_name == github\.repository/);
  assert.doesNotMatch(w, /administration: write|contents: write/);
});
test("owner gate and honest lock scope are documented", async () => {
  const d = await readFile(new URL("../docs/REDULTRON-RECOVERY.md", import.meta.url), "utf8");
  assert.match(d, /owner-approved/i);
  assert.match(d, /not a GitHub branch-protection change/i);
  assert.match(d, /three-attempt/i);
});
