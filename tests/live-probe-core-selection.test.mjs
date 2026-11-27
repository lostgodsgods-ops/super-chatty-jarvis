import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scheduled live probe certifies the actual configured hybrid engine, not only Python", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  assert.match(workflow, /\.engine == "python-edge-hybrid" or \.engine == "php-edge-hybrid"/);
  assert.match(workflow, /\.hybridCoreExecutionVerified == true/);
  assert.match(workflow, /\.fallbackEngaged == false/);
  assert.match(workflow, /\.hybridPythonCoreExecutionVerified == true/);
  assert.match(workflow, /\.hybridPhpCoreExecutionVerified == true/);
});

test("scheduled live probe emits provider-neutral sanitized failure diagnostics", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  assert.match(workflow, /hybridCoreExecutionVerified/);
  assert.match(workflow, /hybridPhpCoreExecutionVerified/);
  assert.match(workflow, /hybridPythonCoreExecutionVerified/);
});


test("live probe failure diagnostics are explicitly allowlisted and secret-safe", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  for (const field of [
    "provider", "endpointConfigured", "endpointValid", "ownerSecretConfigured",
    "ownerSecretPolicyValid", "readyForRequest", "failureCode",
    "runtimeReachabilityVerified", "ownerSecretMatchVerified"
  ]) {
    assert.match(workflow, new RegExp(field));
  }
  assert.match(workflow, /sanitized config=\$config_diag/);
  assert.match(workflow, /sanitizedConfig=\$config_diag/);
  assert.match(workflow, /configDiagnostics \| type/);
  assert.doesNotMatch(workflow, /echo.*\$hybrid_file/);
});

test("scheduled live probe rejects a stale Worker deployment before hybrid certification", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  assert.match(workflow, /\.deployment\.commitSha/);
  assert.match(workflow, /\$GITHUB_SHA/);
  assert.match(workflow, /WORKER_DEPLOYMENT_STALE/);
});

test("scheduled live probe runs the negative-auth control before a stale-provenance gate", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  const negativeAuthProbe = workflow.indexOf('invalid_auth_status="$(curl');
  const provenanceGate = workflow.indexOf("WORKER_DEPLOYMENT_STALE");
  const authenticatedProbe = workflow.indexOf('hybrid_status="$(curl');
  assert.ok(negativeAuthProbe >= 0, "negative-auth control must exist");
  assert.ok(provenanceGate >= 0, "strict deployment-provenance gate must exist");
  assert.ok(authenticatedProbe >= 0, "authenticated hybrid probe must exist");
  assert.ok(negativeAuthProbe < provenanceGate, "negative-auth control must run even when provenance is stale");
  assert.ok(provenanceGate < authenticatedProbe, "authenticated secret-bearing probe must remain behind provenance gate");
});

test("scheduled live probe defers negative-auth failure until after stale provenance is reported", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  const negativeAuthProbe = workflow.indexOf('invalid_auth_status="$(curl');
  const provenanceGate = workflow.indexOf("WORKER_DEPLOYMENT_STALE");
  const negativeAuthFailure = workflow.indexOf("Negative authentication control failed:");
  const authenticatedProbe = workflow.indexOf('hybrid_status="$(curl');
  assert.ok(negativeAuthProbe >= 0, "negative-auth control must exist");
  assert.ok(provenanceGate >= 0, "strict deployment-provenance gate must exist");
  assert.ok(negativeAuthFailure >= 0, "negative-auth failure must be checked");
  assert.ok(authenticatedProbe >= 0, "authenticated hybrid probe must exist");
  assert.ok(negativeAuthProbe < provenanceGate, "negative-auth request must run before provenance check");
  assert.ok(provenanceGate < negativeAuthFailure, "stale provenance must be reported before a negative-auth status failure");
  assert.ok(negativeAuthFailure < authenticatedProbe, "negative-auth control must pass before the owner-secret request");
  assert.match(workflow, /invalid_auth_status="000"/, "transport errors must be recorded as status 000 so provenance can still be diagnosed");
});
