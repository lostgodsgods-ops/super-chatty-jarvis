import test from "node:test";
import assert from "node:assert/strict";
import { deriveMarketSignals, normalizeResearchItem, RESEARCH_LIMITS, runBoundedResearchCycle, scoreSentiment } from "./research-agents.mjs";
test("sentiment scoring is deterministic and neutral for unknown words", () => {
  assert.deepEqual(scoreSentiment("unclassified terminology"), { score: 0, positive: 0, negative: 0, label: "neutral", confidence: 0 });
  assert.equal(scoreSentiment("successful release and growth").label, "positive");
  assert.equal(scoreSentiment("critical exploit and outage").label, "negative");
});
test("market signals only accept finite positive prices and finite changes", () => {
  const result = deriveMarketSignals({ bitcoin: { usd: 60000, usd_24h_change: -5.5 }, ethereum: { usd: 3000, usd_24h_change: 1.2 }, dogecoin: { usd: 0, usd_24h_change: 100 } });
  assert.equal(result.length, 2);
  assert.equal(result[0].signal, "high-volatility-watch");
  assert.match(result[0].interpretation, /not a forecast or investment recommendation/i);
});
test("normalizer rejects missing titles and restricts GitHub links", () => {
  assert.equal(normalizeResearchItem("github", { sha: "abc", commit: { message: "launch success" }, html_url: "https://evil.example/x" }).url, "");
  assert.equal(normalizeResearchItem("github", { sha: "abc", commit: { message: "" } }), null);
  assert.equal(normalizeResearchItem("releases", { id: 4, name: "New release", html_url: "https://github.com/lostgodsgods-ops/super-chatty-jarvis/releases/tag/v1" }).url, "https://github.com/lostgodsgods-ops/super-chatty-jarvis/releases/tag/v1");
  assert.equal(normalizeResearchItem("releases", { id: 4, name: "Untrusted", html_url: "https://evil.example/x" }).url, "");
});
test("source budgets are finite and fixed", () => {
  assert.equal(RESEARCH_LIMITS.requestsPerTick, 3);
  assert.equal(RESEARCH_LIMITS.maxItemsPerSource, 10);
  assert.equal(RESEARCH_LIMITS.timeoutMs, 7000);
  assert.equal(RESEARCH_LIMITS.maxSignalsPerTick, 30);
});
test("scheduled research is disabled unless explicitly enabled", async () => {
  let touched = false;
  const result = await runBoundedResearchCycle({}, { fetchSource: async () => { touched = true; } });
  assert.equal(result.enabled, false);
  assert.equal(result.sourceCalls, 0);
  assert.equal(touched, false);
});
test("enabled research fails closed when D1 is unavailable", async () => {
  const result = await runBoundedResearchCycle({ AUTONOMOUS_RESEARCH_ENABLED: "true" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "D1_UNAVAILABLE");
});
