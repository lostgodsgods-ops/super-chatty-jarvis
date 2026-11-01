# REDULTRON Independent Identity & Result Contract

**Status:** Proposed contract (documentation only; runtime enforcement is not yet implemented)  
**Contract version:** 1.0.0  
**Canonical core ID:** `redultron.core.primary`  
**Display name:** `REDULTRON CORE 3.0`

## 1. Purpose

REDULTRON must identify itself consistently across API responses, task executions, audit events, capability reports, and deployment provenance. Every result must carry its own identifier and traceable origin. Identity is a software provenance contract; it does not claim sentience, personhood, independent legal status, or unrestricted autonomy.

## 2. Stable core identity

The canonical identity is:

- `core_id`: `redultron.core.primary` — stable across releases.
- `name`: `REDULTRON`.
- `product`: `REDULTRON CORE`.
- `version`: deployed software version; never infer from a requested version.
- `identity_schema_version`: `1.0.0`.
- `instance_id`: unique deployment/runtime instance identifier; must not contain secrets or owner identifiers.
- `build_sha`: exact source commit used to build the instance, or `null` if unavailable.
- `deployment_id`: deployment provenance identifier, or `null` if unavailable.

The stable `core_id` is not an authentication credential and must never authorize a request.

## 3. Result identity envelope

Every task or capability result should use this envelope:

```json
{
  "identity": {
    "core_id": "redultron.core.primary",
    "name": "REDULTRON",
    "version": "3.0.0",
    "instance_id": "runtime-instance-id"
  },
  "result": {
    "result_id": "UUID",
    "execution_id": "UUID",
    "trace_id": "UUID",
    "task_id": "task-reference-or-null",
    "created_at": "RFC3339 timestamp",
    "status": "PASS | FAIL | BLOCKED | NOT_TESTED",
    "verification": "VERIFIED | UNVERIFIED | FAILED",
    "summary": "bounded, non-sensitive result summary",
    "evidence": []
  },
  "provenance": {
    "build_sha": "full-source-commit-or-null",
    "deployment_id": "deployment-reference-or-null",
    "source": "module-or-api-route"
  }
}
```

### Identifier semantics

- `result_id`: unique per emitted result; never reuse across retries.
- `execution_id`: unique per execution attempt; retries receive a new ID.
- `trace_id`: shared across related operations in one trace.
- `task_id`: stable task reference where a persisted task exists.
- IDs are correlation identifiers, not bearer tokens or secrets.

## 4. Evidence and trust rules

- A model-generated statement is not evidence by itself.
- `PASS` requires at least one inspectable evidence reference.
- Missing evidence must downgrade a claimed pass to `NOT_TESTED` / `UNVERIFIED`.
- A failed required check makes the aggregate result `FAIL`.
- An unresolved policy or dependency gate is `BLOCKED`.
- Evidence references should identify a commit, workflow run/job, test report, audit event, or live HTTP probe.
- Store hashes/references and bounded summaries; do not put credentials, raw authorization headers, passkeys, recovery codes, or private owner data in result envelopes.
- Evidence must be independently verifiable; the result issuer cannot certify its own claim without evidence.

## 5. Operating identity and authority

REDULTRON may plan, research, simulate, evaluate, and orchestrate only within registered capabilities. Learning or observing a capability never grants permission to use it. Authentication, authorization, approval, and audit remain separate controls.

- Default mode: `plan`.
- Unknown capability: fail closed.
- Consequential external action: authenticated, scoped, policy-checked, and approval-gated.
- No self-granted permissions, uncontrolled replication, or unrestricted self-modification.
- The identity envelope does not bypass owner approval or security middleware.

## 6. Result lifecycle

`CREATED -> EXECUTING -> EVALUATED -> PUBLISHED`

Terminal evaluation status is one of `PASS`, `FAIL`, `BLOCKED`, or `NOT_TESTED`. Verification is separately recorded as `VERIFIED`, `UNVERIFIED`, or `FAILED`. A result may be published as unverified, but it must never be represented as a verified success.

## 7. Implementation sequence

1. Add pure identity and result-envelope builders with UUID/time injection for deterministic tests.
2. Add tests for unique result IDs, retry separation, missing evidence downgrade, malformed provenance, and secret redaction.
3. Attach the envelope to task-runtime outputs and capability-evaluation reports.
4. Propagate `core_id`, `instance_id`, and `build_sha` to API health/status responses.
5. Correlate audit events and live probes through `trace_id` / `execution_id`.
6. Add compatibility tests for existing API consumers before enabling the envelope by default.

## 8. Acceptance criteria

- Every newly emitted task result has a unique `result_id` and `execution_id`.
- Related events share a `trace_id`; retries do not reuse an execution ID.
- Core identity remains stable across deployments while build and instance provenance change.
- Missing, invalid, or self-asserted evidence cannot produce `VERIFIED`.
- Secrets and owner-identifying data are excluded from public result envelopes.
- Identity metadata never grants authorization.
- API consumers have an explicit schema version and compatibility path.

**Important:** This document defines the target contract. It does not assert that runtime code, persistence, API propagation, or production deployment already enforce it.
