# REDULTRON CORE 3.0 — 90-Agent Registry and Safety Gate

## Scope

`config/agent-registry.json` is a **declarative registry**, not proof that 90 independent agents have been provisioned or executed. It records 90 named slots across the four groups in the supplied architecture.

- Group A: AGENT-01–AGENT-20 — privacy and security review.
- Group B: AGENT-21–AGENT-45 — market-data and treasury simulation.
- Group C: AGENT-46–AGENT-75 — task routing, CI/CD review, health checks and delivery preparation.
- Group D: AGENT-76–AGENT-90 — independent verification and release-gate review.

## Safe defaults

- `mode` is `registry-only`.
- Every slot is `registered-not-provisioned`.
- Automatic dispatch is disabled.
- Treasury operations are simulation-only.
- Secrets are never agent-readable/exportable through this registry.
- Required audit records cannot be erased by an agent.
- Production deployment, privileged writes and irreversible actions require the configured approval gate.

## Ghost-mode terminology

“Ghost mode” means low-noise, least-privilege background processing—not invisibility, evasion of monitoring, or removal of required audit evidence. Retain security-relevant audit records and redact sensitive payloads rather than claiming a zero digital footprint.

## Core 3.0 policy decision gate

`core/policy-gate.mjs` adds a deterministic policy decision function. It does not execute tasks or connect external tools. It fails closed if the registry is absent, rejects unknown or unprovisioned agents, checks the per-agent allow-list, blocks prohibited actions, and requires complete Commander approval evidence for privileged actions. Even with approval, production deployment remains blocked until a separately reviewed executor is implemented and release-gated. Live payments, transfers, trades, and blockchain broadcasts remain simulation-only.

The focused tests are in `tests/core3-policy-gate.test.mjs`; the repository CI workflow runs them through `npm test`.

## Activation prerequisites

Do not enable dispatch until a real orchestrator exists and is tested for:
1. authenticated task intake and per-agent authorization;
2. bounded retries, idempotency and queue deduplication;
3. structured task/result schemas and timeouts;
4. durable, redacted audit events;
5. simulation-first financial workflows;
6. commander approval for privileged or irreversible actions;
7. emergency stop and fail-closed behavior;
8. CI tests proving denied actions remain denied.

The latest available Live Gateway Probe (run 40122473039) passed `/health` but failed the authenticated hybrid probe with HTTP 401 and sanitized code `OWNER_AUTH_REQUIRED`. Fix and verify that authentication contract before wiring agent dispatch to the production hybrid route.

## Status semantics

- `PASS`: backed by a current reproducible test or runtime evidence.
- `FAIL`: a current test or runtime probe failed.
- `BLOCKED`: required connection, permission, or dependency is unavailable.
- `NOT VERIFIED`: evidence is absent or stale.

A registry entry, a green historical workflow, or an HTTP 200 health endpoint alone does not prove that an agent ran or that the Python sidecar executed a task.
