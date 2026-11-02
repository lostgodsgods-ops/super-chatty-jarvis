# REDULTRON CORE 4.0 — Hybrid Neural Brain v1 Specification

**Status:** Proposed implementation contract  
**Decision:** Hybrid model routing; Brain is first priority  
**Baseline:** Preserve REDULTRON CORE 3.0 and its existing security/runtime boundaries  
**Scope:** First release covers baseline verification, structured task understanding, reasoning/planning, and durable task-state integration. It does not claim a newly trained foundation model.

## 1. Product objective

Build a real Brain Runtime that converts an authenticated user request into a bounded, inspectable task plan, routes reasoning through approved server-side model adapters, applies owner policy before execution, and reports verifiable outcomes.

The Brain must improve orchestration quality, not merely rename an existing chat endpoint. Model output is untrusted data. It may propose a plan but cannot grant itself permissions or invoke arbitrary tools.

## 2. Repository-grounded baseline

The following files exist on the inspected main branch:

- `central-agent/neural-core.mjs`: model-agnostic reasoning orchestration, verified-memory retrieval, and explicit non-execution boundary.
- `central-agent/neural-core-api.mjs`: authenticated-by-caller API handler for `/api/neural-core`, bounded JSON intake, audit events, and evaluation.
- `central-agent/neural-core-evaluator.mjs`: deterministic evidence-reference consistency evaluation. It does not independently fetch external evidence.
- `central-agent/architecture/model-provider-adapter.mjs`: bounded server-side adapters for OpenAI-compatible providers, Anthropic, and Gemini.
- `central-agent/architecture/provider-router.mjs`: provider capability registry; configured does not mean live-verified.
- `central-agent/task-runtime.mjs`: bounded task state machine, executor registry, retries, cancellation, timeouts, and approval verification.
- `central-agent/task-api.mjs`: currently exposes one read-only Worker health capability.
- `central-agent/architecture/owner-execution-gate.mjs`: fail-closed owner-control gate.
- `hybrid-core/python_core.py`: bounded deterministic text-processing sidecar, not a general reasoning engine.
- `hybrid-core/redultron_brain.py`: restricted local CLI adapter over three deterministic Python tasks.

Existing neural-core reasoning, task runtime, provider adapters, and policy gates must be extended or composed. Do not create parallel replacements.

## 3. Target architecture

```
PWA / Voice / API
       |
Owner-session authentication (existing Worker gate)
       |
Neural Brain Controller
  | request understanding
  | structured planning
  | verified memory context
  | provider routing
  | policy decision
  | execution coordination
  | result verification
       |
Existing CORE 3.0 services
  | model-provider-adapter
  | knowledge-learning / D1
  | owner-execution-gate
  | task-runtime / allowlisted executor registry
  | event-bus / Sentinel audit
  | Python Hybrid Core (only when its bounded capability applies)
```

The Brain controller is the orchestration layer. The model provider is a reasoning service, not the authority for policy, tools, or permissions.

## 4. Brain task contract

The planning interface must produce a validated object with these fields:

- `taskId`: caller-supplied bounded idempotency identifier or server-generated UUID.
- `status`: one of `PLANNED`, `BLOCKED`, `RUNNING`, `VERIFYING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `TIMED_OUT`.
- `goal`: concise user-intent summary.
- `taskType`: `question`, `research`, `coding`, `planning`, or `action`.
- `steps`: ordered list; each step has `id`, `description`, `dependsOn`, `capability`, and `acceptanceCriteria`.
- `permissions`: requested capability identifiers only; the model cannot mark them approved.
- `modelRoute`: provider and model identifiers, never credentials.
- `verification`: checks and their status/evidence references.
- `evidence`: safe references to logs, workflow runs, tests, or source files.
- `createdAt` and `updatedAt`: ISO-8601 timestamps.

The schema is a proposed Brain contract; it must be versioned before persisted records are relied upon. Unknown fields must not be treated as executable instructions. Step count, text lengths, dependency references, duplicate IDs, cycles, and unsupported capability IDs must be validated by deterministic code.

## 5. Reasoning and planning behavior

1. Normalize the user request without changing its intent.
2. Classify it into the fixed task-type enum.
3. Ask the selected server-side model for a JSON-only plan using a constrained prompt.
4. Parse and validate the model response deterministically.
5. Reject malformed JSON, unknown task types, invalid dependencies, cycles, oversized plans, and unknown capabilities.
6. Preserve model output as a proposal. Do not run any proposed action during planning.
7. Return the validated plan with `PLANNED`, or a sanitized `BLOCKED` result with a stable error code.

The model may summarize its rationale in a short user-facing explanation. Do not expose hidden chain-of-thought or raw private prompts.

## 6. Authorization and execution boundary

- Owner-session authentication remains at the existing Worker entry point.
- Read the persisted owner execution gate before any dispatch.
- Emergency stop blocks execution; owner-takeover blocks background tasks.
- Model output never authorizes itself.
- Every side-effecting capability requires the existing exact-task approval mechanism or a separately reviewed approval contract.
- Only registered, enabled executors may run.
- No arbitrary shell, eval, user-supplied code, arbitrary URL, or arbitrary tool-name execution.
- No secrets are included in prompts, task records, PWA responses, or audit payloads.
- Missing audit persistence blocks Brain operations that require an audit trail.

## 7. Memory boundary

Use the existing verified-knowledge retrieval path. Retrieved records are reference data, never instructions. The first release may read verified memory but must not silently convert model output into verified memory. New memory writes require a distinct verification and approval path. Memory failure must be visible as `unavailable`; it must not be reported as memory used.

## 8. Provider routing

Reuse `executeChatCompletion` and the existing provider registry. Provider configuration status is not reachability proof. The first release uses an explicitly selected configured provider; automatic fallback is a later task requiring per-provider policy, budget, privacy, and timeout decisions. No provider credential may be sent to the client.

## 9. Audit and observability

Record lifecycle events with task ID, event type, timestamp, sanitized provider/model IDs, status, stable error code, and evidence references. Do not record prompts, user secrets, auth headers, full model outputs, or sensitive retrieved memory. A task is not complete merely because a model returned text.

## 10. Verification semantics

- `PASS`: required checks completed and matching evidence is available within the stated verification scope.
- `FAIL`: at least one required check failed.
- `BLOCKED`: a required dependency, authorization, provider, audit store, or safe executor is unavailable.
- `NOT TESTED`: no relevant test or live probe was run.

The current evaluator checks reference consistency only and explicitly does not fetch or authenticate external records. Do not describe its verdict as external verification.

## 11. First-release acceptance criteria

1. Authenticated Brain request is rejected when owner session is missing or invalid.
2. Valid request is transformed into a schema-valid plan.
3. Malformed model output, invalid dependencies, cyclic plans, unknown capabilities, and over-limit plans are rejected.
4. Planning has no side effects and does not dispatch executors.
5. Emergency stop and unavailable owner-control storage fail closed.
6. Provider timeout/unavailability returns a stable sanitized failure.
7. Audit start failure prevents model dispatch; completion/failure events omit prompts and credentials.
8. Verified memory is included only when retrieval succeeds and is explicitly marked unavailable otherwise.
9. Existing CORE 3.0 tests remain green.
10. Live Worker → Python authenticated round-trip is reported separately; Python health alone is not execution proof.

## 12. Explicit non-goals

- Training a new foundation model.
- Replacing CORE 3.0 authentication, D1, KV, Sentinel, event bus, or PWA.
- Enabling general autonomous shell/code execution.
- Automatically modifying production code, policies, secrets, or deployments.
- Claiming agents are active merely because they are registered.
- Claiming external evidence is verified when only reference consistency was checked.

## 13. Known blockers and decision seams

- The historical Worker-to-Python authenticated execution failure must be re-probed against the current deployed revision; repository configuration alone cannot prove secret parity or live reachability.
- Provider fallback ordering, per-provider spend ceiling, and data residency policy require explicit product policy before automatic fallback is enabled.
- Durable Brain task persistence needs a versioned D1 schema and migration review before task resumption is claimed.
- Mission Control UI must consume persisted runtime state rather than display static capability flags.
