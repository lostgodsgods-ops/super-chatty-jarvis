import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provenance workflow batches Worker secret updates into one version operation", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /wrangler@4 versions secret bulk/);
  assert.doesNotMatch(workflow, /wrangler@4 secret put/);
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /mode: 0o600/);
  assert.match(workflow, /trap .*secrets_file/);
  assert.match(workflow, /OWNER_SECRET/);
  assert.match(workflow, /PYTHON_CORE_URL/);
});

test("provenance workflow only deploys after the single bulk secret update", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  const secretStep = workflow.indexOf("Synchronize owner secret to the deployed Worker without logging it");
  const deployStep = workflow.indexOf("Deploy exact GitHub commit provenance");
  assert.ok(secretStep >= 0 && deployStep > secretStep, "bulk secret sync must precede the deployment step");
  const section = workflow.slice(secretStep, deployStep);
  assert.equal((section.match(/versions secret bulk/g) || []).length, 1, "secret update should be a single bulk operation");
});
