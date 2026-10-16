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

function createAuditDb() {
  const db = {
    auditRows: [],
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          if (sql.startsWith("INSERT INTO agent_run_audit")) {
            db.auditRows.push({
              status: this.values[2],
              sourceCount: this.values[3],
              itemCount: this.values[4],
              errorCount: this.values[5],
              details: JSON.parse(this.values[8])
            });
          }
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    },
    async batch() { return []; }
  };
  return db;
}

test("persistent market HTTP 429 is retried and recorded as a transparent warning, not a partial failure", async () => {
  const db = createAuditDb();
  let marketCalls = 0;
  const result = await runBoundedResearchCycle(
    { AUTONOMOUS_RESEARCH_ENABLED: "true", DB: db },
    {
      sleep: async () => {},
      fetchSource: async url => {
        if (url.includes("api.github.com/repos")) return [];
        if (url.includes("api.coingecko.com")) {
          marketCalls++;
          throw new Error("SOURCE_HTTP_429");
        }
        return [];
      }
    }
  );
  assert.equal(marketCalls, 3, "market source gets the initial attempt plus two bounded retries");
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed_with_warnings");
  assert.equal(result.errorCount, 0);
  assert.deepEqual(result.warnings, [{ source: "markets", code: "SOURCE_HTTP_429", action: "market-telemetry-skipped" }]);
  assert.equal(db.auditRows.length, 1);
  assert.equal(db.auditRows[0].status, "completed_with_warnings");
  assert.equal(db.auditRows[0].errorCount, 0);
  assert.deepEqual(db.auditRows[0].details.warnings, result.warnings);
});

test("rate-limited public sources are transparently degraded without fabricating data", async () => {
  const db = createAuditDb();
  const originalFetch = globalThis.fetch;
  let marketCalls = 0;
  globalThis.fetch = async url => {
    if (url.includes("api.github.com/repos") && url.includes("/releases?")) {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" }
      });
    }
    if (url.includes("api.github.com/repos")) {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" }
      });
    }
    if (url.includes("api.coingecko.com")) {
      marketCalls++;
      return new Response(JSON.stringify({}), { status: 429, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected source URL");
  };
  try {
    const result = await runBoundedResearchCycle(
      { AUTONOMOUS_RESEARCH_ENABLED: "true", DB: db },
      { sleep: async () => {} }
    );
    assert.equal(marketCalls, 3, "market 429 gets two bounded retries");
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed_with_warnings");
    assert.equal(result.errorCount, 0);
    assert.deepEqual(result.warnings.map(w => [w.source, w.code, w.action]), [
      ["github", "SOURCE_RATE_LIMITED_403", "source-rate-limited-skipped"],
      ["releases", "SOURCE_RATE_LIMITED_403", "source-rate-limited-skipped"],
      ["markets", "SOURCE_HTTP_429", "market-telemetry-skipped"]
    ]);
    assert.equal(db.auditRows[0].status, "completed_with_warnings");
    assert.equal(db.auditRows[0].errorCount, 0);
    assert.deepEqual(db.auditRows[0].details.warnings, result.warnings);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
