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

test("GitHub check reads a public raw repository file and uses no token", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestHeaders;
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestHeaders = options.headers;
    return new Response("test project status", { status: 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/github-check"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.repository, "lostgodsgods-ops/super-chatty-jarvis");
    assert.equal(body.checkedFile, "README_HI.txt");
    assert.match(requestedUrl, /raw\.githubusercontent\.com\/lostgodsgods-ops\/super-chatty-jarvis\/main\/README_HI\.txt/);
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

test("AI chat is disabled by default and never exposes provider credentials", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  }));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error, "AI chat is not configured");
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("AI chat validates method, content type, and message length", async () => {
  const wrongMethod = await worker.fetch(new Request("https://example.test/api/chat"));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const wrongType = await worker.fetch(new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "hello",
  }));
  assert.equal(wrongType.status, 415);

  const oversizedBody = await worker.fetch(new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ extra: "x".repeat(13000), message: "hello" }),
  }), { CHAT_API_ENABLED: "true", OPENAI_API_KEY: "test-only-secret" });
  assert.equal(oversizedBody.status, 413);

  const tooLong = await worker.fetch(new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "x".repeat(4001) }),
  }), { CHAT_API_ENABLED: "true", OPENAI_API_KEY: "test-only-secret" });
  assert.equal(tooLong.status, 400);
});

test("AI chat sends provider key server-side and returns only the reply", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamOptions;
  globalThis.fetch = async (url, options) => {
    upstreamUrl = String(url);
    upstreamOptions = options;
    return new Response(JSON.stringify({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "Hello from the test provider." } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://example.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Say hello" }),
    }), { CHAT_API_ENABLED: "true", OPENAI_API_KEY: "test-only-secret" });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.reply, "Hello from the test provider.");
    assert.match(upstreamUrl, /api\.openai\.com\/v1\/chat\/completions/);
    assert.equal(upstreamOptions.headers.authorization, "Bearer test-only-secret");
    assert.equal(JSON.parse(upstreamOptions.body).messages[1].content, "Say hello");
    assert.equal(JSON.stringify(body).includes("test-only-secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI chat rejects cross-origin browser requests", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/chat", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  }), { CHAT_API_ENABLED: "true", OPENAI_API_KEY: "test-only-secret" });
  assert.equal(response.status, 403);
});

test("unknown routes return a safe not-found response", async () => {
  const response = await worker.fetch(new Request("https://example.test/unknown"));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
