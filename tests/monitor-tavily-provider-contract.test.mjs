import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/monitor-central-agent.yml", import.meta.url), "utf8");
const start = workflow.indexOf("- name: Verify owner-authenticated Tavily live search");
const nextStep = workflow.indexOf("\n      - name:", start + 1);
const tavilyStep = workflow.slice(start, nextStep < 0 ? undefined : nextStep);

test("Tavily monitor reports NOT TESTED when another provider or guarded fallback answers", () => {
  assert.ok(start >= 0, "Tavily-specific monitor step must exist");
  assert.match(tavilyStep, /x\.provider\s*!==\s*"tavily"/);
  assert.match(tavilyStep, /x\.liveSearchVerified\s*!==\s*true/);
  assert.match(tavilyStep, /status:\s*"NOT_TESTED"/);
  assert.match(tavilyStep, /TAVILY_NOT_TESTED/);
  assert.match(tavilyStep, /GITHUB_OUTPUT/);
});

test("Tavily monitor reports PASS only for directly verified Tavily results", () => {
  assert.match(tavilyStep, /status:\s*"PASS"/);
  assert.match(tavilyStep, /provider:\s*"tavily"/);
  assert.match(tavilyStep, /x\.fallback\s*===\s*true/);
});
