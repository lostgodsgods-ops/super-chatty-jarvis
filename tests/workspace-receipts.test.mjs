import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(new URL("../jarvis/workspace.html", import.meta.url), "utf8");

test("workspace exposes an honest execution receipt panel", () => {
  for (const id of ["workspaceReceipts", "receiptFeed", "receiptCount"]) {
    assert.ok(workspace.includes('id="' + id + '"'), "missing receipt UI: " + id);
  }
  for (const state of ["PASS", "FAIL", "BLOCKED", "NOT TESTED"]) {
    assert.ok(workspace.includes(state), "missing evidence state: " + state);
  }
});

test("execution receipts are derived only from recognized backend events", () => {
  assert.match(workspace, /task\.execution\.completed/);
  assert.match(workspace, /task\.execution\.failed/);
  assert.match(workspace, /task\.execution\.blocked/);
  assert.match(workspace, /function recordReceipt\(/);
  assert.match(workspace, /receiptFeed/);
  assert.match(workspace, /textContent/);
  assert.match(workspace, /private payload omitted|private fields omitted/i);
});

test("receipt view clearly discloses session-only retention and no fabricated deployment proof", () => {
  assert.match(workspace, /this session/i);
  assert.match(workspace, /deployment.*not tested|not tested.*deployment/i);
  assert.match(workspace, /NOT TESTED/);
});
