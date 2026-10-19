import test from "node:test";
import assert from "node:assert/strict";
import worker, { fetchSearchProvider, SEARCH_PROVIDER_TIMEOUT_MS, parseDuckDuckGoHtml } from "./worker.mjs";

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
          assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
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
    assert.equal(JSON.parse(upstreamOptions.body).search_depth, "basic");
    assert.equal(JSON.parse(upstreamOptions.body).max_results, 5);
    assert.equal(JSON.stringify(body).includes("test-tavily-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DuckDuckGo HTML parser extracts safe, decoded result URLs and relevant text", () => {
  const html = `
    <div class="result">
      <a rel="nofollow" class="result__a" href="https://example.com/cloudflare?x=1&amp;y=2">Cloudflare Workers &amp; Durable Objects</a>
      <a class="result__snippet">Official documentation for <b>Cloudflare Workers</b>.</a>
    </div>
    <div class="result">
      <a class="result__a" href="javascript:alert(1)">Unsafe result</a>
    </div>`;
  const results = parseDuckDuckGoHtml(html, "Cloudflare Workers");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Cloudflare Workers & Durable Objects");
  assert.equal(results[0].url, "https://example.com/cloudflare?x=1&y=2");
  assert.match(results[0].content, /Official documentation for Cloudflare Workers/);
});

test("internal search falls back to direct DuckDuckGo when Tavily key is missing", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    assert.match(requestedUrl, /^https:\/\/html\.duckduckgo\.com\/html\//);
    return new Response(`
      <div class="result">
        <a class="result__a" href="https://developers.cloudflare.com/workers/">Cloudflare Workers documentation</a>
        <a class="result__snippet">Official Cloudflare Workers documentation and guides.</a>
      </div>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "Cloudflare Workers documentation" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      AI: { run: async () => ({ response: "Cloudflare Workers documentation is available." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.provider, "duckduckgo-html");
    assert.equal(body.core.searchProvider, "duckduckgo-html");
    assert.equal(body.core.webSearchExecuted, true);
    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0].url, "https://developers.cloudflare.com/workers/");
    assert.match(requestedUrl, /Cloudflare/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("direct search falls back to the structured Wikipedia API when DuckDuckGo is blocked", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).startsWith("https://html.duckduckgo.com/html/")) {
      return new Response("rate limited", { status: 429 });
    }
    assert.match(String(url), /^https:\/\/en\.wikipedia\.org\/w\/api\.php/);
    return new Response(JSON.stringify({ query: { search: [
      { title: "Cloudflare Workers", pageid: 12345, snippet: "A serverless execution environment for developers." }
    ] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "Cloudflare Workers" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      AI: { run: async () => ({ response: "The source describes Cloudflare Workers." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.provider, "wikipedia-api");
    assert.equal(body.core.searchProvider, "wikipedia-api");
    assert.equal(body.sources[0].url, "https://en.wikipedia.org/?curid=12345");
    assert.equal(urls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("Tavily HTTP 432 falls back to direct web search without retrying the quota-limited provider", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (String(url) === "https://api.tavily.com/search") {
      return new Response(JSON.stringify({ detail: { error: "private account limit detail" } }), { status: 432 });
    }
    assert.match(String(url), /^https:\/\/html\.duckduckgo\.com\/html\//);
    return new Response(`
      <div class="result">
        <a class="result__a" href="https://developers.cloudflare.com/workers/">Cloudflare Workers official docs</a>
        <a class="result__snippet">Cloudflare Workers official documentation.</a>
      </div>`, { status: 200, headers: { "content-type": "text/html" } });
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "Cloudflare Workers health checks" })
    }), { SEARCH_BRIDGE_TOKEN: "correct-token", SEARCH_API_KEY: "test-tavily-key", AI: { run: async () => ({ response: "Official Cloudflare Workers docs cover health checks." }) } });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.provider, "duckduckgo-html");
    assert.equal(body.core.searchProvider, "duckduckgo-html");
    assert.equal(requests.filter(url => url === "https://api.tavily.com/search").length, 1, "HTTP 432 must not retry Tavily");
    assert.equal(JSON.stringify(body).includes("private account limit detail"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("health reports gateway search and durable queue readiness without exposing secrets", async () => {
  const response = await worker.fetch(new Request("https://agent.example/health"), {
    SEARCH_BRIDGE_TOKEN: "gateway-test-token",
    SEARCH_API_KEY: "private-tavily-key",
    AI: {},
    DB: { prepare: () => ({}), batch: async () => [] }
  });
  const body = await response.json();
  assert.equal(body.capabilities.gatewaySearchConfigured, true);
  assert.equal(body.capabilities.durableTaskQueue, true);
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
      assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
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
      assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
      assert.equal(input.max_tokens, 450);
      assert.equal(input.messages.at(-1).content, "Hello Chatty");
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

test("legacy /search route also supports the scoped bridge token and preserves owner-session search", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    results: [{ title: "Cloudflare Workers docs", url: "https://developers.cloudflare.com/workers/", content: "Official documentation." }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://agent.example/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer bridge-token" },
      body: JSON.stringify({ query: "Cloudflare Workers", language: "en-IN" })
    }), {
      SEARCH_BRIDGE_TOKEN: "bridge-token",
      SEARCH_API_KEY: "test-tavily-key",
      AI: { run: async () => ({ response: "Cloudflare Workers docs are available." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    assert.equal(body.provider, "tavily");
    assert.equal(body.core.webSearchExecuted, true);
    assert.equal(body.sources.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy /search route rejects requests without owner session or bridge token", async () => {
  const response = await worker.fetch(new Request("https://agent.example/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Cloudflare Workers" })
  }), {
    SEARCH_BRIDGE_TOKEN: "bridge-token",
    SEARCH_API_KEY: "test-tavily-key",
    DB: { prepare: () => ({ first: async () => null }) },
    SESSIONS: { get: async () => null }
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized. Sign in with your Owner password." });
});


test("active /chat and /internal/chat routes search Tavily before AI for current questions", async () => {
  const originalFetch = globalThis.fetch;
  for (const path of ["/chat", "/internal/chat"]) {
    const sequence = [];
    globalThis.fetch = async (url, options) => {
      sequence.push("tavily");
      assert.equal(String(url), "https://api.tavily.com/search");
      assert.equal(options.headers.authorization, "Bearer test-tavily-key");
      return new Response(JSON.stringify({
        results: [{ title: "2026 official update", url: "https://example.com/update", content: "Verified source text", published_date: "2026-10-15" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const response = await worker.fetch(new Request("https://agent.example" + path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
        body: JSON.stringify({ message: "What is the latest 2026 update?", language: "en-IN" })
      }), {
        SEARCH_BRIDGE_TOKEN: "correct-token",
        SEARCH_API_KEY: "test-tavily-key",
        AI: { run: async (_model, input) => {
          sequence.push("ai");
          assert.match(input.messages[0].content, /current year is 2026/);
          assert.match(input.messages[1].content, /Verified source text/);
          return { response: "The source reports a 2026 update." };
        } }
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.core.webSearchExecuted, true);
      assert.equal(body.core.searchProvider, "tavily");
      assert.equal(body.sources.length, 1);
      assert.deepEqual(sequence, ["tavily", "ai"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("active current-information chat uses direct web search when Tavily is not configured", async () => {
  let aiCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`
    <div class="result">
      <a class="result__a" href="https://example.com/latest-news">Latest news official update</a>
      <a class="result__snippet">A current news update from the official source.</a>
    </div>`, { status: 200, headers: { "content-type": "text/html" } });
  try {
    const response = await worker.fetch(new Request("https://agent.example/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ message: "What is the latest news today?", language: "en-IN" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      AI: { run: async () => { aiCalls++; return { response: "The live result reports a current news update." }; } }
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.core.searchProvider, "duckduckgo-html");
    assert.equal(body.core.webSearchExecuted, true);
    assert.equal(body.sources.length, 1);
    assert.equal(aiCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});


test("live historical queries use Google News RSS with source URLs after DuckDuckGo fails", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    const value = String(url);
    urls.push(value);
    if (value.startsWith("https://html.duckduckgo.com/html/")) return new Response("blocked", { status: 503 });
    if (value.startsWith("https://news.google.com/rss/search")) {
      return new Response(`<?xml version="1.0"?><rss><channel><item><title>2024 technology policy update</title><link>https://example.com/2024-policy</link><description>Published report about technology policy.</description><pubDate>Mon, 14 Oct 2024 10:00:00 GMT</pubDate></item></channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    throw new Error("Unexpected provider request: " + value);
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "What happened in 2024?" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      AI: { run: async () => ({ response: "The source reports a 2024 policy update." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.provider, "google-news-rss");
    assert.equal(body.sources[0].url, "https://example.com/2024-policy");
    assert.ok(urls.some(url => url.startsWith("https://news.google.com/rss/search")));
  } finally { globalThis.fetch = originalFetch; }
});


test("live search tries Bing News RSS as an independent fallback before Google News", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    const value = String(url);
    urls.push(value);
    if (value.startsWith("https://html.duckduckgo.com/html/")) return new Response("blocked", { status: 503 });
    if (value.startsWith("https://www.bing.com/news/search")) {
      return new Response(`<?xml version="1.0"?><rss><channel><item><title>2025 policy report</title><link>https://example.com/2025-report</link><description>Current source for a 2025 report.</description><pubDate>Wed, 12 Mar 2025 09:00:00 GMT</pubDate></item></channel></rss>`, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }
    throw new Error("Unexpected provider request: " + value);
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "2025 policy report" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      AI: { run: async () => ({ response: "The source covers the 2025 report." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.provider, "bing-news-rss");
    assert.equal(body.sources[0].url, "https://example.com/2025-report");
    assert.ok(urls.some(url => url.startsWith("https://www.bing.com/news/search")));
  } finally { globalThis.fetch = originalFetch; }
});


test("search gateway returns sanitized provider diagnostics when every live search source fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value === "https://api.tavily.com/search") return new Response("quota", { status: 432 });
    if (value.startsWith("https://html.duckduckgo.com/html/")) return new Response("blocked", { status: 503 });
    if (value.startsWith("https://www.bing.com/news/search")) return new Response("blocked", { status: 503 });
    if (value.startsWith("https://news.google.com/rss/search")) return new Response("blocked", { status: 503 });
    if (value.startsWith("https://api.gdeltproject.org/api/v2/doc/doc")) return new Response("blocked", { status: 503 });
    throw new Error("Unexpected provider request");
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "What is the latest news today?", language: "en-IN" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      SEARCH_API_KEY: "test-tavily-key",
      AI: { run: async () => ({ response: "This should not run." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.code, "LIVE_SEARCH_ALL_PROVIDERS_FAILED");
    assert.ok(body.providers.some(item => item.provider === "tavily" && item.status === "http-432"));
    assert.ok(body.providers.some(item => item.provider === "google-news-rss" && item.status === "http-503"));
    assert.ok(body.providers.some(item => item.provider === "gdelt-doc-api" && item.status === "http-503"));
    assert.equal(body.providers.some(item => JSON.stringify(item).includes("quota")), false);
  } finally { globalThis.fetch = originalFetch; }
});


test("internal chat preserves provider diagnostics when every live provider throws a network error", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  const requested = [];
  console.warn = (event, payload) => warnings.push({ event, payload });
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), timeoutSignal: options.signal instanceof AbortSignal });
    throw new TypeError("simulated outbound network failure");
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ message: "What is the latest NASA Artemis news today?", language: "en-US" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      AI: { run: async () => ({ response: "Should not be called before live evidence." }) }
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.code, "LIVE_SEARCH_ALL_PROVIDERS_FAILED");
    assert.ok(Array.isArray(body.providers));
    assert.ok(body.providers.some(item => item.provider === "duckduckgo-html" && item.status === "network-error"));
    assert.ok(body.providers.some(item => item.provider === "google-news-rss" && item.status === "network-error"));
    assert.ok(requested.length >= 4);
    assert.ok(requested.every(item => item.timeoutSignal));
    assert.ok(requested.every(item => !item.url.includes("correct-token")));
    assert.ok(warnings.some(item => item.event === "live_search_provider_network_failure" && item.payload.endpoint === "https://html.duckduckgo.com/html/"));
    assert.ok(warnings.filter(item => item.event === "live_search_provider_network_failure").every(item => typeof item.payload.errorName === "string" && typeof item.payload.errorMessage === "string"));
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});


test("search provider fetch enforces a five-second production timeout and logs sanitized endpoint diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  assert.equal(SEARCH_PROVIDER_TIMEOUT_MS, 5000);
  console.warn = (event, payload) => warnings.push({ event, payload });
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    setTimeout(() => {}, 25);
  });
  try {
    await assert.rejects(
      fetchSearchProvider("test-provider", "https://search.example/api?q=private-query", {}, 10),
      error => error?.name === "TimeoutError"
    );
    assert.equal(warnings[0].event, "live_search_provider_network_failure");
    assert.equal(warnings[0].payload.provider, "test-provider");
    assert.equal(warnings[0].payload.endpoint, "https://search.example/api");
    assert.equal(warnings[0].payload.status, "timeout");
    assert.equal(warnings[0].payload.errorName, "TimeoutError");
    assert.equal(warnings[0].payload.endpoint.includes("private-query"), false);
    assert.equal(typeof warnings[0].payload.errorMessage, "string");
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});


test("TAVILY_API_KEY alias is bound and used without exposing the key", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), "https://api.tavily.com/search");
    authorization = options.headers.authorization;
    return new Response(JSON.stringify({ results: [
      { title: "2026 official update", url: "https://example.com/2026-update", content: "Current sourced update", score: 0.99 }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "latest 2026 official update" })
    }), { SEARCH_BRIDGE_TOKEN: "correct-token", TAVILY_API_KEY: "alias-test-secret" });
    assert.equal(response.status, 200);
    assert.equal(authorization, "Bearer alias-test-secret");
    const body = await response.json();
    assert.equal(body.provider, "tavily");
    assert.equal(JSON.stringify(body).includes("alias-test-secret"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("all-provider network failures return structured per-provider diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = async () => { throw new TypeError("simulated upstream network failure"); };
  console.warn = () => {};
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "latest 2026 official update" })
    }), { SEARCH_BRIDGE_TOKEN: "correct-token", SEARCH_API_KEY: "test-key" });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, "LIVE_SEARCH_ALL_PROVIDERS_FAILED");
    const providers = body.providers.map(item => item.provider);
    for (const provider of ["tavily", "duckduckgo-html", "bing-news-rss", "google-news-rss", "gdelt-doc-api"]) {
      assert.ok(providers.includes(provider), "missing diagnostic for " + provider);
    }
    assert.equal(JSON.stringify(body).includes("test-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});


test("explicit TAVILY_API_KEY takes precedence over a stale legacy SEARCH_API_KEY", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), "https://api.tavily.com/search");
    authorization = options.headers.authorization;
    return new Response(JSON.stringify({ results: [
      { title: "Current source", url: "https://example.com/current-source", content: "Verified source", score: 0.99 }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://agent.example/internal/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer correct-token" },
      body: JSON.stringify({ query: "latest 2026 official update" })
    }), {
      SEARCH_BRIDGE_TOKEN: "correct-token",
      SEARCH_API_KEY: "legacy-exhausted-key",
      TAVILY_API_KEY: "current-tavily-key"
    });
    assert.equal(response.status, 200);
    assert.equal(authorization, "Bearer current-tavily-key");
    const body = await response.json();
    assert.equal(body.provider, "tavily");
    assert.equal(JSON.stringify(body).includes("current-tavily-key"), false);
    assert.equal(JSON.stringify(body).includes("legacy-exhausted-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
