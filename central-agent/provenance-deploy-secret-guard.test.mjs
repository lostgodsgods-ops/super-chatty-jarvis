import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url),
  "utf8"
);

test("provenance deployment rejects short owner secrets before Worker secret sync", () => {
  const credentialStep = workflow.indexOf("- name: Require deployment and authenticated probe credentials");
  const syncStep = workflow.indexOf("- name: Synchronize owner secret to the deployed Worker without logging it");
  const deployStep = workflow.indexOf("- name: Deploy exact GitHub commit provenance");

  assert.ok(credentialStep >= 0, "credential validation step must exist");
  assert.ok(syncStep > credentialStep, "secret synchronization must follow credential validation");
  assert.ok(deployStep > syncStep, "deployment must follow secret synchronization");

  const preSyncValidation = workflow.slice(credentialStep, syncStep);
  assert.match(preSyncValidation, /\$\{#REDULTRON_OWNER_SECRET\}/);
  assert.match(preSyncValidation, /-lt\s+32/);
  assert.match(preSyncValidation, /value suppressed/i);
  assert.doesNotMatch(preSyncValidation, /echo[^\n]*\$REDULTRON_OWNER_SECRET/);
});
