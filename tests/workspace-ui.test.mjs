import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const home = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");
const workspace = await readFile(new URL("../jarvis/workspace.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../jarvis/sw.js", import.meta.url), "utf8");

test("home presents a simple chat-first surface with a separate workspace entry", () => {
  assert.ok(home.includes('id="simpleChatShell"'));
  assert.ok(home.includes('id="simpleMessages"'));
  assert.ok(home.includes('href="/jarvis/workspace.html"'));
  assert.ok(home.includes("simple-view"));
  assert.ok(home.includes("auth-locked.simple-view"));
});

test("service worker precaches the new workspace and advances the shell cache", () => {
  assert.ok(serviceWorker.includes("redultron-core-shell-v21-core-3"));
  assert.ok(serviceWorker.includes('"/jarvis/workspace.html"'));
});

test("workspace exposes distinct system, files, agents and mission areas", () => {
  for (const id of ["workspaceSystem", "workspaceFiles", "workspaceAgents", "workspaceMissions", "workspaceTerminal", "workspaceCode"]) {
    assert.ok(workspace.includes('id="' + id + '"'), "missing workspace section " + id);
  }
});

test("workspace inline JavaScript parses before the PWA can serve it", () => {
  const scriptStart = workspace.indexOf("<script>");
  const scriptEnd = workspace.indexOf("</script>", scriptStart);
  const scripts = scriptStart >= 0 && scriptEnd > scriptStart ? [workspace.slice(scriptStart + 8, scriptEnd)] : [];
  assert.equal(scripts.length, 1, "workspace should have one self-contained application script");
  assert.doesNotThrow(() => new vm.Script(scripts[0]));
});

test("workspace authenticates with the existing cookie-backed owner session", () => {
  assert.match(workspace, /\/auth\/session/);
  assert.match(workspace, /credentials:\s*["']include["']/);
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^)]*(token|session)/i);
});

test("home preserves authentication only for the explicit same-origin workspace handoff", () => {
  assert.ok(home.includes('a[href="/jarvis/workspace.html"]'));
  assert.ok(home.includes("workspaceNavigationPending=true"));
  assert.ok(home.includes("Owner session handed off to the same-origin Workspace"));
  assert.ok(home.includes("event.persisted"));
});

test("workspace revokes the cookie session and aborts its event stream when hidden or exited", () => {
  assert.ok(workspace.includes('fetch("/auth/logout"'));
  assert.ok(workspace.includes('document.addEventListener("visibilitychange"'));
  assert.ok(workspace.includes("window.addEventListener(\"pagehide\",lockWorkspaceSession)"));
  assert.ok(workspace.includes("state.controller.abort()"));
});

test("workspace limits event display and does not execute shell commands or upload local files", () => {
  assert.ok(workspace.includes("LOCAL FILES ONLY"));
  assert.ok(workspace.includes("No shell command execution"));
  assert.ok(workspace.includes("const safeKeys="));
  assert.doesNotMatch(workspace, /JSON\.stringify\(event\.payload\)/);
  assert.doesNotMatch(workspace, /child_process|eval\s*\(|new Function\s*\(/);
});
