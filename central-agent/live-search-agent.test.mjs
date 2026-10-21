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
  await assert.rejects(searchLiveWeb("safe query", {}, { fetchImpl }), /DIRECT_WEB_SEARCH_NO_RESULTS/);
});
