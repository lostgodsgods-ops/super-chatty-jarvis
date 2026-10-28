# REDULTRON CORE 3.0 — Release Package Runbook

## Purpose

This bundle makes the integration inventory, agent catalog, release gates, and evidence requirements reviewable as one package. It is **not** a production deployment and does not turn registered agents into running agents.

## Run locally (Node.js 20+)

```sh
node --test
node scripts/redultron-package-check.mjs
```

The package checker exits non-zero only when the package contract is structurally invalid. A structurally valid package can still report `PACKAGE_VALIDATED_WITH_BLOCKERS`; that is expected until every production gate has independently passed.

## Bundle contents

- `docs/redultron-release-package.json` — release manifest, acceptance gates, and known blockers.
- `docs/integration-registry.json` — per-integration implementation/configuration/production status.
- `docs/REDULTRON_INTEGRATION_REGISTRY.md` — human-readable evidence and integration runbook.
- `config/agent-registry.json` — 90 registered agent specifications (not running workers).
- `central-agent/agent-orchestrator.mjs` — eight bounded runtime roles.
- `central-agent/architecture/hybrid-core.mjs` — Worker-to-Python adapter.
- `hybrid-core/` — Python Core source and deployment configuration.

## Release gates (all required)

1. **Package integrity:** JSON schemas, unique integration IDs, required integration coverage, agent count parity, and required artifacts validate.
2. **CI:** required workflows pass on the exact candidate commit SHA. A previous commit's green run does not certify a newer SHA.
3. **Production approval:** branch protection and the GitHub `production` Environment reviewers are configured and verified.
4. **Python Core execution:** authenticated request returns HTTP 200, `engine=python-edge-hybrid`, `fallbackEngaged=false`, and `hybridPythonCoreExecutionVerified=true`.
5. **Live Search:** primary provider, timeout, fallback, source URLs, and stale-cache marker are tested separately.
6. **Storage and Sentinel:** D1 migrations/schema, KV session behavior, Durable Object pulse, audit integrity, and redaction are verified with bounded probes.
7. **Agent pilot:** provision a small allowlisted set only after owner-session enforcement, scoped permissions, audit events, timeout, cancellation, and explicit approval tests pass. Expand gradually.
8. **Android PWA:** install, service-worker update activation, cache version, offline navigation, and authenticated user flow are checked on a real device.

## Safety and operational rules

- Never place secret values in this bundle, logs, screenshots, or pull-request comments.
- Do not auto-sync production secrets as part of a package build.
- Keep automatic agent dispatch disabled until the pilot gates pass.
- Code mutation remains proposal-only unless a separately reviewed workflow explicitly grants a narrow action.
- Financial actions remain simulation-only by default.
- Do not mark an integration `live_verified` based on source code, a configured binding, health-only endpoint, or an older CI run.
- Production deployment is a separate approved operation; the package checker does not deploy or mutate production.

## Current status snapshot

As of 2026-10-28, the registry identifies Python authenticated execution, secret parity, production reviewer configuration, live search reachability, and Android PWA verification as unresolved. The 90-agent catalog reports zero provisioned agents and automatic dispatch disabled; the Central Agent exposes eight bounded runtime roles. These are separate facts and must not be conflated.

## Evidence required for every PASS

Record the UTC timestamp, candidate commit SHA, workflow run URL/ID, request path, HTTP status, sanitized response fields, and test result. For runtime assertions, preserve enough sanitized evidence to reproduce the check without retaining credentials or personal data.
