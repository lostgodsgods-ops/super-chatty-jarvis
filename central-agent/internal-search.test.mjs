import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

test("internal Tavily search rejects missing or incorrect gateway tokens", async () => {
  const response = await worker.fetch(new Request("https://agent.example/internal/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
    body: JSON.stringify({ query: "Cloudflare Workers" })
  }), { SEARCH_BRIDGE_TOKEN: "correct-token", SEARCH_API_KEY: "test-tavily-key" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("internal Tavily search uses the server-side key, returns real source shape, and synthesizes once", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamOptions;
  let aiCalls = 0;
  globalThis.fetch = async (url, options) => {
    upstreamUrl = String(url);
    upstreamOptions = options;
    return new Response(JSON.stringify({
      results: [
        { title: "Cloudflare Workers docs", url: "https://developers.cloudflare.com/workers/", content: "Official Workers documentation.", score: 0.99 },
        { title: "Invalid URL", url: "javascript:alert(1)", content: "Must be excluded." }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "Cloudflare Workers documentation", language: "en-IN" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      SEARCH_API_KEY: "test-tavily-key",
      AI: {
        run: async (model, input) => {
          aiCalls++;
          assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
          assert.equal(input.max_tokens, 450);
          return { response: "Cloudflare Workers are documented by Cloudflare." };
        }
      }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.provider, "tavily");
    assert.equal(body.core.searchProvider, "tavily");
    assert.equal(body.core.webSearchExecuted, true);
    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0].url, "https://developers.cloudflare.com/workers/");
    assert.equal(body.reply, "Cloudflare Workers are documented by Cloudflare.");
    assert.equal(aiCalls, 1);
    assert.equal(upstreamUrl, "https://api.tavily.com/search");
    assert.equal(upstreamOptions.headers.authorization, "Bearer test-tavily-key");
    assert.equal(JSON.parse(upstreamOptions.body).query, "Cloudflare Workers documentation");
    assert.equal(JSON.stringify(body).includes("test-tavily-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("internal Tavily search fails closed when its private provider key is missing", async () => {
  const response = await worker.fetch(new Request("https://agent.example/internal/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({ query: "Cloudflare Workers" })
  }), { SEARCH_BRIDGE_TOKEN: "correct-token" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "Search provider is not configured.");
});

test("health reports gateway search readiness without exposing secrets", async () => {
  const response = await worker.fetch(new Request("https://agent.example/health"), {
    SEARCH_BRIDGE_TOKEN: "gateway-test-token",
    SEARCH_API_KEY: "private-tavily-key",
    AI: {}
  });
  const body = await response.json();
  assert.equal(body.capabilities.gatewaySearchConfigured, true);
  assert.equal(body.capabilities.tavilySearchConfigured, true);
  assert.equal(JSON.stringify(body).includes("gateway-test-token"), false);
  assert.equal(JSON.stringify(body).includes("private-tavily-key"), false);
});


test("internal chat rejects an incorrect gateway token", async () => {
  const response = await worker.fetch(new Request("https://agent.example/internal/chat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
    body: JSON.stringify({ message: "Hello Chatty", language: "en-IN" })
  }), { SEARCH_BRIDGE_TOKEN: "correct-token", AI: { run: async () => ({ response: "should not run" }) } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("internal chat uses the protected AI binding and returns a bounded reply", async () => {
  const response = await worker.fetch(new Request("https://agent.example/internal/chat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({ message: "Hello Chatty", language: "en-IN" })
  }), {
    SEARCH_BRIDGE_TOKEN: "correct-token",
    AI: { run: async (model, input) => {
      assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
      assert.equal(input.max_tokens, 450);
      return { response: "Hello! I am ready to help." };
    } }
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.provider, "workers-ai");
  assert.equal(body.reply, "Hello! I am ready to help.");
  assert.equal(body.core.intent, "chat");
  assert.equal(body.core.externalActionsPerformed, false);
});


test("central chat endpoint requires the private gateway token", async () => {
  const response = await worker.fetch(new Request("https://agent.example/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Hello Chatty", language: "en-IN" })
  }), { SEARCH_BRIDGE_TOKEN: "correct-token", AI: { run: async () => ({ response: "should not run" }) } });
  assert.equal(response.status, 401, JSON.stringify(await response.clone().json()));
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("central chat endpoint returns a bounded Workers AI answer for the protected PWA proxy", async () => {
  const response = await worker.fetch(new Request("https://agent.example/chat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({ message: "Hello Chatty", language: "en-IN" })
  }), {
    SEARCH_BRIDGE_TOKEN: "correct-token",
    AI: { run: async (model, input) => {
      assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
      assert.equal(input.max_tokens, 450);
      assert.match(input.messages[0].content, /en-IN/);
      return { response: "Hello! Super Chatty is connected." };
    } }
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.provider, "workers-ai");
  assert.equal(body.answer, "Hello! Super Chatty is connected.");
  assert.equal(JSON.stringify(body).includes("correct-token"), false);
});


test("legacy /internal/chat route aliases the protected central /chat handler", async () => {
  const response = await worker.fetch(new Request("https://agent.example/internal/chat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
    body: JSON.stringify({ message: "Hello Chatty", language: "en-IN" })
  }), {
    SEARCH_BRIDGE_TOKEN: "correct-token",
    AI: { run: async () => ({ response: "Legacy route is connected." }) }
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.answer, "Legacy route is connected.");
});
