import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("owner directive authorizes autonomous engineering work within configured capability boundaries", async () => {
  const policy = JSON.parse(await readFile(new URL("../config/autonomy-directive.json", import.meta.url), "utf8"));
  assert.equal(policy.schemaVersion, "1.0.0");
  assert.equal(policy.authority, "owner-delegated");
  assert.equal(policy.mode, "autonomous-engineering");
  assert.equal(policy.execution.continueUntilBlocked, true);
  assert.equal(policy.execution.requireTestsBeforeIntegration, true);
  assert.equal(policy.execution.requireEvidenceForClaims, true);
  assert.ok(policy.allowedCapabilities.includes("repository_read"));
  assert.ok(policy.allowedCapabilities.includes("propose_and_test_code_changes"));
  assert.ok(policy.allowedCapabilities.includes("public_web_research"));
  assert.ok(policy.allowedCapabilities.includes("build_pwa_artifacts"));
});

test("owner directive cannot turn owner authority into unrestricted secret or safety bypass", async () => {
  const policy = JSON.parse(await readFile(new URL("../config/autonomy-directive.json", import.meta.url), "utf8"));
  assert.equal(policy.security.ownerAuthorityImmutable, true);
  assert.equal(policy.security.secretValuesInLogs, false);
  assert.equal(policy.security.bypassAuthentication, false);
  assert.equal(policy.security.disableAudit, false);
  assert.equal(policy.security.unreviewedProductionDeploy, false);
  assert.equal(policy.security.irreversibleActionsWithoutRequiredApproval, false);
});

test("autonomous agent must distinguish evidence-backed completion from blocked or unverified work", async () => {
  const policy = JSON.parse(await readFile(new URL("../config/autonomy-directive.json", import.meta.url), "utf8"));
  assert.deepEqual(policy.statuses, ["PASS", "FAIL", "BLOCKED", "NOT_TESTED"]);
  assert.ok(policy.requiredEvidence.includes("commit_sha"));
  assert.ok(policy.requiredEvidence.includes("test_run"));
  assert.ok(policy.requiredEvidence.includes("runtime_http_status"));
});
