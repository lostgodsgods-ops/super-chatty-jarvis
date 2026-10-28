import test from "node:test";
import assert from "node:assert/strict";
import { searchLiveWeb } from "./live-search-agent.mjs";

test("falls back from Tavily quota failure to no-key DuckDuckGo results", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    if (String(url).includes("api.tavily.com")) return new Response("limit", { status: 432 });
    if (String(url).includes("duckduckgo.com/html")) return new Response(
      '<a class="result__a" href="https://example.com/current">Current report</a><a class="result__snippet">Verified snippet</a>',
      { status: 200, headers: { "content-type": "text/html" } }
    );
    throw new Error("Unexpected provider");
  };
  const result = await searchLiveWeb("general technology research", {
    SEARCH_PROVIDER_MODE: "tavily", TAVILY_API_KEY: "test-token"
  }, { fetchImpl });
  assert.equal(result.provider, "duckduckgo-html");
  assert.equal(result.sources[0].url, "https://example.com/current");
  assert.equal(calls.length, 2);
});

test("time-sensitive search never substitutes encyclopedia results for fresh evidence", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("api.tavily.com")) return new Response("quota", { status: 432 });
    if (String(url).includes("duckduckgo.com/html")) return new Response("", { status: 503 });
    if (String(url).includes("bing.com/news")) return new Response("", { status: 503 });
    if (String(url).includes("news.google.com")) return new Response("", { status: 503 });
    if (String(url).includes("gdeltproject.org")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    throw new Error("Fresh query should not use encyclopedia fallback");
  };
  await assert.rejects(
    searchLiveWeb("latest breaking news today", { SEARCH_PROVIDER_MODE: "tavily", TAVILY_API_KEY: "test-token" }, { fetchImpl }),
    error => error.code === "LIVE_SEARCH_ALL_PROVIDERS_FAILED"
  );
});

test("rejects empty query and malformed result URLs", async () => {
  await assert.rejects(searchLiveWeb("  ", {}, { fetchImpl: async () => { throw new Error("must not fetch"); } }), /LIVE_SEARCH_EMPTY_QUERY/);
  const fetchImpl = async () => new Response(
    '<a class="result__a" href="/relative/path">bad</a><a class="result__snippet">bad</a>',
    { status: 200 }
  );
  await assert.rejects(searchLiveWeb("safe query", {}, { fetchImpl }), /LIVE_SEARCH_ALL_PROVIDERS_FAILED/);
});

test("uses configured Tavily credentials by default when provider mode is unset", async () => {
  let authorization = "";
  const fetchImpl = async (_url, init = {}) => {
    authorization = init.headers.authorization;
    return new Response(JSON.stringify({ results: [
      { title: "Current source", url: "https://example.com/source", content: "Evidence" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await searchLiveWeb("latest verified query", { TAVILY_API_KEY: "configured-key" }, { fetchImpl });
  assert.equal(authorization, "Bearer configured-key");
  assert.equal(result.provider, "tavily");
});


test("runs independent fresh-news fallback providers concurrently after primary search is unavailable", async () => {
  const started = [];
  let releaseGoogle;
  const googleGate = new Promise(resolve => { releaseGoogle = resolve; });
  const fetchImpl = async url => {
    const value = String(url);
    if (value.includes("bing.com/news")) {
      started.push("bing");
      return new Response("", { status: 503 });
    }
    if (value.includes("news.google.com")) {
      started.push("google");
      await googleGate;
      return new Response(
        '<rss><channel><item><title>Latest verified update</title><link>https://example.com/fresh</link><description>Fresh source evidence</description><pubDate>Wed, 21 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>',
        { status: 200, headers: { "content-type": "application/rss+xml" } }
      );
    }
    if (value.includes("gdeltproject.org")) {
      started.push("gdelt");
      return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    }
    throw new Error("Unexpected provider: " + value);
  };
  const pending = searchLiveWeb("latest news today", { SEARCH_PROVIDER_MODE: "public" }, { fetchImpl });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(new Set(started), new Set(["bing", "google", "gdelt"]));
  releaseGoogle();
  const result = await pending;
  assert.equal(result.provider, "google-news-rss");
  assert.equal(result.sources[0].url, "https://example.com/fresh");
});


test("open-source-first mode never spends Tavily credits when a key is configured", async () => {
  const calls = [];
  const fetchImpl = async url => {
    const value = String(url);
    calls.push(value);
    if (value.includes("api.tavily.com")) return new Response(JSON.stringify({ results: [
      { title: "Tavily-only result", url: "https://example.com/tavily", content: "Paid-provider result" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
    if (value.includes("bing.com/news")) return new Response("", { status: 503 });
    if (value.includes("news.google.com")) return new Response("", { status: 503 });
    if (value.includes("gdeltproject.org")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    if (value.includes("duckduckgo.com/html")) return new Response(
      '<a class="result__a" href="https://example.com/public">Public source</a><a class="result__snippet">Open-source result</a>',
      { status: 200, headers: { "content-type": "text/html" } }
    );
    throw new Error("Unexpected provider");
  };
  const result = await searchLiveWeb("latest public research today", {
    SEARCH_PROVIDER_MODE: "open-source-first",
    TAVILY_API_KEY: "configured-but-disabled"
  }, { fetchImpl });
  assert.equal(result.provider, "duckduckgo-html");
  assert.equal(calls.some(url => url.includes("api.tavily.com")), false);
});


test("Hindi freshness queries use parallel dated-news providers before broad web fallback", async () => {
  const calls = [];
  const fetchImpl = async url => {
    const value = String(url);
    calls.push(value);
    if (value.includes("bing.com/news")) return new Response(
      '<rss><channel><item><title>ताज़ा समाचार</title><link>https://example.com/hindi-news</link><description>नई जानकारी</description><pubDate>Wed, 21 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>',
      { status: 200, headers: { "content-type": "application/rss+xml" } }
    );
    if (value.includes("news.google.com")) return new Response("", { status: 503 });
    if (value.includes("gdeltproject.org")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    throw new Error("Hindi freshness query should use news providers before generic fallback: " + value);
  };
  const result = await searchLiveWeb("आज की ताज़ा खबरें", { SEARCH_PROVIDER_MODE: "public" }, { fetchImpl });
  assert.equal(result.provider, "bing-news-rss");
  assert.ok(calls.some(url => url.includes("bing.com/news")));
  assert.equal(calls.some(url => url.includes("duckduckgo.com/html")), false);
  assert.equal(calls.some(url => url.includes("wikipedia.org")), false);
});


test("serves a bounded-age stale cache when the same provider context fails later", async () => {
  let shouldFail = false;
  const fetchImpl = async url => {
    if (shouldFail) throw new TypeError("simulated provider outage");
    if (String(url).includes("api.tavily.com")) return new Response(JSON.stringify({ results: [
      { title: "Previously found source", url: "https://example.com/cached-source", content: "Cached evidence" }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error("Unexpected provider: " + String(url));
  };
  const env = { SEARCH_PROVIDER_MODE: "tavily", TAVILY_API_KEY: "cache-test-key" };
  const query = "cache fallback regression test";
  const first = await searchLiveWeb(query, env, { fetchImpl });
  assert.equal(first.sources[0].url, "https://example.com/cached-source");
  shouldFail = true;
  await assert.rejects(
    searchLiveWeb(query, env, { fetchImpl }),
    error => error.code === "LIVE_SEARCH_ALL_PROVIDERS_FAILED"
  );
  const stale = await searchLiveWeb(query, env, { fetchImpl, allowStale: true });
  assert.equal(stale.stale, true);
  assert.ok(stale.cachedAt);
  assert.equal(stale.sources[0].url, "https://example.com/cached-source");
  assert.ok(stale.diagnostics.some(item => item.provider === "stale-cache" && item.status === "served-stale"));
});


test("Bing News RSS tracking links are normalized to the publisher article URL", async () => {
  const fetchImpl = async url => {
    const value = String(url);
    if (value.includes("bing.com/news/search")) {
      return new Response(
        '<rss><channel><item><title>Publisher article</title><link>https://www.bing.com/news/apiclick.aspx?ref=tracked&amp;url=https%3A%2F%2Fpublisher.example%2Fstory%3Fid%3D42&amp;c=tracking</link><description>Original report</description><pubDate>Wed, 28 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>',
        { status: 200, headers: { "content-type": "application/rss+xml" } }
      );
    }
    if (value.includes("news.google.com")) return new Response("", { status: 503 });
    if (value.includes("gdeltproject.org")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    throw new Error("Unexpected provider: " + value);
  };
  const result = await searchLiveWeb("latest news today", { SEARCH_PROVIDER_MODE: "public" }, { fetchImpl });
  assert.equal(result.provider, "bing-news-rss");
  assert.equal(result.sources[0].url, "https://publisher.example/story?id=42");
});

test("provider diagnostics never log raw upstream exception messages", async () => {
  const privateMarker = "UPSTREAM_PRIVATE_DETAIL_9f2a";
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await assert.rejects(
      searchLiveWeb("provider privacy regression", { SEARCH_PROVIDER_MODE: "public" }, {
        fetchImpl: async () => { throw new TypeError(privateMarker); }
      }),
      error => error.code === "LIVE_SEARCH_ALL_PROVIDERS_FAILED"
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.some(args => JSON.stringify(args).includes(privateMarker)), false);
});

