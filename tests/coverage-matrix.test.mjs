import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORM_MODULES } from "../central-agent/architecture/platform-module-registry.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const matrixPath = "docs/REDULTRON_COVERAGE_MATRIX_2026-10-29.md";
const matrix = await readFile(join(root, matrixPath), "utf8");
const integrationRegistry = JSON.parse(await readFile(join(root, "docs/integration-registry.json"), "utf8"));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(absolute));
    else if (entry.isFile()) found.push(relative(root, absolute).split(sep).join("/"));
  }
  return found;
}

test("coverage matrix contains every canonical platform module with a row", () => {
  for (const module of PLATFORM_MODULES) {
    assert.ok(matrix.includes(`| ${module.id} |`), `coverage matrix missing module row: ${module.id}`);
  }
});

test("coverage matrix contains every integration registry ID with a row", () => {
  for (const integration of integrationRegistry.integrations) {
    assert.ok(matrix.includes(`| ${integration.id} |`), `coverage matrix missing integration row: ${integration.id}`);
  }
});

test("coverage matrix inventories every checked-in GitHub Actions workflow", async () => {
  const files = await walk(root);
  const workflows = files.filter(path => path.startsWith(".github/workflows/") && path.endsWith(".yml"));
  assert.ok(workflows.length > 0, "workflow inventory must not be empty");
  for (const path of workflows) {
    assert.ok(matrix.includes(path), `coverage matrix missing workflow path: ${path}`);
  }
});

test("coverage matrix inventories all Central Agent source and test modules", async () => {
  const files = await walk(root);
  const modules = files.filter(path => path.startsWith("central-agent/") && path.endsWith(".mjs"));
  assert.ok(modules.length > 0, "Central Agent module inventory must not be empty");
  for (const path of modules) {
    assert.ok(matrix.includes(path), `coverage matrix missing Central Agent file: ${path}`);
  }
});

test("coverage matrix inventories top-level regression test files", async () => {
  const files = await walk(root);
  const tests = files.filter(path => path.startsWith("tests/") && path.endsWith(".test.mjs"));
  assert.ok(tests.length > 0, "top-level test inventory must not be empty");
  for (const path of tests) {
    assert.ok(matrix.includes(path), `coverage matrix missing top-level test: ${path}`);
  }
});

test("coverage matrix records fresh runtime blockers and agent access limits", () => {
  assert.ok(matrix.includes("## 10. Fresh evidence refresh — 2026-10-29 02:28 IST"), "fresh evidence section is required");
  for (const evidence of [
    "GITHUB_COMMIT_SHA=a0d6087dedb7a29aaa07c9302167ddbda5b352da",
    "Render deployment dep-dbh59ga9lscs73e2d38g",
    "SEARCH_GATEWAY_INCOMPLETE",
    "liveSearchVerified=false",
    "PR #801",
    "protected=false",
    "JackHamr credits exhausted",
    "Agent Relay workspace is not connected to a relay"
  ]) {
    assert.ok(matrix.includes(evidence), `coverage matrix missing fresh evidence: ${evidence}`);
  }
});
