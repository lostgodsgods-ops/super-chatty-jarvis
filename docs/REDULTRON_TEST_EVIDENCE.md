# REDULTRON CORE 3.0 — Test Evidence Ledger

**Snapshot:** 2026-11-02  
**Latest observed main SHA:** `0b88a65c7bd2a21e757feab665c505f1f30e3db5`

## Current evidence captured in this review

| Timestamp (UTC) | Target | Run / issue | Result | What the evidence proves |
|---|---|---|---|---|
| 2026-11-01 22:52:16Z | Staging PWA end-to-end workflow | [Run 41359255744](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/41359255744), [Issue #907](https://github.com/lostgodsgods-ops/super-chatty-jarvis/issues/907) | FAIL | Health and Workers AI chat smoke passed; PWA search response failed required live-source contract. Authenticated event-bus/module-registry step skipped. |
| 2026-10-31 02:21:37Z | Staging PWA search proxy | [Run 41159617465](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/41159617465), [Issue #907](https://github.com/lostgodsgods-ops/super-chatty-jarvis/issues/907) | FAIL | PWA search proxy returned HTTP 502 and `SEARCH_GATEWAY_INCOMPLETE`. |
| 2026-11-01 | CI recovery workflow | [Issue #1001](https://github.com/lostgodsgods-ops/super-chatty-jarvis/issues/1001), source run 41341023898 | FAIL / CONTAINED | Third attempt failed; recovery budget exhausted. No fourth retry, source modification, merge, deployment, or secret change. |
| 2026-10-29 | Main CI | [Run 40813079981](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40813079981) | HISTORICAL PASS | CI passed for the then-current main snapshot; it does not certify the 2026-11-02 SHA. |
| 2026-10-29 | Static Site Checks | [Run 40813080034](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40813080034) | HISTORICAL PASS | Static checks passed for the then-current main snapshot; not a current exact-SHA result. |
| 2026-10-29 | Release package | [Run 40813080057](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40813080057) | HISTORICAL PASS | Package artifact generated; does not prove production deployment or runtime readiness. |

## Detailed latest scheduled run

Run [41359255744](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/41359255744), job `health-check`:
- PASS — staging Central Agent health/Tavily configuration step.
- PASS — durable queue Cron schedule verification.
- PASS — owner-scoped durable queue endpoint checks without task creation.
- PASS — unauthenticated task submission denied.
- PASS — owner-authenticated Tavily live-search workflow step.
- PASS — scoped PWA bridge search endpoint direct check.
- PASS — current-information chat uses live web sources before synthesis check.
- PASS — unauthenticated Central Agent chat route probe; HTTP 401 is the expected denial.
- FAIL — Talk to Chatty PWA chat and Tavily proxy end-to-end.
- SKIPPED — authenticated event bus and module registry.

The failed step log records:
- PWA health JSON met the expected configuration contract.
- Workers AI chat returned a non-empty reply from `@cf/meta/llama-3.1-8b-instruct-fast`, with intent `chat` and `externalActionsPerformed=false`.
- PWA search response failed the assertion requiring `ok=true`, `core.webSearchExecuted=true`, an allowed search provider, and one or more valid source URLs.
- The failure message was `Expected a live web result with at least one source`.
- The log did not establish a provider root cause. Do not infer that Tavily alone is the failing provider.

## Latest main commit

- SHA: `0b88a65c7bd2a21e757feab665c505f1f30e3db5`
- Commit summary: durable owner-scoped execution result ledger, idempotent insert semantics, D1 persistence wrapper, and related tests.
- Exact-SHA CI run: NOT ESTABLISHED in this review.
- Production deployment of this commit: NOT TESTED.
- D1 migration application and live readback: NOT TESTED.

## Evidence handling rules

1. Store timestamps in UTC and identify the timezone when displaying local time.
2. Every PASS must identify the exact commit, workflow run, environment, route, and assertion.
3. Do not promote PR-head PASS to main PASS.
4. Do not promote main CI PASS to production PASS.
5. Do not promote health-only PASS to authenticated execution PASS.
6. Keep response samples sanitized; never retain secrets, authorization headers, cookies, or sensitive request bodies.
7. Mark missing logs or skipped jobs as NOT TESTED, not PASS.
