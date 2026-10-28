import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("strict provenance certification accepts the configured PHP or Python sidecar without accepting fallback", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  const gateStart = workflow.indexOf("if ! jq -e '");
  const gateEnd = workflow.indexOf("' \"$body\" >/dev/null", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart, "strict JSON acceptance gate must exist");
  const gate = workflow.slice(gateStart, gateEnd);
  assert.match(gate, /\.engine == "python-edge-hybrid" or \.engine == "php-edge-hybrid"/);
  assert.match(gate, /\.hybridCoreExecutionVerified == true/);
  assert.match(gate, /\.fallbackEngaged == false/);
  assert.match(gate, /\.hybridPythonCoreExecutionVerified == true/);
  assert.match(gate, /\.hybridPhpCoreExecutionVerified == true/);
});

test("strict failure diagnostics preserve provider-neutral verification flags", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-provenance-deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /hybridCoreExecutionVerified:/);
  assert.match(workflow, /hybridPhpCoreExecutionVerified:/);
  assert.match(workflow, /hybridPythonCoreExecutionVerified:/);
});


test("scheduled live gateway probe certifies whichever configured core actually executed", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  const gateStart = workflow.indexOf("if ! jq -e '");
  const gateEnd = workflow.indexOf("' \"$hybrid_file\" >/dev/null", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart, "live probe strict JSON acceptance gate must exist");
  const gate = workflow.slice(gateStart, gateEnd);
  assert.match(gate, /\.engine == "python-edge-hybrid" or \.engine == "php-edge-hybrid"/);
  assert.match(gate, /\.hybridCoreExecutionVerified == true/);
  assert.match(gate, /\.fallbackEngaged == false/);
  assert.match(gate, /\.hybridPythonCoreExecutionVerified == true/);
  assert.match(gate, /\.hybridPhpCoreExecutionVerified == true/);
  assert.match(workflow, /configured upstream round-trip/);
});
