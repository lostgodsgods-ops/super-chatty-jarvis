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
