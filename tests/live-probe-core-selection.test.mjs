import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scheduled live probe certifies the actual configured hybrid engine, not only Python", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  assert.match(workflow, /\.engine == "python-edge-hybrid" or \.engine == "php-edge-hybrid"/);
  assert.match(workflow, /\.hybridCoreExecutionVerified == true/);
  assert.match(workflow, /\.fallbackEngaged == false/);
  assert.match(workflow, /\.hybridPythonCoreExecutionVerified == true/);
  assert.match(workflow, /\.hybridPhpCoreExecutionVerified == true/);
});

test("scheduled live probe emits provider-neutral sanitized failure diagnostics", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  assert.match(workflow, /hybridCoreExecutionVerified/);
  assert.match(workflow, /hybridPhpCoreExecutionVerified/);
  assert.match(workflow, /hybridPythonCoreExecutionVerified/);
});
