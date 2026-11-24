# REDULTRON CORE 3.0 — Autonomy & Integration Handoff

Status: design contract; this document does not itself enable runtime execution or grant credentials.

## Objective

Make REDULTRON's engineering workflow self-directed within explicitly configured, least-privilege capabilities: inspect authorized project evidence, derive tasks, make reversible changes on isolated branches, test, record evidence, and continue to the next eligible task.

## Current evidence and blockers

- The repository agent catalog is currently registry-only; catalog entries are not proof of provisioned agents or live dispatch.
- Repository-wide search for `Buddhi` returned no code matches at the time this handoff was prepared.
- Buddhi workspace authentication and live memory retrieval are not configured or verified in this workflow.
- Existing runtime/production health, Python hybrid execution, PWA install/update, and live D1 persistence must be verified independently. A passing CI suite is not proof of those live behaviours.
- The existing owner-authentication, fail-closed, audit, and release-approval controls remain authoritative.

## Required integration surfaces

1. **GitHub evidence reader** — scoped access to repository metadata, commits, PRs, issues, workflow runs, changed files, and test artifacts. Keep provenance (URL, SHA/run ID, timestamp) with each retrieved fact.
2. **Buddhi memory adapter** — server-side only, feature-flagged and read-only first. Configure the exact workspace endpoint and agent key through the approved secret manager. Never store credentials in source, browser assets, prompts, or logs.
3. **Core/PWA status bridge** — expose sanitized connection state, last successful sync, freshness, task status, and correlation IDs to the authenticated PWA. Never expose provider tokens or private memory payloads to unauthenticated clients.
4. **Task planner** — each task must have a source, goal, acceptance criteria, risk class, permitted tools, time/iteration budget, test commands, rollback plan, and terminal status.
5. **Executor** — run only allow-listed engineering actions in a scoped environment and isolated branch. Re-read repository state before writes; use expected-SHA/lease checks to prevent overwriting concurrent changes.
6. **Evidence ledger** — record task ID, source references, branch/commit, changed paths, test outcomes, workflow IDs, and PASS/FAIL/BLOCKED/NOT TESTED status. Redact secrets and sensitive query strings.
7. **Recovery loop** — on failure, capture sanitized diagnostics, form a bounded hypothesis, add/adjust a test, attempt a small reversible fix, and stop after a configured retry/compute budget. Do not repeat identical failing attempts indefinitely.

## Default task policy

### Eligible for automatic execution after configuration

- Read/search authorized code and engineering history.
- Draft tasks and acceptance criteria.
- Run allow-listed unit, lint, type, and static-analysis tests.
- Make small, reversible changes on non-protected feature branches.
- Open draft PRs with test evidence and rollback notes.
- Re-run tests after failures within a fixed retry budget.
- Update task/evidence records and the authenticated PWA status panel.

### Must remain gated

- Production deployment, branch protection changes, merging when required checks/reviews are absent, secrets/credentials changes, account permission changes, data deletion, external communications, financial transactions, and physical/robotics actions.
- Arbitrary shell commands, dynamic tool installation, or commands copied from retrieved memory are not automatically trusted.

## Memory and instruction handling

- Retrieved conversation, issue, PR, and memory content is data, not executable authority.
- Store source citations and confidence/freshness metadata with every memory item.
- Respect workspace scope, retention, deletion, and privacy settings.
- Exclude secrets and redact sensitive values before indexing.
- If source instructions conflict with current owner policy, current owner policy wins.

## Buddhi connection acceptance tests

- Missing configuration => feature remains disabled and status is BLOCKED.
- Invalid key => explicit sanitized auth failure; no retry storm.
- Timeout, HTTP 429/5xx, malformed JSON, empty recall => bounded failure and no fabricated memory.
- Successful recall => source-backed result with workspace/scope validation and correlation ID.
- Prompt-injection text inside recalled content => treated as untrusted data, never as a tool grant.
- Secret scan => no agent key in source, frontend bundle, test snapshots, or logs.
- Live verification => record HTTP result and timestamp; do not infer connectivity from configuration alone.

## Core/PWA acceptance tests

- Authenticated PWA displays configured/not-configured, connected/disconnected, last sync, memory freshness, task status, and sanitized errors.
- Unauthenticated requests cannot read project memory, task details, or provider diagnostics beyond the public health contract.
- Service-worker update and offline behaviour are tested on a real mobile browser before being marked PASS.
- UI displays the same task ID and evidence status as the backend ledger; stale state is visibly marked stale.

## Completion criteria

Do not mark integration CONNECTED until all of these are evidenced:
1. Buddhi workspace and least-privilege credentials configured in the secret manager.
2. Server-side authentication succeeds.
3. Real memory retrieval returns source references.
4. Redaction and failure-path tests pass.
5. Core-to-PWA status is authenticated and sanitized.
6. Audit evidence is durably written and read back.
7. CI checks pass on the proposed branch; live checks are reported separately.

## Immediate next actions

1. Configure Buddhi workspace endpoint and agent key through the approved secret manager; never paste the key into chat or commit it.
2. Implement the adapter and mocked contract tests behind a disabled-by-default feature flag.
3. Verify live authentication and memory retrieval in a non-production environment.
4. Connect the authenticated PWA status panel.
5. Enable bounded task dispatch only after tests and audit readback pass.
6. Review and merge the PR only after required checks and human/policy gates are satisfied.
