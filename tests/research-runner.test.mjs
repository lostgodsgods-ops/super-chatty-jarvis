import test from "node:test";
import assert from "node:assert/strict";
import { calculateDailyChange, parseYahooChart, parseStooqDaily } from "../scripts/research-runner.mjs";

test("calculates absolute and percentage daily change", () => {
  assert.deepEqual(calculateDailyChange(80, 84), { changeUsd: 4, changePercent: 5 });
});

test("rejects invalid previous close", () => {
  assert.throws(() => calculateDailyChange(0, 84), /positive/);
});

test("parses two valid Yahoo daily closes and skips null close", () => {
  const rows = parseYahooChart({
    chart: { result: [{
      timestamp: [1000, 2000, 3000],
      indicators: { quote: [{ close: [80, null, 84] }] }
    }] }
  });
  assert.deepEqual(rows, [{ timestamp: 1000, close: 80 }, { timestamp: 3000, close: 84 }]);
});

test("rejects Yahoo response with insufficient data", () => {
  assert.throws(() => parseYahooChart({ chart: { result: [{ timestamp: [1000], indicators: { quote: [{ close: [80] }] } }] } }), /two valid daily closes/);
});

test("parses Stooq CSV closes", () => {
  const rows = parseStooqDaily("Date,Open,High,Low,Close,Volume\n2026-10-09,79,81,78,80,100\n2026-10-12,81,85,80,84,110\n");
  assert.deepEqual(rows, [{ date: "2026-10-09", close: 80 }, { date: "2026-10-12", close: 84 }]);
});

test("rejects malformed Stooq CSV", () => {
  assert.throws(() => parseStooqDaily("no data"), /at least two daily rows/);
});
