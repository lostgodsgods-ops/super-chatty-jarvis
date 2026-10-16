/**
 * Bounded, read-only research collectors for the Central Agent.
 * Fixed public sources, finite budgets, D1 audit, disabled unless explicitly enabled.
 */
export const RESEARCH_LIMITS = Object.freeze({ requestsPerTick: 3, maxItemsPerSource: 10, maxTextLength: 1200, timeoutMs: 7000, maxSignalsPerTick: 30 });
const SOURCES = Object.freeze({
  github: "https://api.github.com/repos/lostgodsgods-ops/super-chatty-jarvis/commits?per_page=10",
  releases: "https://api.github.com/repos/lostgodsgods-ops/super-chatty-jarvis/releases?per_page=10",
  markets: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"
});
const POSITIVE = new Set(["advance","advanced","better","boost","breakthrough","growth","improve","improved","launch","launched","positive","release","released","success","successful","win"]);
const NEGATIVE = new Set(["attack","breach","bug","broken","crash","critical","decline","decrease","exploit","fail","failed","failure","incident","outage","risk","vulnerability"]);
function safeText(value, limit = RESEARCH_LIMITS.maxTextLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
export function scoreSentiment(text) {
  const tokens = safeText(text).toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  let positive = 0, negative = 0;
  for (const token of tokens) { if (POSITIVE.has(token)) positive++; if (NEGATIVE.has(token)) negative++; }
  const total = positive + negative;
  const score = total === 0 ? 0 : Number(((positive - negative) / total).toFixed(4));
  return { score, positive, negative, label: score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral", confidence: total === 0 ? 0 : Number(Math.min(1, total / 5).toFixed(2)) };
}
export function deriveMarketSignals(markets) {
  if (!markets || typeof markets !== "object") return [];
  const signals = [];
  for (const asset of ["bitcoin", "ethereum"]) {
    const item = markets[asset], price = Number(item?.usd), change = Number(item?.usd_24h_change);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change)) continue;
    signals.push({ source: "market-telemetry", subject: asset, metric: "usd_24h_change_pct", value: Number(change.toFixed(4)), priceUsd: Number(price.toFixed(4)), signal: Math.abs(change) >= 5 ? "high-volatility-watch" : Math.abs(change) >= 2 ? "elevated-movement" : "normal-range", interpretation: "Descriptive market telemetry only; not a forecast or investment recommendation." });
  }
  return signals;
}
export function normalizeResearchItem(source, item) {
  if (source === "github") {
    const title = safeText(item?.commit?.message || item?.message, 240);
    const url = typeof item?.html_url === "string" && item.html_url.startsWith("https://github.com/lostgodsgods-ops/super-chatty-jarvis/") ? item.html_url : "";
    if (!title) return null;
    return { source, externalId: safeText(item?.sha, 100) || title, title, url, sentiment: scoreSentiment(title) };
  }
  if (source === "releases") {
    const title = safeText(item?.name || item?.tag_name, 240);
    const url = typeof item?.html_url === "string" && item.html_url.startsWith("https://github.com/lostgodsgods-ops/super-chatty-jarvis/") ? item.html_url : "";
    if (!title) return null;
    return { source, externalId: safeText(item?.id ? String(item.id) : item?.tag_name, 100) || title, title, url, sentiment: scoreSentiment(title) };
  }
  return null;
}
async function fetchJson(url) {
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json", "user-agent": "Super-Chatty-Jarvis-ReadOnly-Research/1.0" }, signal: AbortSignal.timeout(RESEARCH_LIMITS.timeoutMs) });
  if (!response.ok) throw new Error("SOURCE_HTTP_" + response.status);
  return response.json();
}

async function fetchSourceWithRetry(fetchSource, url, options = {}) {
  const maxRetries = url === SOURCES.markets ? 2 : 0;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchSource(url);
    } catch (error) {
      const code = safeText(error?.message, 80);
      if (code !== "SOURCE_HTTP_429" || attempt >= maxRetries) throw error;
      // Bounded exponential backoff: 250 ms, then 500 ms. Never spin indefinitely.
      await sleep(250 * (2 ** attempt));
    }
  }
}
async function ensureResearchSchema(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS research_observations (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', sentiment_score REAL NOT NULL, sentiment_label TEXT NOT NULL, confidence REAL NOT NULL, observed_at TEXT NOT NULL, UNIQUE(source, external_id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS research_signals (id TEXT PRIMARY KEY, source TEXT NOT NULL, subject TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, details_json TEXT NOT NULL, observed_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS agent_run_audit (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, status TEXT NOT NULL, source_count INTEGER NOT NULL, item_count INTEGER NOT NULL, error_count INTEGER NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL, details_json TEXT NOT NULL)").run();
}
export async function runBoundedResearchCycle(env, options = {}) {
  if (env?.AUTONOMOUS_RESEARCH_ENABLED !== "true") return { ok: true, enabled: false, status: "disabled-by-default", sourceCalls: 0, itemsStored: 0, signalsStored: 0 };
  if (!env?.DB || typeof env.DB.prepare !== "function" || typeof env.DB.batch !== "function") return { ok: false, enabled: true, status: "blocked", reason: "D1_UNAVAILABLE", sourceCalls: 0 };
  const startedAt = new Date().toISOString(), fetchSource = options.fetchSource || fetchJson;
  const sourceCalls = RESEARCH_LIMITS.requestsPerTick;
  let itemsStored = 0, signalsStored = 0, errorCount = 0;
  const errors = [], warnings = [];
  await ensureResearchSchema(env.DB);
  for (const [source, url] of [["github", SOURCES.github], ["releases", SOURCES.releases], ["markets", SOURCES.markets]]) {
    try {
      const payload = await fetchSourceWithRetry(fetchSource, url, options);
      if (source === "github") {
        const rows = (Array.isArray(payload) ? payload : []).slice(0, RESEARCH_LIMITS.maxItemsPerSource).map(item => normalizeResearchItem("github", item)).filter(Boolean);
        for (const row of rows) {
          const now = new Date().toISOString();
          const result = await env.DB.prepare("INSERT OR IGNORE INTO research_observations (id,source,external_id,title,url,sentiment_score,sentiment_label,confidence,observed_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), row.source, row.externalId, row.title, row.url, row.sentiment.score, row.sentiment.label, row.sentiment.confidence, now).run();
          itemsStored += result?.meta?.changes === 1 ? 1 : 0;
        }
      } else if (source === "releases") {
        const rows = (Array.isArray(payload) ? payload : []).slice(0, RESEARCH_LIMITS.maxItemsPerSource).map(item => normalizeResearchItem("releases", item)).filter(Boolean);
        for (const row of rows) {
          const now = new Date().toISOString();
          const result = await env.DB.prepare("INSERT OR IGNORE INTO research_observations (id,source,external_id,title,url,sentiment_score,sentiment_label,confidence,observed_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), row.source, row.externalId, row.title, row.url, row.sentiment.score, row.sentiment.label, row.sentiment.confidence, now).run();
          itemsStored += result?.meta?.changes === 1 ? 1 : 0;
        }
      } else {
        for (const signal of deriveMarketSignals(payload).slice(0, RESEARCH_LIMITS.maxSignalsPerTick)) {
          const now = new Date().toISOString();
          await env.DB.prepare("INSERT INTO research_signals (id,source,subject,metric,value,details_json,observed_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), signal.source, signal.subject, signal.metric, signal.value, JSON.stringify(signal), now).run();
          signalsStored++;
        }
      }
    } catch (error) {
      const code = safeText(error?.message, 80) || "SOURCE_ERROR";
      if (source === "markets" && code === "SOURCE_HTTP_429") {
        // A rate-limited optional market feed is degraded, not a coordinator failure.
        // Keep the limitation visible in the audit details; never fabricate market data.
        warnings.push({ source, code, action: "market-telemetry-skipped" });
      } else {
        errorCount++;
        errors.push({ source, code });
      }
    }
  }
  const completedAt = new Date().toISOString();
  const status = errorCount ? (errorCount === sourceCalls ? "failed" : "partial") : warnings.length ? "completed_with_warnings" : "completed";
  await env.DB.prepare("INSERT INTO agent_run_audit (id,agent_id,status,source_count,item_count,error_count,started_at,completed_at,details_json) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), "bounded-research-coordinator", status, sourceCalls, itemsStored, errorCount, startedAt, completedAt, JSON.stringify({ budget: RESEARCH_LIMITS, errors, warnings })).run();
  return { ok: errorCount === 0, enabled: true, status, sourceCalls, itemsStored, signalsStored, errorCount, errors, warnings };
}
