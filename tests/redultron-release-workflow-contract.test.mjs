import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/redultron-release-package.yml", import.meta.url), "utf8");
const triggerBlock = workflow.match(/^on:\s*\n([\s\S]*?)(?=^permissions:)/m)?.[1] || "";

test("release package workflow has exactly one top-level push trigger", () => {
  const pushHeaders = [...triggerBlock.matchAll(/^  push:\s*$/gm)];
  assert.equal(pushHeaders.length, 1, "duplicate top-level push keys make the trigger ambiguous or invalid");
});

test("single main push trigger covers every release-package source path", () => {
  const pushHeader = /^  push:\s*$/m.exec(triggerBlock);
  assert.ok(pushHeader, "main push trigger must exist");
  const start = pushHeader.index + pushHeader[0].length;
  const remaining = triggerBlock.slice(start);
  const nextHeader = remaining.search(/^  [A-Za-z][A-Za-z0-9_-]*:\s*$/m);
  const pushSection = remaining.slice(0, nextHeader < 0 ? undefined : nextHeader);
  assert.match(pushSection, /branches:\s*\[main\]|branches:\s*\n\s*-\s*main/);
  for (const path of [
    "jarvis/**",
    "tests/**",
    "central-agent/**",
    "package.json",
    "release/**",
    ".github/workflows/redultron-release-package.yml"
  ]) {
    assert.ok(pushSection.includes(path), "main push trigger must include " + path);
  }
});
