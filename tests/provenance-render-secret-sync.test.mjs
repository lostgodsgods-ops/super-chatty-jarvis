import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provenance deploy synchronizes the same owner secret to Render before authenticated certification", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  const workerDeploy = workflow.indexOf("- name: Deploy exact GitHub commit with secrets atomically");
  const renderSync = workflow.indexOf("- name: Synchronize OWNER_SECRET to Render sidecar");
  const authProbe = workflow.indexOf("- name: Require actual authenticated Python hybrid execution");
  assert.ok(workerDeploy >= 0 && renderSync > workerDeploy && authProbe > renderSync,
    "Worker deployment must be followed by Render secret synchronization before authenticated probe");
  const sync = workflow.slice(renderSync, authProbe);
  assert.match(sync, /RENDER_API_KEY/);
  assert.match(sync, /RENDER_SERVICE_ID/);
  assert.match(sync, /REDULTRON_OWNER_SECRET/);
  assert.match(sync, /OWNER_SECRET/);
  assert.match(sync, /PATCH/);
  assert.match(sync, /curl --silent/);
  assert.doesNotMatch(sync, /curl .*--verbose|set -x|echo .*OWNER_SECRET/);
});
