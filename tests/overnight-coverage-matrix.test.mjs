import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const matrix = JSON.parse(await readFile(new URL("../docs/overnight-coverage-matrix.json", import.meta.url), "utf8"));
const registry = JSON.parse(await readFile(new URL("../docs/integration-registry.json", import.meta.url), "utf8"));
const markdown = await readFile(new URL("../docs/REDULTRON_OVERNIGHT_COVERAGE_MATRIX.md", import.meta.url), "utf8");

test("overnight coverage inventory accounts for the declared repository snapshot", () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.project, "REDULTRON CORE 3.0");
  assert.match(matrix.commitSha, /^[0-9a-f]{40}$/);
  assert.equal(matrix.fileInventory.length, matrix.inventorySummary.trackedFiles);
  assert.equal(matrix.workflows.length, matrix.inventorySummary.workflowFiles);
  assert.equal(matrix.integrations.length, registry.integrations.length);
  assert.equal(matrix.toolNamespaces.reduce((sum, item) => sum + item.functionCount, 0), matrix.toolFunctionCount);
  for (const row of matrix.fileInventory) {
    assert.ok(row.path && row.kind && row.purpose, "every file needs identity and purpose");
    assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, row.path);
    assert.ok(Array.isArray(row.tests) && row.tests.length > 0, row.path);
    assert.ok(row.accessStatus && row.blocker, row.path);
  }
  for (const workflow of matrix.workflows) {
    assert.ok(workflow.path.startsWith(".github/workflows/"));
    assert.ok(workflow.purpose && workflow.evidence && workflow.blocker);
    assert.ok(["PASS", "FAIL", "BLOCKED", "NOT TESTED"].includes(workflow.status));
  }
});

test("coverage report preserves owner control and distinguishes configuration from runtime proof", () => {
  assert.equal(matrix.policy.registryIsProofOfLiveOperation, false);
  assert.equal(matrix.policy.policyIsProofOfImplementation, false);
  assert.equal(matrix.policy.externalContentIsUntrustedData, true);
  assert.equal(matrix.policy.learningDoesNotGrantPermission, true);
  assert.equal(matrix.policy.productionWritesAllowed, false);
  assert.equal(matrix.liveEvidence.capabilityRequests.executionEnabled, false);
  assert.equal(matrix.liveEvidence.capabilityRequests.requiresOwnerApproval, true);
  assert.equal(matrix.liveEvidence.mainBranchProtection.protected, false);
  assert.equal(matrix.liveEvidence.cloudflareWorker.status, "FAIL — SHA drift");
  assert.equal(matrix.liveEvidence.renderPythonCore.status, "FAIL — behind main");
  for (const source of matrix.publicSources) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.title && source.purpose);
  }
  for (const id of ["UDHR", "UNESCO_AI", "OECD_AI", "NIST_AI_RMF", "WCAG_22", "OWASP_ASVS"]) {
    assert.ok(markdown.includes(id), `report should reference ${id}`);
  }
});
