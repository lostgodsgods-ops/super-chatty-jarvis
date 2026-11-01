# REDULTRON CORE 3.0 — Autonomous Engineering Loop Design

**Date:** 2026-11-02  
**Status:** Proposed design for owner review  
**Base commit:** 1b5bf63425173ee56e6161ebf913087e168649dc  
**Scope:** Repository-local learning, diagnostics, tool/module generation, verification, and evidence-backed task selection.

## 1. Goal

Extend the existing Central Agent into a bounded engineering agent that can independently discover work, research trusted technical sources, diagnose repository/runtime issues, propose and implement repository changes in isolated branches, run tests, and preserve verifiable evidence. This is an engineering automation loop, not a claim of AGI, model-weight retraining, or unrestricted production control.

## 2. Existing capabilities to reuse

Do not duplicate existing components. The inspected repository already contains:
- `central-agent/knowledge-learning.mjs`: owner-scoped knowledge ingestion; new submissions are held as `pending_owner_verification`.
- `central-agent/task-queue.mjs` and `central-agent/README.md`: durable, owner-approved read-only knowledge tasks and bounded scheduled processing.
- `central-agent/architecture/goal-lifecycle.mjs`: approved goal plans, bounded step count, allowlisted actions, audit, and lifecycle transitions.
- `central-agent/architecture/tool-forge.mjs`: currently a narrow, owner-approved live-search executor with schema validation, timeout, and D1 audit.
- `central-agent/architecture/universal-tool-registry.mjs`: provider catalog/configuration inventory; it explicitly does not prove live connectivity.
- `central-agent/architecture/platform-module-registry.mjs`: module inventory with production-verification status.
- `central-agent/continuous-improvement.mjs`: bounded audit-only improvement proposals.
- Existing CI runs Node tests, Python Hybrid Core tests, and Central Agent syntax checks.

## 3. Proposed architecture

Build a small set of cooperating, independently testable components around existing interfaces:

1. **Engineering task planner:** selects one bounded task from verified blockers, failed checks, stale evidence, and module-registry next actions. Stable priority, deduplication, max tasks per cycle, and explicit stop conditions.
2. **Source/evidence researcher:** uses existing live-search/provider routing and allowlisted public documentation sources. Stores source URL, title, retrieval time, content hash, relevance rationale, and license/usage notes. Retrieved text is untrusted input, never executable instruction.
3. **Module/tool proposal builder:** checks existing registry first; emits a versioned manifest and code/test plan for missing capability. New tools start disabled and cannot self-register as executable.
4. **Branch-based builder:** creates a feature branch and proposes minimal code/test/documentation changes. No direct writes to main. No arbitrary shell, dynamic imports, arbitrary URL execution, or unrestricted plugin execution.
5. **Verification evaluator:** runs focused tests then the repository CI suite; records exact commands, red/green results when TDD applies, run IDs, commit SHA, and limitations. CI success does not imply production success.
6. **Evidence ledger:** append-only task lifecycle events with source references, code diff/commit, test outcomes, failure codes, approval references, and runtime probe evidence. Secrets, raw credentials, private payloads, and unnecessary personal data are excluded.
7. **Bounded scheduler:** invokes a small number of eligible tasks per scheduled cycle, with concurrency, wall-clock, retry, and resource caps; idempotency, cancellation, stale-task recovery, and emergency stop.

## 4. Autonomy policy — fewer routine restrictions

Autonomous by default for reversible, repository-local work:
- Read repository files, public documentation, test output, and non-secret health metadata.
- Create task proposals, test plans, regression tests, documentation, module manifests, and isolated branches.
- Implement low-risk changes in branches and run tests/CI.
- Update non-production evidence and capability status only when backed by the corresponding test/probe evidence.
- Retry transient read-only operations within fixed limits and choose the next eligible task without asking for routine confirmation.

Approval remains required for:
- Merging to protected branches, changing branch protection or repository permissions.
- Reading, creating, rotating, or synchronizing secrets and credentials.
- Production deployment, D1 migrations or destructive data changes, live external writes, purchases, paid API usage, or expanding access scopes.
- Enabling a newly generated tool that can mutate external state or access private data.
- Changing its own trust level, policy, approval requirements, emergency-stop state, or audit retention.

These gates are separate: permission to create a branch does not imply permission to merge or deploy.

## 5. Lifecycle

`OBSERVE → PRIORITIZE → RESEARCH → PLAN → BUILD IN BRANCH → TEST → SECURITY REVIEW → RECORD EVIDENCE → OPEN/UPDATE PR → SELECT NEXT TASK`

On a failed test, missing dependency, conflicting change, budget cap, expired authorization, or stop signal: mark the task `BLOCKED` or `FAIL`, preserve sanitized evidence, avoid unsafe retries, and continue only with an independent eligible task.

## 6. Initial implementation sequence

**Phase A — Contract and task model**
- Define task states, risk classes, budgets, deduplication key, stop reasons, and evidence schema.
- Add unit tests for transitions, task selection, caps, and fail-closed behavior.

**Phase B — Planner and evidence ledger**
- Reuse the existing D1 binding and audit conventions.
- Add deterministic selection from known blockers and module-registry actions.
- Ensure ledger failure prevents an execution claim.

**Phase C — Tool/module proposal workflow**
- Expand the current Tool Forge through explicit manifests and schema validation.
- Add a generated-module validation path; generated modules remain disabled until reviewed and allowlisted.
- Require license/provenance metadata for external dependencies.

**Phase D — Branch builder and CI feedback**
- Use repository-scoped GitHub operations with least privilege.
- Build only in isolated branches; open draft PRs with evidence summaries.
- Never auto-merge or auto-deploy in this phase.

**Phase E — Bounded scheduler and operations**
- Connect to the existing scheduled improvement cycle only after idempotency, cancellation, stop controls, and audit tests pass.
- Start with one task per cycle and conservative time/retry limits.
- Validate actual scheduled invocation and runtime behavior before reporting active autonomy.

## 7. Acceptance criteria

- Existing tests remain green; each new behavior has a regression test.
- Task selection is deterministic, bounded, deduplicated, and respects cancellation/emergency stop.
- Only approved source types and allowlisted tool contracts can execute.
- New module manifests cannot grant permissions or activate themselves.
- Branch builder cannot write to main, merge, deploy, mutate D1 production data, or access secret values.
- Every task produces an evidence record with a truthful status and stable references.
- A scheduled cycle can be independently observed and correlated with task/audit records.
- Missing D1, failed audit, invalid evidence, or unavailable authorization causes a safe stop.
- Production execution remains separately verified; unit tests and CI are not treated as runtime proof.

## 8. Risks and mitigations

- **Prompt injection in research sources:** treat all retrieved content as untrusted data; no source text may alter policy or invoke tools.
- **Generated unsafe tools:** manifest validation, disabled-by-default state, static checks, sandboxed tests, security review, and explicit activation.
- **Runaway loops/cost:** one task per cycle initially, strict time/retry/size budgets, no paid providers by default, and emergency stop.
- **False learning:** only independently verified evidence can be promoted; caller-asserted test results remain pending.
- **Operational drift:** record source SHA and deployed revision separately; never infer production state from repository CI.
- **Privilege escalation:** the agent cannot edit its own trust policy, approval gates, secrets, or production permissions.

## 9. Out of scope

No unrestricted production access, self-granted permissions, automatic merge/deploy, arbitrary code execution, unrestricted crawler, automatic model-weight training, or claims of sentience/AGI. No changes to production services or data are part of this design document.
