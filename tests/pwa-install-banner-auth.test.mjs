import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../jarvis/index.html", import.meta.url), "utf8");

test("install banner remains visible before owner authentication", () => {
  assert.doesNotMatch(
    html,
    /body\.auth-locked\s+#installBanner\s*\{[^}]*display\s*:\s*none/i,
    "install access is public PWA onboarding and must not be hidden by the owner-auth gate"
  );
});

test("the unauthenticated install banner exposes an accessible install action", () => {
  assert.match(html, /id="installBanner"[^>]*role="region"/);
  assert.match(html, /id="installAppBtn"[^>]*aria-describedby="installHint"/);
  assert.match(html, /addEventListener\("beforeinstallprompt"/);
});
