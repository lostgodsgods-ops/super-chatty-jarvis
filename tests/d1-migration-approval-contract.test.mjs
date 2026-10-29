import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url),
  "utf8"
);
const triggerBlock = workflow.match(/^on:\s*\n([\s\S]*?)(?=^permissions:)/m)?.[1] || "";

test("D1 migration workflow is manual and default-deny", () => {
  assert.match(triggerBlock, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(
    triggerBlock,
    /^  (?:push|pull_request|schedule):\s*$/m,
    "production migration workflow must not start automatically"
  );
  assert.match(triggerBlock, /authorize_production_changes:\s*\n(?:[^\n]*\n){0,5}\s+required:\s*true/);
  assert.match(triggerBlock, /default:\s*deny/);
  assert.match(triggerBlock, /options:\s*\n\s+- deny\s*\n\s+- approve/);
});

test("D1 migration requires main plus explicit approval and production environment", () => {
  assert.match(
    workflow,
    /if:\s*\$\{\{\s*github\.ref\s*==\s*'refs\/heads\/main'\s*&&\s*inputs\.authorize_production_changes\s*==\s*'approve'\s*\}\}/
  );
  assert.match(workflow, /^\s+environment:\s*production\s*$/m);
});

test("D1 migration targets the named database with explicit config before Worker deploy", () => {
  const migration = "command: d1 migrations apply super-chatty-owner-auth --remote --config central-agent/wrangler.jsonc";
  const deploy = "command: deploy --config central-agent/wrangler.jsonc";
  const migrationIndex = workflow.indexOf(migration);
  const deployIndex = workflow.indexOf(deploy);
  assert.ok(migrationIndex >= 0, "approved D1 migration step must exist");
  assert.ok(deployIndex > migrationIndex, "migration must precede Worker deployment in the same approved workflow");
  assert.ok(workflow.indexOf("authorize_production_changes == 'approve'") < migrationIndex);
});
