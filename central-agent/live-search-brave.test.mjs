import test from "node:test";
import assert from "node:assert/strict";
import { searchLiveWeb } from "./live-search-agent.mjs";

test("uses the configured Brave Search API when Tavily quota is exhausted", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    calls.push({ url: value, headers: init.headers || {} });
    if (value.includes("api.tavily.com")) return new Response("quota", { status: 432 });
    if (value.includes("api.search.brave.com")) {
      assert.equal(init.headers["X-Subscription-Token"], "brave-test-key");
      return new Response(JSON.stringify({ web: { results: [
        { title: "Fresh evidence", url: "https://example.org/report", description: "A source-backed report", page_age: "2 hours ago" }
      ] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Brave should run before public fallback providers: " + value);
  };

  const result = await searchLiveWeb("latest AI news today", {
    SEARCH_PROVIDER_MODE: "tavily",
    TAVILY_API_KEY: "tavily-test-key",
    BRAVE_SEARCH_API_KEY: "brave-test-key"
  }, { fetchImpl });

  assert.equal(result.provider, "brave-search");
  assert.equal(result.sources[0].url, "https://example.org/report");
  assert.equal(result.sources[0].title, "Fresh evidence");
  assert.equal(calls.length, 2);
  assert.equal(result.diagnostics[0].status, "http-432");
});

test("skips Brave cleanly when no Brave credential is configured", async () => {
  const calls = [];
  const fetchImpl = async url => {
    const value = String(url);
    calls.push(value);
    if (value.includes("api.tavily.com")) return new Response("quota", { status: 432 });
    if (value.includes("bing.com/news")) return new Response(
      '<rss><channel><item><title>Latest update</title><link>https://example.org/news</link><description>Current source</description><pubDate>Wed, 21 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>',
      { status: 200, headers: { "content-type": "application/rss+xml" } }
    );
    if (value.includes("news.google.com")) return new Response("", { status: 503 });
    if (value.includes("gdeltproject.org")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    throw new Error("Unexpected provider: " + value);
  };
  const result = await searchLiveWeb("latest news today", {
    SEARCH_PROVIDER_MODE: "tavily",
    TAVILY_API_KEY: "tavily-test-key"
  }, { fetchImpl });

  assert.equal(result.provider, "bing-news-rss");
  assert.equal(calls.some(url => url.includes("api.search.brave.com")), false);
});
