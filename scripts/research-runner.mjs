/**
 * Read-only public-market research runner.
 * No credentials, trading, accounts, writes, or arbitrary URLs are supported.
 * Usage: node scripts/research-runner.mjs
 */
const TIMEOUT_MS = 12_000;
const YAHOO = {
  Brent: "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d",
  WTI: "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=5d&interval=1d",
};
const STOOQ = {
  Brent: "https://stooq.com/q/d/l/?s=brn.f&i=d",
  WTI: "https://stooq.com/q/d/l/?s=cl.f&i=d",
};

export function calculateDailyChange(previousClose, latestClose) {
  if (![previousClose, latestClose].every(Number.isFinite) || previousClose <= 0) {
    throw new TypeError("Closing prices must be finite numbers and previous close must be positive.");
  }
  const change = latestClose - previousClose;
  return {
    changeUsd: Number(change.toFixed(4)),
    changePercent: Number(((change / previousClose) * 100).toFixed(4)),
  };
}

export function parseYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error("Yahoo chart response did not contain daily closes.");
  }
  const rows = timestamps.map((timestamp, i) => ({
    timestamp,
    close: closes[i],
  })).filter(row => Number.isFinite(row.timestamp) && Number.isFinite(row.close) && row.close > 0);
  if (rows.length < 2) throw new Error("At least two valid daily closes are required.");
  return rows.slice(-2);
}

export function parseStooqDaily(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  if (lines.length < 3 || !/^Date,Open,High,Low,Close,Volume/i.test(lines[0])) {
    throw new Error("Stooq response did not contain at least two daily rows.");
  }
  const rows = lines.slice(1).map(line => {
    const parts = line.split(",");
    return { date: parts[0], close: Number(parts[4]) };
  }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0);
  if (rows.length < 2) throw new Error("Stooq response did not contain two valid closes.");
  return rows.slice(-2);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Super-Chatty-Jarvis-ReadOnly-Research/1.0", accept: "application/json,text/csv" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.text();
}

async function fetchYahoo(symbol, url) {
  const responseText = await fetchText(url);
  const rows = parseYahooChart(JSON.parse(responseText));
  const previous = rows[0];
  const latest = rows[1];
  return {
    source: "Yahoo Finance",
    sourceUrl: url,
    previousClose: previous.close,
    latestClose: latest.close,
    timestamp: new Date(latest.timestamp * 1000).toISOString(),
    ...calculateDailyChange(previous.close, latest.close),
  };
}

async function fetchStooq(url) {
  const rows = parseStooqDaily(await fetchText(url));
  return { source: "Stooq", sourceUrl: url, previousDate: rows[0].date, latestDate: rows[1].date, latestClose: rows[1].close };
}

export async function runOilPriceResearch() {
  const results = [];
  for (const symbol of ["Brent", "WTI"]) {
    const item = { benchmark: symbol, currency: "USD", unit: "barrel" };
    try {
      const primary = await fetchYahoo(symbol, YAHOO[symbol]);
      item.primary = primary;
      try {
        const secondary = await fetchStooq(STOOQ[symbol]);
        item.secondary = secondary;
        const difference = Math.abs(primary.latestClose - secondary.latestClose);
        item.crossCheck = {
          status: difference <= Math.max(1, primary.latestClose * 0.03) ? "CLOSE_ENOUGH" : "REVIEW_MISMATCH",
          absoluteDifferenceUsd: Number(difference.toFixed(4)),
          note: "Sources may quote different futures contracts or update at different times; confirm contract and timestamp before treating as a match.",
        };
      } catch (error) {
        item.secondary = { status: "UNAVAILABLE", error: String(error.message || error) };
        item.crossCheck = { status: "NOT_VERIFIED" };
      }
      item.status = "RESEARCHED";
    } catch (error) {
      item.status = "SOURCE_FAILED";
      item.error = String(error.message || error);
    }
    results.push(item);
  }
  return {
    taskId: "public-oil-prices-readonly-v1",
    status: results.every(r => r.status === "RESEARCHED") ? "COMPLETED_WITH_SOURCE_CHECKS" : "PARTIAL_OR_BLOCKED",
    generatedAt: new Date().toISOString(),
    executionMode: "read-only-public-http",
    externalSideEffects: false,
    results,
    caveat: "Indicative futures data, not a trading signal. Source contracts and update times can differ. Verify timestamps and links before use.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await runOilPriceResearch();
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (report.status !== "COMPLETED_WITH_SOURCE_CHECKS") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`Research runner failed: ${String(error.message || error)}\n`);
    process.exitCode = 1;
  }
}
