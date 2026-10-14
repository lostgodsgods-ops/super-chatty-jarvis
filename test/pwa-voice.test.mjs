import test from "node:test";
import assert from "node:assert/strict";
import worker from "../staging/worker.mjs";
import { APP_HTML } from "../staging/app.mjs";

const origin = "https://super-chatty-passkey-staging.lostgodsgods.workers.dev";

test("PWA manifest is served with install metadata and icons", async () => {
  const response = await worker.fetch(new Request(origin + "/manifest.webmanifest"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.name, "Super Chatty Jarvis");
  assert.equal(manifest.start_url, "/app");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icon.svg"));
});

test("service worker route serves a scoped JavaScript worker", async () => {
  const response = await worker.fetch(new Request(origin + "/service-worker.js"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript/);
  const source = await response.text();
  assert.match(source, /addEventListener\(["']install/);
  assert.match(source, /addEventListener\(["']fetch/);
});

test("download and install routes return a usable PWA installation page", async () => {
  for (const path of ["/download", "/app/install"]) {
    const response = await worker.fetch(new Request(origin + path), {});
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    const html = await response.text();
    assert.match(html, /Install Super Chatty Jarvis/);
    assert.match(html, /beforeinstallprompt/);
    assert.match(html, /\/app/);
  }
});

test("voice UI exposes profile selection, PWA registration, and speech fallback", () => {
  assert.match(APP_HTML, /rel="manifest"/);
  assert.match(APP_HTML, /navigator\.serviceWorker\.register/);
  assert.match(APP_HTML, /id="voiceProfile"/);
  for (const profile of ["male", "female", "child", "senior"]) {
    assert.match(APP_HTML, new RegExp('value="' + profile + '"'));
  }
  assert.match(APP_HTML, /speechSynthesis/);
  assert.match(APP_HTML, /onvoiceschanged/);
  assert.match(APP_HTML, /device speech failed/i);
});

test("AI TTS route rejects unauthenticated requests", async () => {
  const response = await worker.fetch(new Request(origin + "/api/tts", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ text: "Hello", language: "en", voiceProfile: "female" }),
  }), { ALLOWED_ORIGIN: origin, AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } });
  assert.equal(response.status, 401);
});
