import test from "node:test";
import assert from "node:assert/strict";
import { buildTavilyQuery, rankTavilyResults } from "./search-context.mjs";

test("normalizes spoken filler without dropping the user's actual topic", () => {
  assert.equal(
    buildTavilyQuery("Hey Chatty, um, please find the latest update about India's Chandrayaan mission."),
    "latest update about India's Chandrayaan mission"
  );
});

test("does not invent a query when the spoken message is empty or filler only", () => {
  assert.equal(buildTavilyQuery(" uh, um, please "), "");
  assert.equal(buildTavilyQuery("   "), "");
});

test("ranks source context by overlap with the exact user intent before provider score", () => {
  const ranked = rankTavilyResults("latest Chandrayaan mission update", [
    { title: "Latest cricket scores", url: "https://example.com/cricket", content: "Cricket scores today", score: 0.99 },
    { title: "Chandrayaan mission latest update", url: "https://example.com/space", content: "Latest update about Chandrayaan mission", score: 0.45 },
    { title: "Unrelated technology news", url: "https://example.com/tech", content: "A general technology roundup", score: 0.7 }
  ]);
  assert.equal(ranked[0].url, "https://example.com/space");
  assert.equal(ranked.some(item => item.url === "https://example.com/cricket"), false);
});

test("keeps usable low-overlap results as a fallback instead of fabricating relevance", () => {
  const ranked = rankTavilyResults("rare topic", [
    { title: "Source A", url: "https://example.com/a", content: "Summary A", score: 0.8 },
    { title: "Source B", url: "https://example.com/b", content: "Summary B", score: 0.4 }
  ]);
  assert.equal(ranked[0].url, "https://example.com/a");
});
