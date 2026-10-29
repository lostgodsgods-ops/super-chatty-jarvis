import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/redultron-failure-sentinel.yml", import.meta.url),
  "utf8"
);

test("Sentinel retries only allowlisted same-repository workflow runs", () => {
  const workflowRunBlock = workflow.match(/^  workflow_run:\s*\n([\s\S]*?)(?=^permissions:)/m)?.[1] || "";
  assert.match(workflowRunBlock, /workflows:\s*\n\s+- CI\s*\n\s+- Test Central Agent/);
  assert.match(workflowRunBlock, /types:\s*\n\s+- completed/);
  assert.match(workflow, /HEAD_REPOSITORY" == "\$REPOSITORY/);
  assert.match(workflow, /WORKFLOW_NAME" == "CI" \|\| "\$WORKFLOW_NAME" == "Test Central Agent/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
});

test("Sentinel concurrency is keyed by source run and never cancels the active recovery", () => {
  assert.match(workflow, /group:\s*redultron-sentinel-\$\{\{\s*github\.event\.workflow_run\.id\s*\|\|\s*github\.sha\s*\}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test("Sentinel re-reads current attempt before requesting a bounded retry", () => {
  assert.match(workflow, /Confirm source run attempt is still current/);
  assert.match(workflow, /gh api "repos\/\$REPOSITORY\/actions\/runs\/\$RUN_ID" --jq '\.run_attempt'/);
  assert.match(workflow, /current_attempt" != "\$ATTEMPT/);
  assert.match(workflow, /steps\.source\.outputs\.attempt < 3 && steps\.retry_guard\.outputs\.eligible == 'true'/);
  assert.match(workflow, /gh run rerun "\$RUN_ID" --failed --repo "\$REPOSITORY"/);
});

test("Sentinel stops after attempt three and suppresses duplicate open incidents", () => {
  assert.match(workflow, /steps\.source\.outputs\.attempt >= 3/);
  assert.match(workflow, /select\(\.title == \$title and \.state == "open"\)/);
  assert.match(workflow, /Existing incident found for run \$RUN_ID; duplicate suppressed/);
  assert.match(workflow, /gh issue create --repo "\$REPOSITORY"/);
});
