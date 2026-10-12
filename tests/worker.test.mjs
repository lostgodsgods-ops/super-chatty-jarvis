import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../src/worker.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("health route is safe and does not expose credentials", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.version, "inline-html-v1");
  assert.equal(JSON.stringify(body).includes("token"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("homepage serves the exact checked-in project page with security headers", async () => {
  const response = await worker.fetch(new Request("https://example.test/"));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), html);
  assert.equal(response.headers.get("content-type"), "text/html; charset=UTF-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("GitHub check reads only public repository metadata and uses no token", async () => {
  const originalFetch = globalThis.fetch;
  let requestHeaders;
  globalThis.fetch = async (_url, options) => {
    requestHeaders = options.headers;
    return new Response(JSON.stringify({
      full_name: "lostgodsgods-ops/super-chatty-jarvis",
      default_branch: "main",
      private: false,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/github-check"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.repository, "lostgodsgods-ops/super-chatty-jarvis");
    assert.equal(requestHeaders.Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub check only accepts GET and HEAD", async () => {
  const response = await worker.fetch(new Request("https://example.test/github-check", { method: "POST" }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("old privileged write-check route is absent", async () => {
  const response = await worker.fetch(new Request("https://example.test/github-write-check", { method: "POST" }));
  assert.equal(response.status, 404);
});

test("unknown routes return a safe not-found response", async () => {
  const response = await worker.fetch(new Request("https://example.test/unknown"));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
