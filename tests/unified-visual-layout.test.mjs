import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../jarvis/index.html", import.meta.url), "utf8");

test("REDULTRON PWA uses the unified three-column command-deck visual system", () => {
  assert.match(html, /id="redultron-unified-layout-v18"/);
  assert.match(html, /grid-template-areas:[\s\S]*"topbar topbar topbar"/);
  assert.match(html, /"owner core terminal"/);
  assert.match(html, /"search core connection"/);
  assert.match(html, /"media orchestration telemetry"/);
});

test("the new visual system preserves the real owner, research, media and agent modules", () => {
  for (const id of [
    "ownerTitle",
    "factSearchTitle",
    "mediaTitle",
    "redQueenTitle",
    "telemetryTitle",
    "terminalTitle",
    "connectionTitle",
    "coreHeading",
    "handsFreeBtn",
    "sendBtn"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `missing existing functional module: ${id}`);
  }
});

test("the unified layout has explicit phone-first breakpoints and reduced-motion support", () => {
  const css = html.slice(html.indexOf('id="redultron-unified-layout-v18"'));
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /REDULTRON-2026\\.10\\.28-CORE-3\\.0-V18/);
  const sw = await readFile(new URL("../jarvis/sw.js", import.meta.url), "utf8");
  assert.match(sw, /redultron-core-shell-v18-core-3/);
  const legacy = await readFile(new URL("../jarvis/core3.html", import.meta.url), "utf8");
  assert.match(legacy, /location\\.replace\\(.*index\\.html/);
});
