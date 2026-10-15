import test from "node:test";
import assert from "node:assert/strict";
import worker from "../staging/worker.mjs";
import { APP_HTML } from "../staging/app.mjs";
import { JARVIS_CORE_SYSTEM_INSTRUCTIONS, parseBossCommand } from "../staging/modules.mjs";

const origin = "https://super-chatty-passkey-staging.lostgodsgods.workers.dev";
const ownerHeaders = { origin, cookie: "scj_owner_session=test-session", "content-type": "application/json" };

test("Jarvis core instructions define bounded Owner-first operation without claiming unavailable capabilities", () => {
  assert.match(JARVIS_CORE_SYSTEM_INSTRUCTIONS, /Hindi.*Hinglish.*English/i);
  assert.match(JARVIS_CORE_SYSTEM_INSTRUCTIONS, /approval/i);
  assert.match(JARVIS_CORE_SYSTEM_INSTRUCTIONS, /untrusted/i);
  assert.match(JARVIS_CORE_SYSTEM_INSTRUCTIONS, /Never claim.*unless/i);
  assert.match(JARVIS_CORE_SYSTEM_INSTRUCTIONS, /live search.*only when configured/i);
});

test("dynamic intent router recognizes English web search commands", () => {
  assert.deepEqual(parseBossCommand("Jarvis, search for latest AI safety news"), {
    intent: "web_search",
    goal: "latest AI safety news",
    requiresTaskApproval: false,
  });
});

test("dynamic intent router recognizes Hindi and Hinglish web search commands", () => {
  assert.equal(parseBossCommand("Chatty, वेब सर्च करो Cloudflare Workers AI").intent, "web_search");
  assert.equal(parseBossCommand("Jarvis, ताज़ा जानकारी खोजो AI research").goal, "AI research");
});

test("ordinary questions are not silently converted into external search actions", () => {
  assert.equal(parseBossCommand("Can you explain how web search works?").intent, "chat");
});

test("live search fails closed with a precise configuration status when no key is set", async () => {
  const response = await worker.fetch(new Request(origin + "/api/chat", {
    method: "POST", headers: ownerHeaders,
    body: JSON.stringify({ message: "Jarvis, search for Cloudflare Workers AI", language: "en-US" }),
  }), {
    ALLOWED_ORIGIN: origin,
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
    AI: { run: async () => ({ response: "should not run without search configuration" }) },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "SEARCH_NOT_CONFIGURED");
});

test("live search uses the fixed provider endpoint, bounds results, and reports verified source links", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let requestedHeaders;
  try {
    globalThis.fetch = async (input, init = {}) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init.headers);
      return new Response(JSON.stringify({
        web: { results: [
          { title: "Cloudflare Workers AI", url: "https://developers.cloudflare.com/workers-ai/", description: "Official Workers AI documentation." },
          { title: "Unsafe result", url: "javascript:alert(1)", description: "Must be filtered." },
          { title: "Second source", url: "https://example.com/research", description: "A second public source." }
        ] }
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const response = await worker.fetch(new Request(origin + "/api/chat", {
      method: "POST", headers: ownerHeaders,
      body: JSON.stringify({ message: "Jarvis, search for Cloudflare Workers AI", language: "en-US" }),
    }), {
      ALLOWED_ORIGIN: origin,
      SEARCH_API_KEY: "test-search-key",
      AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
      SESSIONS: { get: async () => JSON.stringify({ ownerId: 1, credentialId: "test" }) },
      AI: { run: async () => ({ response: "Workers AI is Cloudflare's AI inference platform." }) },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.core.intent, "web_search");
    assert.equal(body.core.webSearchExecuted, true);
    assert.equal(body.sources.length, 2);
    assert.equal(body.sources[0].title, "Cloudflare Workers AI");
    assert.match(requestedUrl, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?/);
    assert.equal(requestedHeaders.get("x-subscription-token"), "test-search-key");
    assert.equal(new URL(requestedUrl).searchParams.get("q"), "Cloudflare Workers AI");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice UI makes continuous listening explicit and never enables it by default", () => {
  assert.match(APP_HTML, /id="continuousListen"/);
  assert.match(APP_HTML, /continuous listening/i);
  assert.match(APP_HTML, /continuousListen.*checked/i);
  assert.match(APP_HTML, /r\.continuous=\$\("continuousListen"\)\.checked/);
  assert.match(APP_HTML, /isFinal/);
});
