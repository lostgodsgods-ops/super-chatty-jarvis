import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

test("internal Tavily search rejects missing or incorrect gateway tokens", async () => {
  const response = await worker.fetch(new Request("https://agent.example/internal/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-token" },
    body: JSON.stringify({ query: "Cloudflare Workers" })
  }), { AGENT_GATEWAY_TOKEN: "correct-token", SEARCH_API_KEY: "test-tavily-key" });
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
      AGENT_GATEWAY_TOKEN: "correct-token",
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
  }), { AGENT_GATEWAY_TOKEN: "correct-token" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "Search provider is not configured.");
});

test("health reports gateway search readiness without exposing secrets", async () => {
  const response = await worker.fetch(new Request("https://agent.example/health"), {
    AGENT_GATEWAY_TOKEN: "gateway-test-token",
    SEARCH_API_KEY: "private-tavily-key",
    AI: {}
  });
  const body = await response.json();
  assert.equal(body.capabilities.gatewaySearchConfigured, true);
  assert.equal(body.capabilities.tavilySearchConfigured, true);
  assert.equal(JSON.stringify(body).includes("gateway-test-token"), false);
  assert.equal(JSON.stringify(body).includes("private-tavily-key"), false);
});
