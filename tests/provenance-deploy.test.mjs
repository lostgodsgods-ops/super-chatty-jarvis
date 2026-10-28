import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provenance deploy validates the owner secret before production mutation", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  const validation = workflow.indexOf("- name: Require deployment and authenticated probe credentials");
  const deploy = workflow.indexOf("- name: Deploy exact GitHub commit with secrets atomically");
  assert.ok(validation >= 0 && deploy > validation, "credential validation must precede deployment");
  const preDeploy = workflow.slice(validation, deploy);
  assert.match(preDeploy, /REDULTRON_OWNER_SECRET/);
  assert.match(preDeploy, /-ge 32/);
  assert.match(preDeploy, /value suppressed/);
});

test("provenance deployment uploads code and both secrets in one guarded deploy", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /--secrets-file "\$secrets_file"/);
  assert.match(workflow, /PYTHON_CORE_URL: process\.env\.PYTHON_CORE_URL/);
  assert.match(workflow, /OWNER_SECRET: process\.env\.REDULTRON_OWNER_SECRET/);
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /mode: 0o600/);
  assert.match(workflow, /trap 'rm -f "\$secrets_file"' EXIT/);
  assert.doesNotMatch(workflow, /wrangler@4 secret put/);
  assert.doesNotMatch(workflow, /wrangler@4 versions secret bulk/);
  assert.equal((workflow.match(/wrangler@4 deploy/g) || []).length, 1, "the guarded job must have exactly one deployment operation");
});
