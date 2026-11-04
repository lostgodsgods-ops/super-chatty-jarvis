import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowPath = new URL("../.github/workflows/redultron-owner-secret-readonly-check.yml", import.meta.url);

test("owner-secret parity check is manual-only and read-only", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const triggers = workflow.split(/^permissions:/m)[0] ?? workflow;

  assert.match(triggers, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(triggers, /^  (?:push|pull_request|schedule):\s*$/m);
  assert.match(workflow, /RENDER_API_KEY:\s*\$\{\{\s*secrets\.RENDER_API_KEY\s*\}\}/);
  assert.match(workflow, /RENDER_SERVICE_ID:\s*\$\{\{\s*secrets\.RENDER_SERVICE_ID\s*\}\}/);
  assert.match(workflow, /REDULTRON_OWNER_SECRET:\s*\$\{\{\s*secrets\.REDULTRON_OWNER_SECRET\s*\}\}/);
  assert.match(workflow, /--request GET/);
  assert.match(workflow, /\/env-vars\?limit=100/);
  assert.doesNotMatch(workflow, /--request\s+(?:POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(workflow, /\/deploys|wrangler[^\n]*deploy/i);
});

test("owner-secret parity check compares exact values in memory and reports no secret material", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /timingSafeEqual/);
  assert.match(workflow, /secret !== secret\.trim\(\)/);
  assert.match(workflow, /\[\\r\\n\]/);
  assert.match(workflow, /at least 32 characters/);
  assert.match(workflow, /value suppressed|values suppressed/);
  assert.doesNotMatch(workflow, /console\.log\([^)]*(?:githubSecret|renderSecret|REDULTRON_OWNER_SECRET|ownerEntry\.envVar\.value)|echo[^\n]*\$(?:\{REDULTRON_OWNER_SECRET\}|REDULTRON_OWNER_SECRET)/i);
});

test("owner-secret parity check fails closed when either credential or Render value is unavailable", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /Missing RENDER_API_KEY/);
  assert.match(workflow, /Missing RENDER_SERVICE_ID/);
  assert.match(workflow, /Missing REDULTRON_OWNER_SECRET/);
  assert.match(workflow, /OWNER_SECRET was not found/);
  assert.match(workflow, /exit 1/);
});
