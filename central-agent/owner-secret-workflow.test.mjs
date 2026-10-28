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

test("Python Core health probe retries only transient failures with a hard attempt cap", () => {
  const provenance = readWorkflow("../.github/workflows/redultron-provenance-deploy.yml");
  const healthStep = provenance.split("- name: Verify Python Core health before execution probe")[1]
    ?.split("\n      - name: ")[0] ?? "";
  assert.notEqual(healthStep, "", "Python Core health gate must exist");
  assert.match(healthStep, /for attempt in 1 2 3/,
    "health probe must have exactly three bounded attempts");
  assert.match(healthStep, /502\|503\|504|502.*503.*504/s,
    "only transient gateway/service HTTP failures should trigger retries");
  assert.match(healthStep, /sleep 2/);
  assert.match(healthStep, /sleep 4/);
  assert.match(healthStep, /\.ok == true and \.service ==/,
    "strict JSON schema must remain required after retries");
  assert.match(healthStep, /redultron-python-core/);
  assert.match(healthStep, /response_kind.*HTML_PAGE|HTML_PAGE/,
    "HTML diagnostics must remain visible and HTML must not count as success");
});
