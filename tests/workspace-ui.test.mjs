import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
const workspace = await readFile(new URL("../jarvis/workspace.html", import.meta.url), "utf8");

test("home presents a simple chat-first surface with a separate workspace entry", () => {
  assert.match(home, /id="simpleChatShell"/);
  assert.match(home, /id="simpleMessages"/);
  assert.match(home, /href="\.\/workspace\.html"/);
  assert.match(home, /simple-view/);
});

test("workspace exposes distinct system, files, agents and mission areas", () => {
  for (const id of ["workspaceSystem", "workspaceFiles", "workspaceAgents", "workspaceMissions", "workspaceTerminal", "workspaceCode"]) {
    assert.ok(workspace.includes('id="' + id + '"'), "missing workspace section " + id);
  }
});

test("workspace authenticates with the existing cookie-backed owner session", () => {
  assert.match(workspace, /\/auth\/session/);
  assert.match(workspace, /credentials:\s*["']include["']/);
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^)]*(token|session)/i);
});

test("workspace does not execute shell commands or upload local files", () => {
  assert.match(workspace, /LOCAL FILES ONLY/);
  assert.match(workspace, /No shell command execution/);
  assert.doesNotMatch(workspace, /child_process|eval\s*\(|new Function\s*\(/);
});
