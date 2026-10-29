import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const monitor = await readFile(new URL("../jarvis/monitor.html", import.meta.url), "utf8");

test("live monitor uses direct read-only health probes and public repository metadata", () => {
  assert.match(monitor, /WORKER\s*=\s*"https:\/\/shrill-silence-164f\.lostgodsgods\.workers\.dev"/);
  assert.match(monitor, /PYTHON\s*=\s*"https:\/\/super-chatty-jarvis\.onrender\.com"/);
  assert.match(monitor, /api\.github\.com\/repos\/\W*"?\s*\+?REPO/);
  assert.match(monitor, /cache:\s*"no-store"/);
  assert.match(monitor, /setInterval\(refresh,30000\)/);
});

test("live monitor does not fake performance metrics and clearly marks auth execution untested", () => {
  assert.match(monitor, /Authenticated Python execution/);
  assert.match(monitor, /NOT TESTED/);
  assert.match(monitor, /No synthetic CPU, memory, agent-count, or progress metrics/);
  assert.doesNotMatch(monitor, /ownerToken|REDULTRON_OWNER_SECRET|Bearer\s+[A-Za-z0-9._-]{20,}/);
});

test("monitor escapes dynamic text and opens external commit links safely", () => {
  assert.match(monitor, /replace\(\/\[&<>"'\]\/g/);
  assert.match(monitor, /rel="noopener noreferrer"/);
  assert.match(monitor, /AbortSignal\.timeout\(8000\)/);
  assert.match(monitor, /BLOCKED/);
  assert.match(monitor, /FAIL/);
});
