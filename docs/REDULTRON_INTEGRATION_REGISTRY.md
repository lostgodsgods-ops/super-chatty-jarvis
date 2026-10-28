# REDULTRON CORE 3.0 — Integration Registry

> Evidence-first inventory. A registry row is not proof of a live integration.
> Last reviewed: 2026-10-28. Source of truth: repository code/configuration and cited run records.
> Never store credential values in this document.

## Machine-readable source

- Structured catalog: `docs/integration-registry.json`
- Contract tests: `tests/integration-registry.test.mjs`
- The JSON catalog is intended for dashboards and automated audits; it records layer-specific states and next actions. It does not itself prove runtime behavior.

## Status vocabulary

- `implemented`: adapter or code path exists in the inspected repository.
- `configured`: non-secret configuration/binding is present in repository config.
- `live_verified`: a dated production probe proves the integration works end-to-end.
- `blocked`: a known prerequisite or probe currently fails.
- `not_implemented`: no implementation evidence found in the reviewed scope.
- `not_tested`: evidence is insufficient to assign another status.

A provider may have multiple statuses by layer. For example, a route can be implemented while its production authentication remains blocked.

## Current integration map

| ID | Capability / provider | Evidence in repository | Current status | Missing proof / next action |
|---|---|---|---|---|
| CORE-EDGE | Cloudflare Worker edge runtime | `central-agent/wrangler.jsonc` defines Worker, ASSETS, AI, D1, KV, Durable Object and observability settings | configured | Run deployment-provenance check and verify the deployed commit, not only the config |
| CORE-PY | Python Core HTTPS service | `central-agent/architecture/hybrid-core.mjs` validates task allowlist, HTTPS endpoint, input size, sends `x-owner-secret`, and applies a 5-second timeout | implemented | Last reported certification reached HTTP 502 / `HYBRID_CORE_AUTH_REJECTED`; strict authenticated production probe must pass |
| CORE-AUTH | Owner-secret boundary | Worker adapter requires `PYTHON_CORE_URL` and `OWNER_SECRET`; workflow references `REDULTRON_OWNER_SECRET` | implemented; live auth blocked | Read-only length/equality comparison via authorized secret-management API; never log or expose values; then separately approved sync if needed |
| CORE-D1 | Cloudflare D1 owner-auth database | Wrangler binding `DB`, database name `super-chatty-owner-auth` | configured | Confirm migrations, runtime schema, and read/write health through authorized, non-destructive checks |
| CORE-KV | Cloudflare KV sessions | Wrangler binding `SESSIONS` | configured | Verify binding reachability and expected session operations without exposing session data |
| CORE-DO | Sentinel Pulse Durable Object | Binding `SENTINEL_PULSE` and migration tag `v1-sentinel-pulse` | configured | Confirm class implementation, migration state and live pulse behavior |
| CORE-AI | Cloudflare Workers AI | Wrangler binding `AI` | configured | Identify actual model calls and run bounded non-sensitive smoke test; binding alone is not proof |
| SEARCH | Live Search providers | Wrangler var `SEARCH_PROVIDER_MODE=open-source-first`; adapter/fallback claims exist in project history | not tested end-to-end | Verify live provider, returned source URLs, attribution, timeout, stale-cache marker and fallback behavior |
| OBS | Logs / traces | Wrangler observability enabled; query-string redaction enabled; invocation logs disabled; sampling 0.1 | configured | Verify redaction against representative errors and confirm no secret/header/body leakage |
| PWA | App shell / service worker | PR #415 merged; cache version v15 and old-cache cleanup described in PR | implemented; production not tested | Verify deployed asset version, service-worker activation/update, offline navigation on Android |
| GITHUB-CI | GitHub Actions | PR #430 and #431 are open drafts at time of review | partially implemented; release gate blocked | Review exact workflow diff; require explicit environment approval before production mutations |
| FIN-READ | Banking / financial data | No live financial-provider credentials or verified adapter established by this inventory | not tested / planned | Start with mock/sandbox and consented read-only data; document provider, scopes, jurisdiction, data retention and audit |
| FIN-WRITE | Payments / transfers / trading | No live mutation capability established by this inventory | not implemented / not authorized | Do not enable until explicit approval, idempotency, limits, reconciliation, dual-control and rollback are reviewed |
| BUNKER | Bunker project | No repository or path identified in the reviewed repository scope | blocked / unknown | Discover repository or path before assigning implementation or deployment status |

## Authenticated Python Core acceptance contract

A production certification is PASS only when all are true:

1. Worker `/health` returns HTTP 200 and a valid healthy response.
2. Python Core health endpoint returns valid expected JSON.
3. Authenticated hybrid probe returns HTTP 200.
4. Response reports `engine=python-edge-hybrid`.
5. `fallbackEngaged=false`.
6. `hybridPythonCoreExecutionVerified=true`.
7. The tested commit SHA matches the deployed Worker provenance.
8. Logs contain no secret values, authorization headers, or sensitive request bodies.

A healthy health endpoint alone does not satisfy the contract. A fallback response is not proof of Python execution.

## Provider adapter contract (required before adding any integration)

Each adapter must declare:

- Stable ID, provider, capability, owner, and code path.
- Typed request and response schema with strict validation.
- Explicit hostname/route allowlist and permitted HTTP methods.
- Authentication type and minimum scopes; secret values are never committed or logged.
- Timeout, bounded retries, cancellation, and rate-limit handling.
- Idempotency key and duplicate-request behavior for any write operation.
- Sanitized error code and safe diagnostic fields.
- Audit event schema and redaction policy.
- Unit tests, negative/security tests, sandbox integration test, and production probe where authorized.
- Disable switch, rollback procedure, data retention policy, and operational owner.

Unknown actions and unrecognized providers must fail closed. Do not silently downgrade a failed authenticated action to success.

## Release gates and work order

### P0 — Production workflow boundary
- Inspect `.github/workflows/redultron-provenance-deploy.yml` and every workflow that can mutate production.
- Remove ordinary push-triggered secret synchronization/deployment unless protected by repository-enforced approval.
- Require protected GitHub Environment approval for production mutations, least-privilege token permissions, bounded concurrency and explicit rollback instructions.
- Add regression tests proving an ordinary push cannot authorize a production mutation.

### P0 — Python Core authentication
- Diagnose via read-only secret metadata/comparison. Never reveal either secret.
- Enforce the documented minimum secret length on both sides.
- Synchronize only through an explicitly approved secret-management path.
- Run the full authenticated acceptance contract above.

### P1 — Search and observability
- Verify actual provider attribution and source links.
- Test timeout, stale cache, fallback and provider failure separately.
- Confirm secrets and authorization headers are redacted from logs/traces.

### P1 — PWA / Android
- Verify live asset and service-worker version.
- Test install/update and offline navigation on a real device.
- Record device/browser/build and exact outcome.

### P2 — Financial integrations
- Begin with a mock provider or official sandbox and read-only, consented data.
- Never collect bank passwords, card PINs, CVVs or OTPs.
- Do not perform real transfers, payments, trading or account changes as part of a smoke test.
- Require explicit approval, idempotency, limits, reconciliation, audit and rollback before any mutation capability.

### P2 — Bunker
- Keep separate from REDULTRON until repository, scope, dependencies, deployment target and acceptance criteria are identified.

## Evidence references

- Master tracking issue: https://github.com/lostgodsgods-ops/super-chatty-jarvis/issues/443
- Python Core diagnostics draft: https://github.com/lostgodsgods-ops/super-chatty-jarvis/pull/430
- Production approval-gate draft: https://github.com/lostgodsgods-ops/super-chatty-jarvis/pull/431
- PWA cache cleanup merge: https://github.com/lostgodsgods-ops/super-chatty-jarvis/pull/415

Update statuses only when new evidence is available. CI pass, config presence, and a healthy endpoint are not substitutes for end-to-end production verification.
