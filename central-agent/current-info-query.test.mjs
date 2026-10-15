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
