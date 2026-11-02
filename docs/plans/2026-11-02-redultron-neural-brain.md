# REDULTRON Neural Brain v1 Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing REDULTRON Neural Core into a validated, non-executing task planner while preserving CORE 3.0 security and runtime behavior.

**Architecture:** Compose the existing `neural-core.mjs`, model provider adapter, task runtime, owner execution gate, D1/event bus and verified-memory service. Add a deterministic planning contract and a plan-only API operation; execution remains a separate, approval-gated workflow.

**Tech Stack:** Cloudflare Workers JavaScript modules, Node.js built-in test runner, D1, existing provider adapters, Python sidecar only for its current bounded transforms.

## Global Constraints

- Preserve CORE 3.0 routes, authentication, D1/KV bindings, Sentinel, PWA, and existing task APIs.
- Owner-session authentication remains enforced by the Worker before protected handlers.
- Model output is untrusted; deterministic code validates every plan field.
- Planning must not execute tools or cause infrastructure mutations.
- Never expose secrets, auth headers, private prompts, or raw memory records in public responses or audit logs.
- Fail closed when required audit or owner-control storage is unavailable.
- Do not describe provider configuration as live reachability.
- Do not describe evaluator reference checks as external evidence verification.
- Keep the Python sidecar bounded; do not add arbitrary code execution.
- Use TDD for every behavior change and run focused tests before the full `npm test` suite.

---

### Task 1: Add deterministic Brain plan contract

**Files:**
- Create: `central-agent/brain-plan.mjs`
- Create: `central-agent/brain-plan.test.mjs`
- Reference: `central-agent/neural-core.mjs`
- Reference: `central-agent/task-runtime.mjs`

**Interfaces:**
- Produces: `normalizeBrainPlan(input, options = {})` returning a validated plan object.
- Produces: `BrainPlanError(code, status = 400)`.
- Consumes: plain JSON-like model proposal; no environment bindings or network access.

- [ ] **Step 1: Add focused failing tests**

Cover: valid one-step and multi-step plans; duplicate step IDs; unknown task type; missing goal; empty steps; step-count limit; unknown capability; self-dependency; missing dependency; cyclic dependency; duplicate dependencies; invalid field types; oversized descriptions; prompt-injected extra fields ignored; deterministic timestamp/id injection via options.

Assert normalized output contains only contract fields and starts in `PLANNED`; invalid inputs throw stable error codes.

- [ ] **Step 2: Verify relevant failure**

Run: `node --test central-agent/brain-plan.test.mjs`

Expected: module import fails because `brain-plan.mjs` does not exist.

- [ ] **Step 3: Implement minimum behavior**

Implement a pure validator with fixed enums and conservative bounds: 1–12 steps, 1–8 acceptance criteria per step, 1–8 dependencies per step, bounded text fields, unique step IDs, valid dependency references, no self-dependencies, and cycle detection using deterministic topological traversal. These are implementation limits, not model instructions. Allow only capabilities supplied in a trusted `allowedCapabilities` option; default to an empty allowlist. Model-provided permissions are requests only and normalize to unapproved.

- [ ] **Step 4: Verify focused pass**

Run: `node --test central-agent/brain-plan.test.mjs`

Expected: all plan-contract tests pass, with no network or environment access.

- [ ] **Step 5: Run affected integration check**

Run: `npm test`

Expected: all existing Node tests and new plan tests pass.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add central-agent/brain-plan.mjs central-agent/brain-plan.test.mjs
git commit -m "feat: add validated neural brain plan contract"
```

### Task 2: Add model-backed plan generation to Neural Core

**Files:**
- Modify: `central-agent/neural-core.mjs`
- Modify: `central-agent/neural-core.test.mjs`
- Consume: `central-agent/brain-plan.mjs`
- Consume: `central-agent/architecture/model-provider-adapter.mjs`

**Interfaces:**
- Add: `createNeuralCore(options).plan(input, runtimeEnv)`.
- Input: `{ goal, provider, model?, memoryQuery?, maxTokens? }`.
- Output: `{ ok, plan, provider, memory, execution: { toolsExecuted: false, infrastructureChanged: false } }`.

- [ ] **Step 1: Add focused failing tests**

Test valid JSON model plan normalizes to PLANNED; malformed JSON returns `NEURAL_CORE_INVALID_PLAN_RESPONSE`; unknown capability is rejected; provider failure propagates sanitized provider error; memory is marked available only when verified records were retrieved; plan operation never calls any executor or mutates environment; prompt and model output are not returned in audit metadata.

- [ ] **Step 2: Verify relevant failure**

Run: `node --test central-agent/neural-core.test.mjs`

Expected: `core.plan is not a function`.

- [ ] **Step 3: Implement minimum behavior**

Reuse the existing completion adapter. Construct a bounded JSON-only planning prompt that labels user content and retrieved memory as untrusted data. Parse exactly one JSON object; reject Markdown fences, trailing text, malformed JSON, and oversized responses. Pass trusted capability allowlist from server code, never from model input. Keep `reason()` backward-compatible.

- [ ] **Step 4: Verify focused pass**

Run: `node --test central-agent/neural-core.test.mjs`

Expected: all existing reasoning tests and new planning tests pass.

- [ ] **Step 5: Run affected integration check**

Run: `npm test`

Expected: all Node tests pass; existing `/api/neural-core` response behavior remains compatible.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add central-agent/neural-core.mjs central-agent/neural-core.test.mjs
git commit -m "feat: add structured planning to neural core"
```

### Task 3: Expose authenticated plan-only API operation with audit

**Files:**
- Modify: `central-agent/neural-core-api.mjs`
- Modify: `central-agent/neural-core-api.test.mjs`
- Reference: `central-agent/worker.mjs` existing owner-session gate and route dispatch.

**Interfaces:**
- Preserve: `GET /api/neural-core` status and current `POST /api/neural-core` reasoning contract.
- Add request discriminator: `operation: "plan"`.
- Add response: validated plan, sanitized provider/model identifiers, memory status, and `execution.toolsExecuted=false`.

- [ ] **Step 1: Add focused failing tests**

Test plan operation emits requested/completed audit events; audit-start failure prevents provider dispatch; provider failure emits sanitized failure event; malformed plan returns stable 4xx/5xx; audit payload contains no prompt or secret; unsupported operation is rejected; existing reason POST tests remain unchanged.

- [ ] **Step 2: Verify relevant failure**

Run: `node --test central-agent/neural-core-api.test.mjs`

Expected: plan operation is not handled and returns current reasoning behavior or validation failure.

- [ ] **Step 3: Implement minimum behavior**

Dispatch only the exact `operation: "plan"` discriminator to `core.plan()`; preserve existing requests without an operation as reasoning for compatibility. Keep the current owner-session gate in the Worker. Require audit storage before model dispatch and after plan completion. Do not dispatch task steps from this API.

- [ ] **Step 4: Verify focused pass**

Run: `node --test central-agent/neural-core-api.test.mjs`

Expected: plan API and legacy API tests pass.

- [ ] **Step 5: Run affected integration check**

Run: `npm test`

Expected: all Node tests pass.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add central-agent/neural-core-api.mjs central-agent/neural-core-api.test.mjs
git commit -m "feat: expose audited neural plan operation"
```

### Task 4: Persist Brain task plans and lifecycle evidence

**Files:**
- Create: `migrations/00XX_neural_brain_tasks.sql` (choose next unused migration number after inspecting migration directory)
- Create: `central-agent/brain-task-store.mjs`
- Create: `central-agent/brain-task-store.test.mjs`
- Reference: `central-agent/event-bus.mjs`, `central-agent/task-runtime.mjs`

**Interfaces:**
- Add: `createBrainTaskStore(db)` with `create(plan)`, `get(taskId)`, and `transition(taskId, nextStatus, evidence)`.
- Persistence stores normalized plans and lifecycle metadata; no prompts, provider credentials, or raw retrieved memory.

- [ ] **Step 1: Add focused failing tests**

Test task create/read round trip; duplicate task ID conflict; invalid status transition rejected; concurrent transition conflict; invalid evidence reference rejected; missing D1 binding returns storage unavailable; persisted record excludes prompt and secret fields.

- [ ] **Step 2: Verify relevant failure**

Run: `node --test central-agent/brain-task-store.test.mjs`

Expected: module import fails because store module does not exist.

- [ ] **Step 3: Implement minimum behavior**

Inspect migration numbering first and select the next unused numeric prefix. Create a versioned table with task ID primary key, schema version, status, goal, task type, plan JSON, provider/model IDs, timestamps, and bounded error code. Add an append-only task event table. Use optimistic status transitions and atomic D1 batch writes. Do not add automatic execution or resume behavior in this task.

- [ ] **Step 4: Verify focused pass**

Run: `node --test central-agent/brain-task-store.test.mjs`

Expected: all storage contract tests pass against the repository's D1 fake or local test fixture.

- [ ] **Step 5: Run affected integration check**

Run: `npm test`

Expected: all Node tests pass; migration syntax validation uses the repository's existing migration check.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add migrations central-agent/brain-task-store.mjs central-agent/brain-task-store.test.mjs
git commit -m "feat: persist neural brain task plans"
```

### Task 5: Connect owner policy and task runtime without enabling autonomous side effects

**Files:**
- Create: `central-agent/brain-coordinator.mjs`
- Create: `central-agent/brain-coordinator.test.mjs`
- Modify: `central-agent/neural-core-api.mjs` only if coordinator endpoint is required.
- Consume: `central-agent/architecture/owner-execution-gate.mjs`, `central-agent/task-runtime.mjs`, `central-agent/brain-task-store.mjs`.

**Interfaces:**
- Add: `coordinateBrainPlan(plan, dependencies)`.
- Output: `PLANNED` or `BLOCKED`; first release does not execute side-effecting steps.

- [ ] **Step 1: Add focused failing tests**

Test missing owner-control DB blocks coordination; emergency stop blocks; owner takeover blocks background execution; unknown capability blocks; plan-only task remains PLANNED; no executor is invoked; missing audit writer blocks; exact plan task ID is preserved.

- [ ] **Step 2: Verify relevant failure**

Run: `node --test central-agent/brain-coordinator.test.mjs`

Expected: module import fails because coordinator does not exist.

- [ ] **Step 3: Implement minimum behavior**

Compose existing gate and task store. The coordinator may mark a plan ready for a separately approved executor only after capability and owner policy checks. It must not execute task steps in this release. Any owner-control storage error returns BLOCKED.

- [ ] **Step 4: Verify focused pass**

Run: `node --test central-agent/brain-coordinator.test.mjs`

Expected: all authorization and no-side-effect tests pass.

- [ ] **Step 5: Run affected integration check**

Run: `npm test`

Expected: all Node tests pass.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add central-agent/brain-coordinator.mjs central-agent/brain-coordinator.test.mjs central-agent/neural-core-api.mjs
git commit -m "feat: coordinate neural plans through owner policy"
```

### Task 6: Runtime and production verification

**Files:**
- Modify: relevant existing GitHub Actions workflow only after inspecting its current Python/Node test jobs.
- Create: `docs/reports/neural-brain-v1-verification.md`

**Interfaces:**
- CI evidence: workflow run URL, commit SHA, job result, exact test counts.
- Live evidence: Worker API HTTP status, sanitized response, request ID, deployment revision; Python authenticated round-trip separately.

- [ ] **Step 1: Add verification coverage**

Add CI checks for `npm test`, Python sidecar unit tests, and any existing migration validation command. Do not expose secrets in test output.

- [ ] **Step 2: Verify relevant failure**

Run focused tests and confirm the new test job fails if the Brain tests are intentionally broken in a temporary local change.

- [ ] **Step 3: Implement CI verification**

Use existing workflow conventions; avoid duplicate workflows. Keep production secrets out of CI unless a separately authorized staging secret exists.

- [ ] **Step 4: Verify focused pass**

Run: `npm test` and `python -m unittest discover -s hybrid-core -p 'test_*.py' -v`.

Expected: all Node and Python tests pass; Java bridge tests may skip only when Java toolchain is unavailable.

- [ ] **Step 5: Verify deployed runtime**

With a valid owner session, test plan-only request; then test missing/invalid session rejection. Record exact HTTP statuses and request IDs. Separately probe authenticated Worker → Python execution. If no authorized test session or matching secret is available, mark live probe NOT TESTED or BLOCKED, never PASS.

- [ ] **Step 6: Commit verification record**

```bash
git add docs/reports/neural-brain-v1-verification.md .github/workflows
git commit -m "test: verify neural brain v1 integration"
```

## Unresolved product decisions

1. Provider fallback order, per-provider spend cap, and data-residency restrictions must be decided before automatic fallback is enabled.
2. User-facing plan confirmation UX (approve, edit, or reject) must be agreed before any side-effecting task can be dispatched.
3. Task retention period and deletion policy must be set before long-term task history is exposed in Mission Control.
