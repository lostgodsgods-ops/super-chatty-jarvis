# REDULTRON CORE 3.0 — Execution Readiness Runbook

**Status:** PREPARATION / GATED — not a production activation certificate.  
**Scope:** authentication repair, gateway proof, staged agent provisioning, and wallet safety.  
**Branch:** `feat/90-agent-ghost-mode-registry`  
**Related PR:** #287.

## Non-negotiable execution boundaries

- Never bypass `OWNER_AUTH_REQUIRED`, weaken token validation, or log credential values.
- A failed authentication or probe must fail closed. No infinite retry loops.
- Production deployment, protected-branch merge, privileged actions, and financial execution are separate gates.
- The 90-agent manifest is a registry of slots, not proof of 90 running agents.
- No agent receives private keys, seed phrases, owner secrets, or unrestricted wallet permissions.
- Treasury and transfers remain simulation-only. Any future outgoing transfer requires separate owner authentication, explicit transaction-specific approval, and independent policy validation.
- Emergency stop must stop dispatch and privileged execution; it must not erase audit evidence.

## Gate checklist

### Gate 0 — Source and review
- [ ] Confirm PR #287 head SHA and diff are the intended version.
- [ ] Required CI, Central Agent tests, and static checks pass on the exact head SHA.
- [ ] Required independent review and branch-protection rules are satisfied.
- [ ] No merge or deployment is inferred from a passing test alone.

### Gate 1 — Canonical secret binding
- [ ] Repository Actions secret `REDULTRON_OWNER_SECRET` is configured.
- [ ] Worker deployment maps that secret to runtime `OWNER_SECRET`.
- [ ] Live-probe and provenance workflows use the same canonical secret name.
- [ ] Tests assert the actual runtime secret payload uses the canonical secret.
- [ ] Secret values never appear in logs, responses, screenshots, or artifacts.

### Gate 2 — Production gateway proof
- [ ] Deploy only from the reviewed, protected main branch using the approved deployment workflow.
- [ ] `GET /health` returns HTTP 200 and `ok: true`.
- [ ] Authenticated `POST /api/internal/hybrid-probe` returns HTTP 200 with the expected schema.
- [ ] Response proves `engine: python-edge-hybrid`, valid result schema, `fallbackEngaged: false`, and `hybridPythonCoreExecutionVerified: true`.
- [ ] Negative controls reject missing, malformed, and incorrect owner credentials.
- [ ] Record workflow run ID, commit SHA, HTTP statuses, sanitized schema result, and timestamps.

**Gate 2 PASS condition:** all positive and negative controls above pass on the deployed commit. A healthy public endpoint alone is insufficient.

### Gate 3 — Python sidecar and task intake
- [ ] Real request-response round-trip is verified, not just a health ping.
- [ ] Task schema, payload limits, deadline, idempotency, cancellation, and audit event are verified.
- [ ] Retry policy is bounded (maximum 3 attempts), uses backoff, and stops on auth errors; no credential retries or infinite loops.
- [ ] Circuit-breaker/incident state prevents dispatch after repeated failures.
- [ ] Emergency stop blocks new dispatch and privileged actions.

### Gate 4 — Staged agent activation
- [ ] Begin with one non-privileged test agent in simulation/staging.
- [ ] Verify allowlist enforcement, unknown-agent rejection, audit logging, and idempotent task handling.
- [ ] Activate groups in controlled batches only after the preceding batch passes.
- [ ] Reconcile live provisioned count against registry; do not claim 90 live agents unless each is independently evidenced.
- [ ] Do not enable unattended production self-modification or deployment. Changes require CI, review, release gates, and rollback path.

### Gate 5 — Wallet and treasury safety
- [ ] Incoming-fund monitoring is read-only until a wallet provider and threat model are reviewed.
- [ ] Treasury agents use public data and mock balances only.
- [ ] No outgoing transfer is initiated by an agent.
- [ ] Any future transfer path has a separate transaction-specific owner approval, destination/amount confirmation, limits, audit trail, and emergency stop.
- [ ] Never store private keys or seed phrases in agent prompts, registry files, logs, or repository secrets accessible to agents.

## Failure handling

- Authentication failure: deny, redact details, log a correlation ID, alert; do not bypass or retry indefinitely.
- Gateway or sidecar failure: stop dispatch, perform at most 3 bounded retries for retryable transient failures, then open an incident and require review.
- Schema mismatch or fallback execution: mark probe FAIL; do not certify Python execution.
- Any financial or policy boundary violation: stop affected execution path and preserve audit evidence.

## Evidence ledger

For every gate, record:
- PASS / FAIL / BLOCKED / NOT TESTED
- commit SHA and deployment revision
- GitHub Actions workflow name and run ID
- HTTP status and sanitized response schema (never credentials)
- test evidence, timestamps, and unresolved risks

## Current known baseline (must be rechecked before activation)

- Registry manifest defines 90 slots across groups A–D.
- Last inspected manifest reports `agentsProvisioned: 0`, `automaticDispatchEnabled: false`, `financialExecution: simulation-only`, and `productionDeploymentEnabled: false`.
- PR #287 is open; production deployment and a successful post-deployment authenticated hybrid probe are not established by this document.
- This runbook is a readiness artifact, not evidence that any gated operation has passed.
