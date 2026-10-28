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

test("all production deployment and secret-sync workflows fail closed behind explicit approval", () => {
  const central = readWorkflow("../.github/workflows/deploy-central-agent.yml");
  const cloudflare = readWorkflow("../.github/workflows/deploy-cloudflare.yml");
  const provenance = readWorkflow("../.github/workflows/redultron-provenance-deploy.yml");

  for (const [name, workflow] of [
    ["Central Agent", central],
    ["Cloudflare Worker", cloudflare],
    ["Provenance deployment", provenance],
  ]) {
    assert.doesNotMatch(workflow, /^  push:/m, name + " must not deploy automatically on push");
    assert.match(workflow, /^  workflow_dispatch:\n    inputs:\n      authorize_production_changes:/m,
      name + " must require an explicit manual authorization input");
    assert.match(workflow, /default:\s*deny/, name + " must default to deny");
    assert.match(workflow, /inputs\.authorize_production_changes\s*==\s*'approve'/,
      name + " job must run only when approval is explicitly selected");
    assert.match(workflow, /environment:\s*production/, name + " must use the production environment gate");
  }

  assert.match(central, /OWNER_SECRET.*-ge 32/,
    "Central Agent must reject weak owner secrets before deployment");
  assert.match(provenance, /REDULTRON_OWNER_SECRET.*-ge 32/,
    "Provenance deployment must reject weak owner secrets before secret sync");
});
