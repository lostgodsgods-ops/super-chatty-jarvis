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


test("provenance deploy synchronizes the canonical secret to Render before changing Worker bindings", () => {
  const provenance = readWorkflow("../.github/workflows/redultron-provenance-deploy.yml");
  assert.match(provenance, /RENDER_API_KEY:\\s*\\$\\{\\{\\s*secrets\\.RENDER_API_KEY\\s*\\}\\}/,
    "Render API credential must come from GitHub Actions secrets");
  assert.match(provenance, /services\\/srv-dbdhr0mi0phs739rv98g\\/env-vars\\/OWNER_SECRET/,
    "the known Python Core Render service must receive the canonical owner secret");
  assert.match(provenance, /services\\/srv-dbdhr0mi0phs739rv98g\\/deploys/,
    "Render must be redeployed when its owner secret changes");
  const renderSync = provenance.indexOf("Synchronize canonical owner secret to Render Python Core");
  const workerSync = provenance.indexOf("Synchronize owner secret to the deployed Worker");
  const workerDeploy = provenance.indexOf("Deploy exact GitHub commit provenance");
  assert.ok(renderSync >= 0 && workerSync > renderSync && workerDeploy > workerSync,
    "Render secret sync must succeed before Worker secret update and deployment");
  assert.match(provenance, /RENDER_OWNER_SECRET_MISMATCH|Render owner secret sync/,
    "Render secret synchronization must fail closed with a sanitized diagnostic");
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
