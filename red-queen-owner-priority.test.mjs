import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pwa = await readFile(new URL("./jarvis/index.html", import.meta.url), "utf8");
const worker = await readFile(new URL("./central-agent/worker.mjs", import.meta.url), "utf8");
const ownerControl = await readFile(new URL("./central-agent/architecture/owner-control-service.mjs", import.meta.url), "utf8");
const registry = await readFile(new URL("./central-agent/architecture/red-queen-registry.mjs", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("./jarvis/sw.js", import.meta.url), "utf8");

test("PWA exposes Owner Priority and starts with honest locked/unverified module status", () => {
  assert.match(pwa, /id="redQueenTitle"[^>]*>Red Queen · Owner Priority/);
  assert.match(pwa, /OWNER PRIORITY: HIGH/);
  assert.match(pwa, /id="redQueenStatus"[^>]*>[\s\S]*?LOCKED/);
  assert.match(pwa, /NOT VERIFIED/);
  assert.match(pwa, /not proof of live execution/i);
});

test("PWA loads the module registry only through authenticated ownerFetch", () => {
  assert.match(pwa, /ownerFetch\("\/api\/red-queen\/status"\)/);
  assert.match(pwa, /if \(!state\.ownerToken\)[\s\S]{0,180}Owner sign-in required/);
  assert.match(pwa, /setRedQueenStatus\("LOCKED", "warn"\)/);
  assert.match(pwa, /setRedQueenStatus\("BLOCKED \/ UNVERIFIED", "warn"\)/);
  assert.match(pwa, /els\.redQueenModules\.replaceChildren\(\)/);
  assert.doesNotMatch(pwa, /redQueenModules\.innerHTML\s*=/);
});

test("backend status endpoint requires authorization and records an audit event", () => {
  const route = worker.slice(worker.indexOf('if (url.pathname === "/api/red-queen/status")'));
  assert.match(route, /authorized\(request, env\)/);
  assert.match(route, /red_queen\.status\.read/);
  assert.match(route, /AUDIT_STORAGE_UNAVAILABLE/);
  assert.match(registry, /executionMode: "planning-and-simulation-only"/);
});

test("Owner priority is enabled but non-overridable security rules remain protected", () => {
  assert.match(ownerControl, /ownerPriority: true/);
  assert.match(ownerControl, /NON_OVERRIDABLE_RULE_IDS\.has\(rule\.id\)/);
  assert.match(ownerControl, /NON_OVERRIDABLE_RULE/);
});

test("PWA update button checks for the latest service worker and applies available updates", () => {
  assert.match(pwa, /id="updateAppBtn"[^>]*>UPDATE APP NOW/);
  assert.match(pwa, /async function applyPwaUpdate\(\)/);
  assert.match(pwa, /registration\.update\(\)/);
  assert.match(pwa, /registration\.waiting\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(pwa, /navigator\.serviceWorker\.addEventListener\("controllerchange"/);
  assert.match(pwa, /els\.updateAppBtn\.addEventListener\("click", applyPwaUpdate\)/);
});

test("service worker cache version changes and explicit activation messages are handled", () => {
  assert.match(serviceWorker, /super-chatty-jarvis-shell-v10-live-search-fallback-sync/);
  assert.match(serviceWorker, /event\.data\.type === "SKIP_WAITING"/);
  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
});
