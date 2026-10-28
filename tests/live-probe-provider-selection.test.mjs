import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scheduled live probe certifies the configured PHP or Python sidecar, never fallback", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  const gateStart = workflow.indexOf("if ! jq -e '");
  const gateEnd = workflow.indexOf("' \"$hybrid_file\" >/dev/null", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart, "strict live-probe JSON gate must exist");
  const gate = workflow.slice(gateStart, gateEnd);
  assert.match(gate, /\.engine == "python-edge-hybrid" or \.engine == "php-edge-hybrid"/);
  assert.match(gate, /\.fallbackEngaged == false/);
  assert.match(gate, /\.hybridCoreExecutionVerified == true/);
  assert.match(gate, /\.hybridPythonCoreExecutionVerified == true/);
  assert.match(gate, /\.hybridPhpCoreExecutionVerified == true/);
});

test("live probe diagnostics expose only sanitized engine status, not response bodies or secrets", async () => {
  const workflow = await readFile(new URL("../.github/workflows/redultron-live-probe.yml", import.meta.url), "utf8");
  assert.match(workflow, /python_verified=/);
  assert.match(workflow, /php_verified=/);
  assert.match(workflow, /Do not dump upstream response bodies, headers, or secrets/);
});
