import test from "node:test";
import assert from "node:assert/strict";
import { fetchTavilyWithRetry } from "./worker.mjs";

test("chat live search shares the parallel open-source news fallback and never silently uses Tavily", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("api.tavily.com")) {
      throw new Error("open-source-first must not call Tavily");
    }
    if (value.includes("bing.com/news")) return new Response("", { status: 503 });
    if (value.includes("news.google.com")) return new Response(
      '<rss><channel><item><title>Fresh verified report</title><link>https://example.com/fresh-report</link><description>New source evidence</description><pubDate>Wed, 21 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>',
      { status: 200, headers: { "content-type": "application/rss+xml" } }
    );
    if (value.includes("gdeltproject.org")) return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    throw new Error("Unexpected provider: " + value);
  };

  const response = await fetchTavilyWithRetry("आज की ताज़ा खबरें", {
    SEARCH_PROVIDER_MODE: "open-source-first",
    TAVILY_API_KEY: "configured-but-disabled"
  }, { fetchImpl });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-search-provider"), "google-news-rss");
  const payload = await response.json();
  assert.equal(payload.results[0].url, "https://example.com/fresh-report");
  assert.ok(calls.some(url => url.includes("bing.com/news")));
  assert.ok(calls.some(url => url.includes("news.google.com")));
  assert.ok(calls.some(url => url.includes("gdeltproject.org")));
  assert.equal(calls.some(url => url.includes("duckduckgo.com/html")), false);
  assert.equal(calls.some(url => url.includes("api.tavily.com")), false);
});
