import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("Tavily classification is visible in the workflow job summary on shell and Node paths", () => {
  assert.match(tavilyStep, /GITHUB_STEP_SUMMARY/);
  assert.ok(tavilyStep.includes("report_tavily_status() {"), "shell early-return paths must write the job summary");
  assert.match(tavilyStep, /report_tavily_status "NOT_TESTED"/);
  assert.match(tavilyStep, /function reportTavilyStatus/);
  assert.match(tavilyStep, /reportTavilyStatus\("NOT_TESTED"/);
  assert.match(tavilyStep, /reportTavilyStatus\("PASS"/);
});

test("Tavily owner-login transport failures are classified as NOT TESTED", () => {
  assert.ok(tavilyStep.includes('if ! login_code="$(curl'), "login curl transport errors must be captured");
  assert.ok(tavilyStep.includes('login_code="000"'), "login transport failure must use HTTP status 000");
  assert.ok(tavilyStep.includes("reason=OWNER_AUTH_UNAVAILABLE"), "login unavailability must be explicitly classified");
});


const nodeCommand = ["node -", '"$tmp/search.json"', '"$GITHUB_OUTPUT"', "<<'NODE'"].join(" ");
const nodeCommandStart = tavilyStep.indexOf(nodeCommand);
const nodeScriptStart = tavilyStep.indexOf("\n", nodeCommandStart) + 1;
const nodeScriptEnd = tavilyStep.indexOf("\n          NODE", nodeScriptStart);
const nodeScript = tavilyStep.slice(nodeScriptStart, nodeScriptEnd)
  .split("\n")
  .map(line => line.startsWith("          ") ? line.slice(10) : line)
  .join("\n");

async function runNodeTavilyClassification(payload) {
  const directory = await mkdtemp(join(tmpdir(), "redultron-tavily-"));
  try {
    const searchFile = join(directory, "search.json");
    const outputFile = join(directory, "github-output.txt");
    const summaryFile = join(directory, "github-summary.md");
    await writeFile(searchFile, JSON.stringify(payload));
    await writeFile(outputFile, "");
    await writeFile(summaryFile, "");
    const stdout = execFileSync(process.execPath, ["-", searchFile, outputFile], {
      input: nodeScript,
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile }
    });
    return {
      output: await readFile(outputFile, "utf8"),
      summary: await readFile(summaryFile, "utf8"),
      stdout
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Node monitor writes NOT TESTED summary for an alternate provider", async () => {
  const result = await runNodeTavilyClassification({
    ok: true,
    provider: "bing-news-rss",
    liveSearchVerified: true,
    fallback: false,
    results: [{ url: "https://example.com/source" }]
  });
  assert.match(result.output, /status=NOT_TESTED/);
  assert.match(result.output, /provider=bing-news-rss/);
  assert.match(result.output, /reason=ALTERNATE_PROVIDER/);
  assert.match(result.summary, /Status: \*\*NOT_TESTED\*\*/);
  assert.match(result.summary, /Provider: .*bing-news-rss/);
});

test("Node monitor writes PASS summary only for directly verified Tavily", async () => {
  const result = await runNodeTavilyClassification({
    ok: true,
    provider: "tavily",
    liveSearchVerified: true,
    fallback: false,
    results: [{ url: "https://example.com/source" }]
  });
  assert.match(result.output, /status=PASS/);
  assert.match(result.output, /provider=tavily/);
  assert.match(result.output, /reason=verified/);
  assert.match(result.summary, /Status: \*\*PASS\*\*/);
  assert.match(result.summary, /Provider: .*tavily/);
});
