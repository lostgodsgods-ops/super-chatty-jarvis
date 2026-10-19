import test from "node:test";
import assert from "node:assert/strict";
import { requiresLiveSearch } from "./current-info-query.mjs";
test("detects explicit current and real-time requests", () => {
  for (const q of ["latest AI news", "weather today", "What is the current price?", "2026 election update", "real-time status"]) assert.equal(requiresLiveSearch(q), true, q);
});
test("detects common Hindi freshness requests", () => {
  for (const q of ["आज की खबर क्या है", "लेटेस्ट अपडेट बताओ", "अभी का मौसम"]) assert.equal(requiresLiveSearch(q), true, q);
});
test("does not force search for timeless questions", () => {
  for (const q of ["Explain photosynthesis", "What is a variable in JavaScript?", "Tell me a short story"]) assert.equal(requiresLiveSearch(q), false, q);
});
test("rejects empty and non-string values", () => { assert.equal(requiresLiveSearch(""), false); assert.equal(requiresLiveSearch(null), false); });

test("routes specific regional factual claims to live evidence search", () => {
  for (const q of [
    "Verify whether the 1720 MW Kamala Hydro Electric Project in Kamle was approved by CCEA",
    "Arunachal Pradesh Kamala hydroelectric project installed capacity 1720 MW",
    "क्या कमला जलविद्युत परियोजना को CCEA ने मंजूरी दी?"
  ]) assert.equal(requiresLiveSearch(q), true, q);
});

test("explicit live web search requests always route to external evidence", () => {
  for (const q of [
    "Tavily search for current AI agent news",
    "Search the web for today's Cloudflare Workers status",
    "Please browse for the latest Android update",
    "Use live search to find current news"
  ]) assert.equal(requiresLiveSearch(q), true, q);
});

test("explicit Hindi/Hinglish search requests always route to external evidence", () => {
  for (const q of [
    "टैविली सर्च करो अभी की जानकारी",
    "इंटरनेट पर खोजकर ताज़ा जानकारी बताओ",
    "इसका लाइव सर्च करके बताओ",
    "आज की लाइव जानकारी खोजो"
  ]) assert.equal(requiresLiveSearch(q), true, q);
});
