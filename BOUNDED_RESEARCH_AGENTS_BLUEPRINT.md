# Bounded Research Agents & Signal Analytics

## Status
Adds a bounded read-only research coordinator and deterministic sentiment/market-signal calculations. It does not create self-spawning agents, execute tools, modify GitHub, place trades, or grant permissions. Existing Cron is every 15 minutes; research is disabled by default.

## Agent roles
- GitHub Research Collector: reads the fixed public commits endpoint for this repository; stores unique commit-message observations.
- Tech Trend Collector: reads the public Hacker News top-story list and up to 10 stories; stores unique normalized titles and URLs.
- Market Telemetry Collector: reads a fixed CoinGecko endpoint for BTC/ETH price and 24-hour change; stores descriptive signals only.
- Signal Analyst: applies a transparent lexicon sentiment score to titles and labels market movement using fixed thresholds. This is a heuristic, not a trained predictive model.
- Coordinator / Audit: max 3 primary source calls per 15-minute cron, max 10 records per text source, 7-second per-request timeout, D1 idempotency for text observations, run audit, and bounded error output. Hacker News uses up to 10 additional item lookups, so total network calls can reach 13 per tick.

## Enablement
Default is OFF. Enable only after review by setting the Cloudflare Worker variable AUTONOMOUS_RESEARCH_ENABLED=true. Until then Cron returns disabled status without network or D1 side effects. Disable by removing the variable or setting it to anything except the literal true.

## D1 tables
- research_observations: normalized, deduplicated titles with heuristic sentiment.
- research_signals: numeric market telemetry and interpretation.
- agent_run_audit: per-cycle status, counts, errors, and budget.
Existing knowledge_tasks retains its exact owner-approval requirement; these collectors do not enqueue knowledge tasks or consume user approval nonces.

## Safety and limitations
The collector never fetches arbitrary URLs supplied by remote content; story URLs are stored as data only. Market signals are descriptive, not investment advice. Public data can be stale, incomplete, rate-limited, or noisy. Cloudflare Cron is periodic, not continuous real-time execution. Work is deliberately bounded; there is no infinite compute.
