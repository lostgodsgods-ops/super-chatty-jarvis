import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.mjs";

test("health route reports a boolean configuration state without exposing secrets", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/health"),
    { GITHUB_TOKEN: "" },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.githubTokenConfigured, false);
  assert.equal(JSON.stringify(body).includes("secret"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GitHub check fails closed when the server-side token is missing", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called without a token");
  };
  try {
    const response = await worker.fetch(
      new Request("https://example.test/github-check"),
      {},
    );
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub check returns a safe repository summary and never returns the token", async () => {
  const originalFetch = globalThis.fetch;
  const token = "test-only-secret-value";
  let requestHeaders;
  globalThis.fetch = async (_url, options) => {
    requestHeaders = options.headers;
    return new Response(JSON.stringify({
      full_name: "lostgodsgods-ops/super-chatty-jarvis",
      default_branch: "main",
      private: false,
      permissions: { pull: true, push: true, admin: false },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(
      new Request("https://example.test/github-check"),
      { GITHUB_TOKEN: token },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.repository, "lostgodsgods-ops/super-chatty-jarvis");
    assert.equal(body.defaultBranch, "main");
    assert.equal(requestHeaders.Authorization, `Bearer ${token}`);
    assert.equal(JSON.stringify(body).includes(token), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub check only accepts GET", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/github-check", { method: "POST" }),
    { GITHUB_TOKEN: "test-only-secret-value" },
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});

test("static page falls back to assets and receives security headers", async () => {
  let receivedUrl = "";
  const response = await worker.fetch(
    new Request("https://example.test/"),
    {
      ASSETS: {
        async fetch(request) {
          receivedUrl = request.url;
          return new Response("<h1>Super Chatty Jarvis</h1>", {
            status: 200,
            headers: { "content-type": "text/html; charset=UTF-8" },
          });
        },
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(receivedUrl, "https://example.test/");
  assert.match(await response.text(), /Super Chatty Jarvis/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("unknown routes use the asset handler rather than a privileged write route", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/github-write-check", { method: "GET" }),
    {
      ASSETS: {
        async fetch() {
          return new Response("not found", { status: 404 });
        },
      },
    },
  );
  assert.equal(response.status, 404);
});
