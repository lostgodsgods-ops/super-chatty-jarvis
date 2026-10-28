import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/redultron-release-package.yml", import.meta.url), "utf8");

test("release package workflow has one push trigger with every intended path", () => {
  const pushBlocks = [...workflow.matchAll(/^  push:\s*\n((?: {4,}.*\n)*)/gm)];
  assert.equal(pushBlocks.length, 1, "duplicate push keys make the workflow trigger ambiguous or invalid");

  const pushBlock = pushBlocks[0][1];
  for (const path of [
    "jarvis/**",
    "tests/**",
    "central-agent/**",
    "package.json",
    "release/**",
    ".github/workflows/redultron-release-package.yml"
  ]) {
    assert.ok(pushBlock.includes(path), `push path filter missing ${path}`);
  }
});
