import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readWorkflow = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("hybrid probe and Worker deployment use the same canonical owner secret", () => {
  const probe = readWorkflow("../.github/workflows/redultron-live-probe.yml");
  const provenance = readWorkflow("../.github/workflows/redultron-provenance-deploy.yml");
  const deploy = readWorkflow("../.github/workflows/deploy-central-agent.yml");

  assert.match(probe, /OWNER_SECRET:\s*\$\{\{\s*secrets\.REDULTRON_OWNER_SECRET\s*\}\}/);
  assert.match(provenance, /REDULTRON_OWNER_SECRET:\s*\$\{\{\s*secrets\.REDULTRON_OWNER_SECRET\s*\}\}/);

  const runtimeSecretStep = deploy.split("- name: Configure Worker runtime secrets in one operation")[1]?.split("\n      - name: ")[0] ?? "";
  assert.notEqual(runtimeSecretStep, "", "runtime secret-binding step must exist");
  assert.match(runtimeSecretStep, /OWNER_SECRET:\s*\$\{\{\s*secrets\.REDULTRON_OWNER_SECRET\s*\}\}/,
    "Worker runtime OWNER_SECRET must be sourced from the canonical repository secret");
  assert.match(runtimeSecretStep, /OWNER_SECRET:\s*process\.env\.OWNER_SECRET/,
    "the canonical secret must be included in the actual Wrangler secret payload");
  assert.doesNotMatch(runtimeSecretStep, /secrets\.OWNER_SECRET\s*\}\}/,
    "legacy OWNER_SECRET secret must not be used for runtime binding");
});


test("live gateway probe checks DNS before HTTP and verifies invalid owner credentials are rejected", () => {
  const probe = readWorkflow("../.github/workflows/redultron-live-probe.yml");
  assert.match(probe, /getent\s+ahosts|dns\.promises\.lookup|dns\.lookup/,
    "probe must explicitly validate DNS resolution before HTTP checks");
  assert.match(probe, /invalid|wrong|bogus|negative-auth|unauthorized/i,
    "probe must include a negative authentication control");
  assert.match(probe, /401|403/,
    "probe must require unauthorized credentials to be rejected");
});


test("production provenance deployment is manual-only and requires explicit approval", () => {
  const workflow = readWorkflow("../.github/workflows/redultron-provenance-deploy.yml");
  const triggers = workflow.split(/^permissions:/m)[0] ?? workflow;

  assert.doesNotMatch(triggers, /^\s{2}push:/m,
    "production provenance deployment must not auto-run on pushes");
  assert.match(triggers, /workflow_dispatch:[\s\S]*inputs:/,
    "manual dispatch must expose an explicit approval input");
  assert.match(triggers, /authorize_production_changes/,
    "the workflow must name its production approval input");
  assert.match(triggers, /default:\s*deny/,
    "production approval must default to deny");
  assert.ok(workflow.includes("if: ${{ github.ref == 'refs/heads/main' && inputs.authorize_production_changes == 'approve' }}"),
    "the production-changing job must require main-branch dispatch and explicit approval");
});


test("provenance deploy rejects a short owner secret before production sync", () => {
  const provenance = readWorkflow("../.github/workflows/redultron-provenance-deploy.yml");
  const credentials = provenance
    .split("- name: Require deployment and authenticated probe credentials")[1]
    ?.split("\n      - name: ")[0] ?? "";
  assert.notEqual(credentials, "", "credential preflight step must exist");
  assert.match(credentials, /\$\{#REDULTRON_OWNER_SECRET\}.*-ge 32/,
    "deployment must reject owner secrets shorter than 32 characters before production changes");
  assert.match(credentials, /value suppressed/i,
    "minimum-length failure must not expose the secret value");
  const validation = provenance.indexOf("${#REDULTRON_OWNER_SECRET}");
  const sync = provenance.indexOf("- name: Synchronize owner secret to the deployed Worker");
  assert.ok(validation >= 0 && sync > validation,
    "minimum-length validation must happen before Worker secret synchronization");
});


test("all production deploy workflows require main-branch approval and do not auto-run on pushes", () => {
  for (const path of [
    "../.github/workflows/deploy-central-agent.yml",
    "../.github/workflows/deploy-cloudflare.yml"
  ]) {
    const workflow = readWorkflow(path);
    const triggers = workflow.split(/^permissions:/m)[0] ?? workflow;
    assert.doesNotMatch(triggers, /^\s{2}push:/m,
      path + " must not auto-run production changes on pushes");
    assert.match(triggers, /workflow_dispatch:[\s\S]*inputs:/,
      path + " must expose a manual dispatch approval input");
    assert.match(triggers, /authorize_production_changes/,
      path + " must name its production approval input");
    assert.match(triggers, /default:\s*deny/,
      path + " must default production approval to deny");
    assert.ok(workflow.includes("if: ${{ github.ref == 'refs/heads/main' && inputs.authorize_production_changes == 'approve' }}"),
      path + " must require main-branch dispatch and explicit approval");
  }
});
