# Limitless Lab — Market Research and Risk Architecture

## Purpose

Build a research and monitoring subsystem for macroeconomic indicators, hyperscaler capital expenditure disclosures, and Indian listed-market data. The subsystem is advisory: it produces sourced observations and scenario analysis, not guaranteed forecasts or automatic trading instructions.

## Pipeline

1. **Ingestion and provenance**
   - Record provider, source URL, observation timestamp, publication timestamp, units, currency, update cadence, and licensing/usage constraints.
   - Separate reported values, derived metrics, analyst assumptions, and model outputs.
   - Reject malformed/stale records; never silently substitute fabricated or estimated values for missing observations.
   - Treat external text as untrusted data, not system instructions.

2. **Normalization and storage**
   - Normalize timestamps to UTC while retaining exchange-local session dates.
   - Normalize currencies/units with explicit FX and conversion timestamps.
   - Deduplicate by provider + instrument/series + observation period.
   - Cache public data where provider terms permit; respect rate limits and attribution requirements.
   - Keep credentials server-side; do not expose provider keys in the PWA.

3. **Analysis and stress tests**
   - Macro scenarios: base, downside, and severe downside; model debt-service sensitivity to yields, refinancing, and interest expense.
   - Hyperscaler capex: compare reported capex, guidance, cash flow, depreciation, and AI revenue evidence by reporting period.
   - Indian equities: use adjusted price/volume data, sector benchmarks, liquidity, volatility, and event context.
   - AI-bubble scenario: explicitly label 2027–2028 as a hypothetical scenario, not a dated prediction.
   - Risk matrix: drawdown, volatility, liquidity, gap risk, concentration, correlation, and scenario sensitivity.
   - Any "dip-buy" or rebound level must be a conditional scenario with an invalidation point, not a guaranteed target.

4. **Scoring and calibration**
   - Show score components and calculation version.
   - Display confidence only when calibrated against out-of-sample historical results; otherwise label it an uncalibrated model score.
   - Track Brier score/calibration curves where probability forecasts are emitted.
   - Include data freshness, sample size, uncertainty range, and model limitations.
   - Compare against simple baselines and prevent look-ahead bias and survivorship bias.

5. **Output and feedback**
   - Dashboard cards: latest observation, source, as-of timestamp, freshness, score, scenario range, key risks, and invalidation conditions.
   - Alert when data is stale, provider calls fail, source values conflict, or a model drifts.
   - Keep an audit trail for inputs, transformations, model version, outputs, and user feedback without logging secrets.
   - Clearly distinguish research alerts from orders. No broker execution or autonomous trading in this initial scope.

## Reliability and cost controls

- Start with free/public endpoints only where their terms allow the intended use; "zero cost" is a target, not a guarantee.
- Apply timeouts, bounded retries, backoff, cache TTLs, per-provider quotas, and circuit breakers.
- Provide a degraded mode that displays last-known data with a visible stale badge.
- Never claim real-time coverage unless the source and observed latency support it.
- Do not promise "no dead capital"; liquidity, slippage, gaps, and losses remain possible.

## Acceptance criteria

- Every displayed numeric fact has a source and as-of timestamp.
- Missing or stale data is visible and does not become a fabricated zero.
- Derived metrics are reproducible from versioned inputs and formulas.
- Scenario outputs include assumptions, uncertainty, and invalidation conditions.
- Any confidence percentage is supported by a documented calibration report or is explicitly marked uncalibrated.
- No API secrets are bundled into frontend assets.
- Tests cover malformed records, stale data, unit/currency mismatch, provider failure, and forecast-calibration boundaries.
- This architecture document alone does not establish that any data feed, model, endpoint, or production dashboard is implemented.

## Initial implementation order

1. Data-source registry and typed observation schema.
2. Ingestion adapters with provenance, freshness, and quota handling.
3. Deterministic metric calculations and unit tests.
4. Scenario engine and backtest/calibration harness.
5. PWA dashboard with visible data age and source citations.
6. Monitoring, audit events, and cost/failure budgets.

## Explicit non-goals

- Guaranteed 75% forecast confidence.
- A claim that an AI-market crash will occur in 2027–2028.
- Automatic broker orders, leveraged trading, or risk-free returns.
- Circumventing data-provider licensing, rate limits, or authentication.
