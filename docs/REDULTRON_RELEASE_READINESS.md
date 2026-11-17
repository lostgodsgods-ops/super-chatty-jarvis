# REDULTRON CORE 3.0 — Release Readiness Decision

**Decision date:** 2026-11-02  
**Candidate baseline:** `0b88a65c7bd2a21e757feab665c505f1f30e3db5`  
**Decision:** <strong>BLOCKED — NOT READY FOR PRODUCTION CERTIFICATION</strong>

## Required gates

| Gate | Required evidence | Current decision |
|---|---|---|
| G1 — Package / registry integrity | Package checker and registry contract pass on exact candidate SHA. | NOT TESTED on latest SHA |
| G2 — Exact-SHA CI | Required CI, Central Agent, Hybrid Core, and static checks pass on exact candidate SHA. | NOT TESTED |
| G3 — Production authorization | Branch protection, required checks, protected Environment reviewers, least-privilege permissions verified. | NOT TESTED current |
| G4 — Central Agent runtime | Current deployed SHA provenance and health/auth/chat/queue checks pass. | FAIL / NOT TESTED; incident #907 open |
| G5 — Python Core execution | Authenticated HTTP 200, expected engine, no fallback, verified Python execution. | BLOCKED |
| G6 — Live Search | Provider attribution, source URLs, freshness, timeout, fallback, and stale-cache semantics pass. | FAIL |
| G7 — Storage / Sentinel | D1 migrations and persistence, KV behavior, Durable Object pulse, audit integrity, redaction. | NOT TESTED |
| G8 — Agent pilot | Small allowlisted pilot passes owner auth, scoped capabilities, audit, timeout, cancellation, and emergency stop. | BLOCKED |
| G9 — Android PWA | Install, update activation, offline navigation, and authenticated flow on real device. | NOT TESTED |

## Release policy

- All gates are mandatory; no weighted average or partial green status can override a failed mandatory gate.
- A package artifact is not a deployment.
- A configured service is not a verified service.
- Catalog entries are not provisioned agents.
- Production deployment and secret changes require their established owner approval path.
- Financial operations remain simulation-only unless separately designed, approved, and tested.

## Next release decision

Re-evaluate only after the P0 search and Central Agent failures are resolved, Python authenticated execution passes, exact-SHA CI is green, and all remaining required gates have evidence attached. Until then, keep production certification blocked.
