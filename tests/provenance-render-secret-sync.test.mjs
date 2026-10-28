import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provenance deploy preflights Render credentials and synchronizes one secret before Worker rollout", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  const preflight = workflow.indexOf("- name: Require deployment and authenticated probe credentials");
  const renderSync = workflow.indexOf("- name: Synchronize OWNER_SECRET to Render sidecar");
  const renderDeploy = workflow.indexOf("- name: Deploy Render sidecar with synchronized owner secret");
  const workerDeploy = workflow.indexOf("- name: Deploy exact GitHub commit with secrets atomically");
  const authProbe = workflow.indexOf("- name: Require actual authenticated Python hybrid execution");

  assert.ok(preflight >= 0 && renderSync > preflight && renderDeploy > renderSync &&
    workerDeploy > renderDeploy && authProbe > workerDeploy,
    "preflight, Render sync/deploy, Worker deploy, then authenticated probe must remain ordered");

  const preflightBlock = workflow.slice(preflight, renderSync);
  assert.match(preflightBlock, /RENDER_API_KEY:/);
  assert.match(preflightBlock, /RENDER_SERVICE_ID:/);
  assert.match(preflightBlock, /test -n "\$RENDER_API_KEY"/);
  assert.match(preflightBlock, /test -n "\$RENDER_SERVICE_ID"/);
  assert.match(preflightBlock, /RENDER_SERVICE_ID.*srv-/);

  const sync = workflow.slice(renderSync, renderDeploy);
  assert.match(sync, /RENDER_API_KEY/);
  assert.match(sync, /RENDER_SERVICE_ID/);
  assert.match(sync, /REDULTRON_OWNER_SECRET/);
  assert.match(sync, /OWNER_SECRET/);
  assert.match(sync, /-X PUT/);
  assert.match(sync, /\/env-vars\/OWNER_SECRET/);
  assert.match(sync, /JSON\.stringify\(\{ value: secret \}\)/);
  assert.match(sync, /curl --silent/);
  assert.doesNotMatch(sync, /curl .*--verbose|set -x/);
  assert.doesNotMatch(sync, /echo[^\n]*\$(?:\{(?:REDULTRON_)?OWNER_SECRET\}|(?:REDULTRON_)?OWNER_SECRET)/);

  const renderDeployment = workflow.slice(renderDeploy, workerDeploy);
  assert.match(renderDeployment, /deploy_state[\s\S]*\blive\b/);
  assert.match(renderDeployment, /\/deploys/);
  assert.match(renderDeployment, /deploy_state[\\s\\S]*\\blive\\b/);
  assert.match(renderDeployment, /attempt/);
});
