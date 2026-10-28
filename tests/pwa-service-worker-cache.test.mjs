import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../jarvis/sw.js", import.meta.url), "utf8");

test("service worker activation removes superseded REDULTRON shell caches", () => {
  assert.match(
    worker,
    /LEGACY_CACHE_PREFIXES\s*=\s*\[[^\]]*["']redultron-core-shell-["'][^\]]*\]/s,
    "old redultron-core-shell-* caches must be included in activation cleanup"
  );
});

test("PWA shell cache version advances when the worker shell changes", () => {
  assert.match(
    worker,
    /CACHE_NAME\s*=\s*["']redultron-core-shell-v15-cognitive-core["']/,
    "the shell cache version must be bumped to v15"
  );
});

test("navigation remains network-first with cached app-shell fallback", () => {
  assert.match(worker, /request\.mode\s*===\s*["']navigate["']/,
    "navigation must have an explicit network-first branch");
  assert.match(worker, /caches\.match\(request\).*caches\.match\(["']\.\/index\.html["']\)/s,
    "failed navigation must fall back to the cached app shell");
});
