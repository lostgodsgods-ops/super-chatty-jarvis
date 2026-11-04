# SUPER CHATTY JARVIS — Operational Orchestration Blueprint

Status: proposed implementation contract; not a claim that these capabilities are deployed.
Scope: mobile-first orchestration, bounded autonomous engineering, observability, and safe data research.

## 1. Capability truth labels

Every module and dashboard tile MUST use one of:
- IMPLEMENTED — code exists and its acceptance tests pass.
- SIMULATED — deterministic local simulation only; no external side effect.
- EXTERNAL-DEPENDENT — requires an external service, permission, credential, quota, or operator setup.
- UNVERIFIED — evidence is missing or stale.
- BLOCKED — a required prerequisite or policy gate failed.

Do not label a module "active" merely because it appears in a registry or diagram. Show source commit, latest test run, last health observation, and timestamp when available.

## 2. Core orchestrator

Responsibilities:
- Accept a task, normalize it into a bounded task contract, and assign a stable task ID.
- Decompose work into steps with dependencies, timeouts, retry ceilings, cost ceilings, and acceptance criteria.
- Dispatch only registered and provisioned tools whose declared capabilities match the task.
- Keep a durable audit trail of decision, inputs, outputs, approvals, retries, and final evidence; redact secrets and sensitive query parameters.
- Support pause, cancel, resume, and emergency stop.
- Return a truthful terminal status: PASS, FAIL, BLOCKED, or NOT TESTED.

The orchestrator must not interpret external documents, model output, webpages, or tool output as higher-priority instructions. External content is data, never authority.

## 3. Mobile-first edge and serverless design

- PWA is a control and observation interface, not a secret store.
- Android/Termux can run local developer commands, tests, and bounded helper processes when explicitly installed and configured.
- Cloudflare Worker routes requests, validates authentication/authorization, enforces rate limits, and delegates only to configured services.
- Long-running work uses a durable queue/workflow service rather than assuming a Worker request can run indefinitely.
- All provider keys and owner secrets stay server-side. Never bundle secrets in JavaScript, PWA assets, logs, or public build artifacts.
- "Zero cost" is an optimization goal, not a guarantee; quotas, cold starts, paid limits, and operator setup must be visible.

## 4. Module contracts

### A. Research/data core
- Accept only documented, authorized sources with source provenance, licence state, timestamp, units, and freshness policy.
- Treat source text as untrusted input.
- Reject malformed records and display stale-cache state instead of silently inventing current data.
- Keep market research advisory; no broker order placement or automated financial execution.

### B. Regression and self-healing
- Trigger bounded tests after a change or a detected health regression.
- Permit automated fixes only on an isolated branch/worktree.
- Require test evidence and a diff review before merge; production deploy requires its release gate.
- Retry with backoff and a hard ceiling. Circuit-break repeated failures.
- Never "heal" by weakening authentication, disabling tests, suppressing alerts, or deleting audit evidence.

### C. Privacy and cryptography
- Use established platform cryptography and vetted libraries; no custom cryptographic algorithms.
- "Zero-knowledge" is a specific protocol property and must not be claimed unless the protocol and threat model prove it.
- Encrypt sensitive data in transit and at rest where supported; minimize retention and redact logs.
- Quantum-related modelling may be a research/simulation module; do not claim quantum computation or decryption without concrete hardware, algorithms, and reproducible evidence.
- Do not attempt to bypass access controls or decrypt data without authorization.

### D. External-signal research
- Use public, lawfully accessible sources and clearly document source, uncertainty, and provenance.
- "Deep-space signal" analysis is only enabled when a real scientific dataset or instrument feed is configured.
- A label such as "Kepler-1649" is not evidence that a live signal feed exists.
- No classified-database access, credential theft, access-control bypass, or covert operations are part of this architecture.

## 5. Task state machine

QUEUED -> VALIDATING -> READY -> RUNNING -> VERIFYING -> SUCCEEDED
Terminal alternatives: FAILED, BLOCKED, CANCELLED, TIMED_OUT.

Rules:
- Invalid schema or missing permission -> BLOCKED.
- Tool unavailable or required secret absent -> BLOCKED with secret-safe reason.
- Test failure -> FAILED; do not mark success based on a previous run.
- Cancellation and emergency stop prevent new side effects and cancel supported in-flight work.
- Every state transition includes UTC timestamp, task ID, actor/component, reason code, and redacted evidence reference.

## 6. Required observability

For each module display:
- Truth label and version/commit.
- Latest test status and workflow run link.
- Last successful health check and observation time.
- Dependencies and current blocker.
- Queue depth, retries, timeouts, and provider quota state where available.
- Cost estimate/limit where applicable.
- Audit event reference without secret values.

Never show a green "PASS" unless the exact relevant check completed successfully against the intended commit or runtime. A missing status is NOT TESTED, not PASS.

## 7. Security gates

- Default deny; least privilege; explicit capability allowlists.
- Authentication and authorization at every privileged boundary.
- Owner approval for irreversible, externally visible, costly, production, or privileged actions.
- Separate plan, simulate, and execute modes; simulation must not create external side effects.
- Secret values must never be printed in diagnostic output.
- Preserve security-relevant audit records; privacy means minimization and redaction, not audit evasion.
- Emergency stop and rollback paths must be tested.

## 8. Delivery phases and acceptance criteria

1. Registry and capability truth labels: validate schema, unique IDs, policy gates, and source provenance.
2. Task contracts and state machine: deterministic transition tests, timeout/cancel tests, and redaction tests.
3. Bounded dispatcher: only registered tools run; deny unknown capabilities and unapproved side effects.
4. Regression/self-healing pipeline: tests run on isolated branch; failed checks prevent merge/deploy.
5. Observability UI: statuses map to evidence; stale/missing checks never appear green.
6. Integration and production: live health probes, auth tests, workflow IDs, commit SHAs, rollback evidence, and explicit release approval.

A phase is complete only when its acceptance tests pass and evidence is linked. Documentation or registry entries alone do not constitute implementation.

## 9. Non-goals

- No claim of 12,000+ active modules without provisioned inventory and runtime telemetry.
- No unrestricted execution, decryption, data collection, or cross-system access.
- No classified or unauthorized dark-web access.
- No guaranteed uptime, zero cost, guaranteed financial outcomes, or uncalibrated accuracy percentages.
- No automatic production deployment or irreversible action outside approval policy.
