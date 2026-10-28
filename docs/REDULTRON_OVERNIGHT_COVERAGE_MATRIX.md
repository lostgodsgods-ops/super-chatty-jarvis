# REDULTRON CORE 3.0 — Overnight Coverage Matrix

**Snapshot:** 2026-10-29T03:20:10+05:30  
**Repository:** `lostgodsgods-ops/super-chatty-jarvis`  
**Branch:** `main`  
**Commit SHA:** `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`  
**Purpose:** Evidence-indexed inventory. This is a point-in-time snapshot, not proof that every module is operational.

## 1. Coverage totals

| Inventory | Count |
|---|---:|
| Tracked repository files in Git tree | 195 |
| Central Agent files | 95 |
| GitHub Actions workflows | 14 |
| Test/spec files or files under `tests/` | 73 |
| Python Core files | 7 |
| PHP Core files | 4 |
| PWA assets | 9 |
| Documentation files | 19 |
| Integration registry entries | 14 |
| Tool functions visible in ChatGPT catalog | 15511 |
| Tool namespaces with at least one function | 714 |

The machine-readable inventory in `docs/overnight-coverage-matrix.json` contains one row per tracked file at the snapshot SHA, every workflow, all registry integrations, every visible tool namespace and primary public sources. Purposes not individually inspected are explicitly marked as inferred from path/name.

## 2. Runtime evidence and blockers

| Component | Status | Evidence | Blocker / next step |
|---|---|---|---|
| Main CI | NOT TESTED | No CI run found on exact main SHA `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`; PR #803 CI [40767091631](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091631) passed on separate head `1fedc8dca472b47b2b03350184f4899bd5eb84ad`. | Do not treat PR-head checks as proof that current main or production is green. |
| Static checks | NOT TESTED | No run tied to exact main SHA; PR #803 Static site checks [40767091667](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091667) passed on its separate head. | Live PWA routing and installability remain unverified. |
| Central Agent tests | NOT TESTED | No run tied to exact main SHA; PR #803 Central Agent tests [40767091652](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091652) passed on its separate head. | Mock tests do not prove live D1 persistence or authenticated Python execution. |
| Release package | FAIL | Current-main SHA `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`: run [40772544482](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40772544482) failed; three earlier runs on the same SHA also failed. | Failure cause not established; job list returned zero jobs and no artifacts were available. |
| Failure Sentinel | NOT TESTED | Current-main sampled runs [40773676027](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40773676027) and [40773672706](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40773672706) had skipped jobs. | Skipped jobs alone do not prove retry suppression; controlled duplicate-event replay remains NOT TESTED. |
| Main branch protection | FAIL | GET branch reports `protected=false`; protection endpoint returns HTTP 403 `Resource not accessible by integration`. | Owner/admin must configure required review/status checks; no settings were changed. |
| Cloudflare Worker provenance | FAIL — last observed SHA drift | Last recorded deployment `1947abf4-39b2-4be0-880d-8bfbabb60294`, version 882, SHA `a0d6087dedb7a29aaa07c9302167ddbda5b352da`; last checked 2026-10-29 01:51 IST. | No current live probe succeeded; do not deploy without the guarded approval workflow. |
| Render Python Core | FAIL — last observed SHA drift | Last recorded live deployment `dep-dbh59ga9lscs73e2d38g`, SHA `55de9ebdb7a753cb700e2411a7e8852dd9853866`; last checked 2026-10-29 01:51 IST. | Render service inventory was blocked by workspace-selection rules; no secret values read or changed. |
| Authenticated hybrid execution | FAIL — previous evidence; not re-tested | Last recorded probe HTTP 502 `HYBRID_CORE_AUTH_REJECTED_401`; PR #803 adds whitespace/line-break fail-closed preflight with passing branch CI. | Exact production secret parity/root cause remains unconfirmed; no live authenticated probe was performed. |
| D1 owner-auth DB | PASS — read-only query | Read-only query HTTP 200 at 2026-10-29 02:11:55 IST; 26 tables; `capability_requests` and `verified_knowledge` absent; zero rows written. | No authenticated staging/production create→persist→readback round-trip; lazy schema creation means table absence alone is not a defect. |
| Capability request queue | BLOCKED — live persistence not verified | PR #763 merged at `5705cab8611c50ce2b27adddd550adaff0af19d2`; D1-mock persistence and sanitized-error tests passed in prior CI. | Owner-authenticated staging/production POST→D1→GET not tested; requests remain `pending_owner_review`. |
| Persistent Learning Engine | PASS — repository checks; NOT TESTED live | PR #774 merged; current main is `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`; last observed Worker SHA predates the learning route. | Live route authorization, `verified_knowledge` D1 persistence and evidence validation remain NOT TESTED. |
| Live Search | NOT TESTED | Repository mode is `open-source-first`; code declares 5-second timeout and 24-hour stale-cache TTL; last known health metadata says `searchProviderReachabilityChecked=false`. | Live provider reachability, freshness and fallback are not verified in this run. |
| PWA install/update | BLOCKED — live verification not completed | Repository cache `redultron-core-shell-v18-core-3`; manifest and service worker are present; current-main release-package workflow failed. | Live served asset version, MIME types, offline behavior and Android Chrome install/update remain NOT TESTED. |
| Agent Relay | BLOCKED | CodeAgent Mobile had no online sessions; JackHamr balance `-11.737204 USD` is exhausted; Agent Swarm has zero linked swarms. | No new agent was started; visible catalog entries do not imply runtime access. |
| Consensus research agent | BLOCKED | Browser Use returned insufficient credits; KERNEL connection-context call required user input in non-interactive mode. Public-source research was performed directly. | No agent result is claimed; live endpoint verification remains NOT TESTED. |

No secrets were read or changed. No production writes, deployment, merge or financial action was performed.

## 3. Workflow-by-workflow matrix

| Workflow | Purpose | Status on snapshot SHA | Evidence | Blocker / next action |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | Node/Python tests and syntax | NOT TESTED | No run on exact main SHA; PR #803 CI [40767091631](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091631) passed on separate head. | Current-main result not established. |
| `.github/workflows/deploy-central-agent.yml` | Central Agent deploy | NOT TESTED | No run on exact main SHA observed. | Guarded production deploy was not dispatched. |
| `.github/workflows/deploy-cloudflare.yml` | Cloudflare Worker deploy | NOT TESTED | No run on exact main SHA observed. | No production deployment was performed. |
| `.github/workflows/deploy-nexus-pwa.yml` | PWA/static asset deploy | NOT TESTED | No run on exact main SHA observed. | Live PWA endpoint and Android install/update not verified. |
| `.github/workflows/integration-registry.yml` | Integration registry contract | NOT TESTED | No run on exact main SHA observed. | Registry visibility does not prove runtime integration. |
| `.github/workflows/monitor-central-agent.yml` | Scheduled live health/search/auth/queue probes | NOT TESTED | No run on exact main SHA observed. | No new live probe was completed. |
| `.github/workflows/php-core.yml` | PHP sidecar checks | NOT TESTED | No run on exact main SHA observed. | PHP Core runtime not probed. |
| `.github/workflows/redultron-failure-sentinel.yml` | Bounded retry/incident handling | NOT TESTED | Current-main runs [40773676027](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40773676027) and [40773672706](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40773672706) had skipped jobs. | Need controlled duplicate-event replay and reason-level logs. |
| `.github/workflows/redultron-live-probe.yml` | Strict authenticated hybrid certification | NOT TESTED | No run on exact main SHA observed. | Live Python execution HTTP 200 not verified. |
| `.github/workflows/redultron-provenance-deploy.yml` | Provenance/deployment verification | NOT TESTED | No run on exact main SHA observed. | Explicit production authorization gate was preserved. |
| `.github/workflows/redultron-release-package.yml` | Release package generation | FAIL | Current-main run [40772544482](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40772544482) failed; earlier same-SHA failures: 40771842906, 40770973337, 40770648736. | Failure cause not established; jobs/artifacts unavailable from the connector response. |
| `.github/workflows/static-site-checks.yml` | Static/PWA contracts | NOT TESTED | No run on exact main SHA; PR #803 Static checks [40767091667](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091667) passed on its branch. | Live PWA behavior not proven. |
| `.github/workflows/test-central-agent.yml` | Central Agent tests | NOT TESTED | No run on exact main SHA; PR #803 Central Agent tests [40767091652](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091652) passed on its branch. | Mock tests do not prove live D1 persistence. |
| `.github/workflows/test-hybrid-core.yml` | Hybrid Core tests | NOT TESTED | No dedicated run on exact main SHA observed; PR #803 CI [40767091631](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091631) passed on its branch. | Live authentication remains unverified. |

A workflow without a run tied to `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c` is `NOT TESTED` for this exact snapshot even if a prior run passed on another SHA. PR #803 checks are separately scoped to its head `1fedc8dca472b47b2b03350184f4899bd5eb84ad`.

## 4. Module and file-level coverage matrix

| Path | Purpose | Test mapping | Evidence | Access status | Blocker |
|---|---|---|---|---|---|
| `central-agent/HINGLISH_TONE_PROMPT.md` | central agent module: HINGLISH TONE PROMPT. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/KNOWLEDGE_LEARNING.md` | Documentation for persistent learning endpoint and verification boundary. | `No filename-based test mapping established; runtime coverage not inferred.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Documentation explicitly says live D1 persistence, deployed auth and knowledge reuse remain NOT TESTED. |
| `central-agent/README.md` | central agent module: README. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/agent-orchestrator.mjs` | Bounded agent run orchestration and task lifecycle. | `central-agent/agent-orchestrator.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/access-readiness.mjs` | architecture module: Access Readiness. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/access-readiness.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/blockchain-adapter.mjs` | architecture module: Blockchain Adapter. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/blockchain-adapter.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/capability-api.mjs` | architecture module: Capability Api. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/capability-evaluation.mjs` | architecture module: Capability Evaluation. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/capability-evaluation.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/capability-ingestion.mjs` | architecture module: Capability Ingestion. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/capability-ingestion.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/capability-request-queue.mjs` | Catalog-bounded capability proposals and owner-reviewed persistence; no tool install/execute. | `central-agent/architecture/capability-request-queue.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Production capability_requests table absent in current targeted D1 query; staging POST→D1→GET not tested. |
| `central-agent/architecture/cognitive-core-contract.mjs` | architecture module: Cognitive Core Contract. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/cognitive-core-contract.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/finance-sandbox.mjs` | architecture module: Finance Sandbox. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/goal-lifecycle.mjs` | architecture module: Goal Lifecycle. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/goal-lifecycle.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/hybrid-core.mjs` | Authenticated Python/PHP adapter with bounded task and result-schema validation. | `central-agent/architecture/hybrid-core.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Previous authenticated probe failed HTTP 502 HYBRID_CORE_AUTH_REJECTED_401; root cause not confirmed. |
| `central-agent/architecture/integration-registry.mjs` | Evidence-backed integration catalog and readiness contracts. | `central-agent/architecture/integration-registry.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/middleware.mjs` | architecture module: Middleware. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/mission-grid.mjs` | architecture module: Mission Grid. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/mission-grid.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/model-provider-adapter.mjs` | architecture module: Model Provider Adapter. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/owner-control-service.mjs` | architecture module: Owner Control Service. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/owner-control-service.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/owner-control.mjs` | architecture module: Owner Control. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/owner-execution-gate.mjs` | architecture module: Owner Execution Gate. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/platform-module-registry.mjs` | architecture module: Platform Module Registry. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/provider-router.mjs` | architecture module: Provider Router. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/quantum-adapter.mjs` | architecture module: Quantum Adapter. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/quantum-adapter.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/red-queen-registry.mjs` | architecture module: Red Queen Registry. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/robotics-simulator.mjs` | architecture module: Robotics Simulator. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/tool-forge.mjs` | architecture module: Tool Forge. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/treasury-ledger.mjs` | architecture module: Treasury Ledger. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/treasury-ledger.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/architecture/universal-tool-registry.mjs` | architecture module: Universal Tool Registry. Purpose inferred from filename/path; full content review is not implied. | `central-agent/architecture/universal-tool-registry.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/bootstrap-owner.mjs` | central agent module: Bootstrap Owner. Purpose inferred from filename/path; full content review is not implied. | `central-agent/bootstrap-owner.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/continuous-improvement.mjs` | Bounded improvement proposals and audit; not unrestricted self-modification. | `central-agent/continuous-improvement.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No self-modification permission inferred. |
| `central-agent/current-info-query.mjs` | central agent module: Current Info Query. Purpose inferred from filename/path; full content review is not implied. | `central-agent/current-info-query.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/edge-guard.mjs` | central agent module: Edge Guard. Purpose inferred from filename/path; full content review is not implied. | `central-agent/edge-guard.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/event-bus.mjs` | Module event bus and event-stream responses. | `central-agent/event-bus.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/intel-cron.mjs` | central agent module: Intel Cron. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/knowledge-learning.mjs` | Owner-session-protected D1 knowledge store; HTTPS sources, supplied test evidence, redaction, bounded search; no model-weight changes. | `central-agent/knowledge-learning.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | PR #774 merged; repository tests pass, but live route authorization and verified_knowledge D1 persistence are NOT TESTED. User-supplied testsPassed/testEvidence are not independently checked against a CI run. |
| `central-agent/live-search-agent.mjs` | Multi-provider search, timeout/fallback, diagnostics and bounded cache freshness. | `central-agent/live-search-agent.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Live provider reachability not tested. |
| `central-agent/nasa-media-connector.mjs` | central agent module: Nasa Media Connector. Purpose inferred from filename/path; full content review is not implied. | `central-agent/nasa-media-connector.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/patch-passkey-staging.mjs` | central agent module: Patch Passkey Staging. Purpose inferred from filename/path; full content review is not implied. | `central-agent/patch-passkey-staging.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/policy.mjs` | central agent module: Policy. Purpose inferred from filename/path; full content review is not implied. | `central-agent/policy.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/research-agents.mjs` | central agent module: Research Agents. Purpose inferred from filename/path; full content review is not implied. | `central-agent/research-agents.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/saum-coordinator.mjs` | central agent module: Saum Coordinator. Purpose inferred from filename/path; full content review is not implied. | `central-agent/saum-coordinator.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/search-context.mjs` | central agent module: Search Context. Purpose inferred from filename/path; full content review is not implied. | `central-agent/search-context.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/sentinel-integrity.mjs` | central agent module: Sentinel Integrity. Purpose inferred from filename/path; full content review is not implied. | `central-agent/sentinel-integrity.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/sentinel.mjs` | Sentinel health and bounded reliability checks. | `central-agent/sentinel.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Source/tests do not prove live production pulse health. |
| `central-agent/task-queue.mjs` | central agent module: Task Queue. Purpose inferred from filename/path; full content review is not implied. | `central-agent/task-queue.test.mjs` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/webauthn.mjs` | central agent module: Webauthn. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `central-agent/worker.mjs` | Main Worker router, owner auth, D1-backed services and runtime APIs. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Production Worker SHA drift; main branch protection is reported disabled. |
| `central-agent/wrangler.jsonc` | central agent module: Wrangler. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `hybrid-core/Dockerfile` | python core: Dockerfile. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `hybrid-core/Procfile` | python core: Procfile. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `hybrid-core/README.md` | python core: README. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `hybrid-core/health_probe.py` | Bounded Render cold-start/health probe logic. | `hybrid-core/test_health_probe.py` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `hybrid-core/python_core.py` | Python sidecar for allowlisted deterministic transforms, not arbitrary code execution. | `hybrid-core/test_python_core.py` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Render deployment is behind main; authenticated execution not certified. |
| `index.html` | pwa: Index. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/core3.html` | pwa: Core3. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/diagnostics.js` | pwa: Diagnostics.Js. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/icon-192.png` | pwa: Icon 192. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/icon-512.png` | pwa: Icon 512. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/icon.svg` | pwa: Icon. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/index.html` | Installable PWA shell and owner-facing dashboard. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/manifest.webmanifest` | PWA identity, icons, display and install metadata. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `jarvis/sw.js` | PWA cache lifecycle, offline shell and update activation. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Live Android install/update/offline behavior not tested. |
| `jarvis/voice-diagnostics.html` | pwa: Voice Diagnostics. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `migrations/0002_conversation_memory.sql` | migration: 0002 Conversation Memory.Sql. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `php-core/Dockerfile` | php core: Dockerfile. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `php-core/README.md` | php core: README. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `php-core/index.php` | PHP hybrid sidecar entrypoint; runtime contract requires separate live verification. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `php-core/tests.php` | php core: Tests. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `sw.js` | pwa: Sw.Js. Purpose inferred from filename/path; full content review is not implied. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | No module-specific runtime blocker established by inventory alone |
| `wrangler.jsonc` | Cloudflare Worker bindings, cron and D1/KV configuration. | `No direct sibling test mapping established from filename; suite/runtime coverage requires separate verification.` | Git tree 0a35a8dda07b5217497ec1c45bdc64e3a7d0147c | Readable via authorized GitHub connector; production writes not performed. | Configuration is not proof that runtime bindings work. |

The complete file inventory, including project docs, test files, config and release assets, is in the JSON companion. A test mapping indicates a filename-level relationship, not that every test was individually run or that production behavior was verified.

## 5. Integration registry coverage

| ID | Integration | Implementation / configuration / production status | Next action | Risk |
|---|---|---|---|---|
| CORE-EDGE | Cloudflare Worker edge runtime | not_tested / configured / not_tested | Verify deployed commit provenance and /health response against the expected SHA. | A repository binding does not prove the deployed runtime uses it. |
| CORE-PY | Python Core HTTPS execution | implemented / configured / blocked | Run the strict authenticated hybrid probe against the current live deployment; require HTTP 200, engine=python-edge-hybrid, fallbackEngaged=false, and hybridPythonCoreExecutionVerified=true. Current live deployment identity alone does not prove authenticated execution. | Health-only checks can pass while authenticated execution fails. |
| CORE-AUTH | Worker-to-Python owner-secret authentication | implemented / not_tested / blocked | Use authorized secret metadata/comparison APIs to verify length and parity without returning values; then separately approve any required secret sync and re-run authenticated execution. | Never disclose, log, or place secret values in repository files. |
| CORE-D1 | Cloudflare D1 owner-auth database | not_tested / configured / not_tested | Check migration history and schema with non-destructive read-only probes. | Binding configuration does not prove migrations or runtime queries work. |
| CORE-KV | Cloudflare KV sessions | not_tested / configured / not_tested | Verify the binding and bounded session read/write behavior using disposable test keys. | Do not inspect or expose live session values. |
| CORE-DO | Sentinel Pulse Durable Object | not_tested / configured / not_tested | Confirm the exported class, migration implementation, and live pulse route. | A binding and migration tag alone are insufficient runtime evidence. |
| CORE-AI | Cloudflare Workers AI | not_tested / configured / not_tested | Trace actual model call sites and run a bounded non-sensitive smoke test. | Avoid assuming model execution from the presence of an AI binding. |
| SEARCH | Live search and fallback routing | not_tested / configured / not_tested | Verify returned source URLs, timeout, fallback behavior, and stale-cache indicators with live queries. | A syntactically valid response is not proof of fresh or correctly sourced results. |
| OBS | Logs, traces, and redaction | not_tested / configured / not_tested | Test redaction using synthetic secrets and verify headers, request bodies, and query strings are not leaked. | Observability must not record credentials or sensitive payloads. |
| PWA | Installable app shell and service worker | implemented / not_tested / not_tested | Verify deployed asset cache version, update activation, and offline navigation on Android Chrome. | Merged code does not prove production asset freshness or offline behavior. |
| GITHUB-CI | CI and production deployment controls | implemented / blocked / blocked | PR #431 contains manual-only production gates on its draft branch, but main remains unchanged until review/merge. Verify required reviewers and branch protection before production mutation. | Push-triggered workflows can mutate production without an explicit per-run approval. |
| AGENTS | Registered agent catalog and runtime dispatch | implemented / configured / blocked | Keep the eight bounded runtime roles owner-session gated and side-effect-free; provision catalog-only roles through a reviewed pilot with per-agent health, audit, timeout, cancellation and approval checks before expanding. | The catalog lists 90 specifications (0 provisioned, automatic dispatch disabled); the Central Agent separately defines eight bounded runtime roles. Do not conflate either count with 90 running agents. |
| BANKING | Banking and financial integrations | not_implemented / not_tested / not_tested | Define provider, read-only data scope, consent, and sandbox contract before building an adapter. | No real transfers, payments, or account mutations; sandbox/read-only by default. |
| BUNKER | Bunker project integration | not_tested / not_tested / not_tested | Discover the authoritative repository or API contract before asserting integration status. | Do not guess endpoints, credentials, or repository identity. |

Registry statuses are copied from `docs/integration-registry.json` at the snapshot SHA. Registry entries are not proof of live operation.

## 6. Connected tool namespace inventory

There are 15511 visible tool functions across 714 namespaces in the ChatGPT tool catalog at snapshot time. A catalog entry does not imply that the tool is connected to REDULTRON, authorized for the repository, or suitable for a particular action. Per-tool scopes and user/account permissions apply.

| Namespace | Functions | REDULTRON-specific relevance | Access status |
|---|---:|---|---|
| _imqueue | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 1_2_3_List | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 1_Billion_Brain_Cells | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 1102tools_for_Federal_Register | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 1102tools_for_Regulations_gov | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 1102tools_for_SAM_gov | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 12andus_Astrology | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 1to1_Mate | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 2_2_Calculator | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 2048 | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 24__7_Calendar | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 30_Minute_Timer | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 3Min_API | 30 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| 789_Sudoku | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| A_I__Slides_by_Brightdeck | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| A_Z_Links | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Acceptance_Criteria_Extractor | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AccessOwl | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AccurateScribe_ai___Transcribe | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ace_Flashcard_Maker | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ACE_Money_Transfer | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Acquisition_gov_by_1102tools | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AdAgnt | 348 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Adobe_Marketing_Agent_ | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Adzviser | 64 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agent_Community | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agent_Native_Design | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agent_Ready | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agent_Ready_Checker | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agent_Relay_in_ChatGPT | 38 | Yes | BLOCKED — relay workspace not connected |
| agent_reviews | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| agent_spot | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agent_Swarm | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AgentAvow | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AgentData | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agentic_Atlas | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agentic_Search_by_Liner | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Agentic_Slides_by_SlidesGPT | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AgentiSend | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AgentMail | 51 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AgentRoam | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| agentView | 48 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AgentWorld_Explorer | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_App_Readiness_Checker | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Delivery_Evidence_Checker | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Detector_by_AI_GPT_Zero | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Interpretation_Layer_Audit_ | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Producer_by_OpusClip | 43 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Roleplay_Chat_Simulator | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Task_Brief_Builder | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Vibe_Prospecting | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Voice_Generator | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Whisper_Voice_Note_Taker | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI_Wisebase | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AI4F_Japanese_Study | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| aictrl_dev | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AIOProductOS | 71 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Airtable | 47 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Aiven | 58 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AJAXX_Data_Scrubber | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Alchemy | 173 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| All_Tide_Times | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AllEars_Vet | 41 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Altifigence | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Amplitude | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Anchor | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ansvar_Gateway | 35 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AnyConversion__Imperial__Metric | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AnyPDF___Your_PDF_Converter | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AnyQR | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AnyWhereMap___Navigate_Locate | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| API_Documentation_Checker | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| API_Impact_Mapper | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| API_Lessons | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Apilio | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Apixel | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| App_Atlas | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AppDeploy | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ApplyArc | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Appwrite | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Archivist_AI | 81 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Artist_Growth | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ask_Tarot_Cards | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Astrologic | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Atlas_AI_Agent | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Atlas_Cloud | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Auto | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Auto_building_agents | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Autocalls_AI | 101 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Autodesk_Product_Help | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Autodial | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Automations | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Autosheet | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Awesome_Record__voice___sound_ | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Awesome_Slides_ | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| AWS_Core__aws_ | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Axis | 111 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| B_A__Diagrams | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| B_A__Draw_Sketches | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Background_Music | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Base44 | 26 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Basic_Memory_Cloud | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BasicDeploy | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Bayut_KSA | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Beautiful_ai | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Bee_Spelling | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BestRemit | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Better_Design | 45 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BigGeo_AI | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Binance | 83 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Binance__get_spot_historical_block_trades | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Bitdefender | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BitsWeave | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BitsWeave__api | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BitsWeave__records | 53 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BizBlock | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BlitzReels | 119 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BlockGPT | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Blockscout_Blockchain_Data | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Blockscout_Blockchain_Data____unlock_blockchain_analysis | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BlockSurvey | 33 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Blockworks | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BluTranslate | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Booking_com | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Browser_Use | 4 | Yes | BLOCKED — prior browser service reported insufficient credits |
| BrowserStack | 40 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Bull_AI | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| BurnFat___Calorie_Tracker | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Business_Strategy_Builder | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Calendly | 36 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CALL_E | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Call_Me | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Calorie_Tracker | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| camelRun | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CamScanner | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Camtasia | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Canva | 40 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Canvs_io_whiteboard | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Career_Adapter | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Carly | 147 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Carryo | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CarVault | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Caveat | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CData_Connect_AI | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CertScore_ai_Privacy_Scanner | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Charming | 36 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Chartquery | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ChatbotGen | 24 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ChatGPT_Ads_Manager | 63 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Chessy | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Cinem_ | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CipherOwl | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Circleback | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Clay | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ClickHouse | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ClinicalTrials_gov | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Clipform | 32 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CloFin | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CloneVox_AI_Voice_Studio | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Close | 137 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CloudConvert | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Cloudflare | 4 | Yes | PASS — authorized read operations used; write scope varies by endpoint |
| Cloudinary | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CloudMindMaps | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CloudX | 32 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CMS_Coverage | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CMS_Open_Data | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Coda | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Code_Tytor__Python | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CodeAgent_Mobile | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Collecte_MTL | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Company_Brain | 55 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Company_Dossier | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Compoundio_Technology_Cloud | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Consensus | 6 | Yes | BLOCKED — research thread creation rejected in non-interactive mode |
| ConsentLayer | 60 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Content_Brief_Extractor | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Context_dev | 44 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Context_Link | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Context7 | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Contextick | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Contract_Information_Extractor | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ConvertAPI | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Convex | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CorretorIA | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Cortex___Semantic_Memory | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Craft | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CraftNote | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Create_State | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Cria_al | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Cribly | 22 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CrowdHum | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Crustdata | 26 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Customer_Info_Validator | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| CVpop___Resume___CV_Builder | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DailyMed | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DataBlue | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Decionis | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DeckCraft_Slides | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DeepL | 29 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DeeplyClear | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Descope | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Descript | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Devpost_Hackathons | 24 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DNS_Doctor___DNS___DMARC_Tools | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DNS_Inspector | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| dochost_io | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Docs_AI | 52 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| doctorSIM_Agentic_Commerce | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Domain_Scan | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DomainWisp | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| DotSpark | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Dovetail_Regulatory | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| draftmend | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| drawDash | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Drive_Commander_for_Mac | 32 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Dropbox | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Dropbox_Dash | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Dropshipping_Product_Scout | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Easy_Email_Verification | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| eesel | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ElevenLabs | 156 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| emem | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Empirical | 37 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| EmpirioLabs_AI | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Enhancv | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Eraser | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| esigna | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Etherscan | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Etsy | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| EU_Money | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Evercraft | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Evernote | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Exa | 2 | Yes | NOT TESTED for REDULTRON-specific access |
| Expedia | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ezoic_Setup | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| EzzyBills | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| F_AI_Contract_Template_Finder | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Fathom | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Feedbk_ai_Survey_Agent | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Fieldy | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Figma | 44 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| files | 11 | Yes | NOT TESTED for REDULTRON-specific access |
| Find_My_Money | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FindIp | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Fingerprint | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FiraQuantumSafe | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Firecrawl | 28 | Yes | NOT TESTED for REDULTRON-specific access |
| Fireflies | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Flash | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FlawPilot | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Flixor | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Floot | 44 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Flourish | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FluoTest | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Flyte | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Form_Field_Extractor | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FormHug | 47 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Forms_AI | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Formula_Genius | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FoundRole_Jobs | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| FoxForm | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Funnel | 73 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| G2X | 60 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Gamma | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Garchi_CMS | 43 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Genomic_Intelligence | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Genspark_AI_Slides | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GEO_Tool_Check | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GetAgents | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| getuserfeedback_com | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GIS_Cloud | 55 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GitBook | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GitHub | 89 | Yes | PASS — authorized read operations used; write scope varies by endpoint |
| Glance | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Gmail | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GoFans_Growth_Assistant | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Goodnotes | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Google_Calendar | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Gordito | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GovQuery | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Granola | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Grow_My_Website | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GSA_CALC__by_1102tools | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GSA_Per_Diem_by_1102tools | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GSC_Wizard | 131 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GTD_Brain__Getting_Things_Done | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| GTFS_Validator | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HaitiDocs | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Halo_by_Diagno | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HAPI_MCP_Registry | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HappyScribe | 44 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hatchable | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hedraios_Scripture_Context | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hercules | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hermoso_AI | 245 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hevy | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HeyGen | 108 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Higgsfield | 145 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hjarni_Notes | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hoaster | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Home | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Honeycomb__EU_ | 38 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| House_of_Prayer_by_Melorna | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HTML__CSS_to_Image_API | 24 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HubSpot | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Hyperhuman_Agent_Workspace | 45 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| HZplan | 46 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Idea_To_Prototype_Beta | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| IHate_ai_Humanaizer | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| IMEI_Checker_by_Kelpom | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Inductive | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Instant_Website | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Instavar_Video_Templates | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Insurance_GPT | 28 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| invideo | 50 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| InvoiceCraft_AI | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Is_It_Legit_by_M8ven | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Is_This_AI_Agent_Safe_ | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| iScanner | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Isoligne | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| IsThisSpam | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| JackHamr | 35 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Jade_Note | 41 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| joblet_ai___AI_Job_Search | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Jotform | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Jotform_Apps | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Jotform_Sign | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Julius__AI_Homework_Helper | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Jurnool | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| KaiCalls | 138 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Keenable | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Kepler | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| KERNEL | 31 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Keys_Locksmith | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Kickresume | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Kilter_Money | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Kleinanzeigen | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Knowledge_for_Agents | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Krea | 41 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ladder_Pick | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lawve | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lead_Magnet_Studio | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| LIAM | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| LibreJustice | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lightbringer | 37 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Limrun | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| LinkedIn | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Linkly_URL_Shortener | 25 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| LinkupAPI | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lobu | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Logimu_Shopping | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lovable | 41 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lucid | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lumen_UI | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lurna | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Lytical | 113 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Macaly_Cloud | 55 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MacroDroid_Macro_Builder | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Magic_Patterns | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MagicPath | 43 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Magnetly | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Magnific | 256 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mailopoly_Inbox | 103 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Malwarebytes | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MangaBoom | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Manufact | 72 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Manus | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mapify | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MarcoPolo | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Marriott_Bonvoy | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MCLogs | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Medicare_Care_Compare | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MeetGeek | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Meeting_Summarizer | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mem | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mermaid_Chart | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Metaplay_SDK_Docs | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Metricool | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| microfn | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Microsoft_OneNote | 22 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Microsoft_Outlook_Calendar | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Microsoft_Outlook_Email | 38 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Microsoft_SharePoint | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MindMap | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MindMap_AI | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mintlify_MCP | 36 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Miro | 54 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MiroMiro | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Miyo | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mnemom | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MongoDB_Atlas | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Monitly | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Monito | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Montage | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MotherDuck | 46 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MTG_Tools | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Music_Block | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| My_Closet | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| MyFonts | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mygentic | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Mynawoo_AI_Language_Tutor | 30 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Namecheap | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Nash_Agent | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Needle | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Neon | 119 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Netlify | 24 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Network_Solutions | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Neura_Relay_MCP | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Never_Boring_AI | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Newton_Mail | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| NewTwos | 25 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Nifty | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Nimble | 27 | Yes | NOT TESTED for REDULTRON-specific access |
| Nitrosend___AI_Native_Email | 59 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| NivaDesk | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Nobrainrot | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Noodle_Seed | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| NORMS__Evidence___Scope | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Norton | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Not_Just_You | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Noteflix | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Notion | 98 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| NPI_Registry | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| NPMScan | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Nuwa | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Octen | 6 | Yes | NOT TESTED for REDULTRON-specific access |
| Octopus_do | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Olostep | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| omgskills | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| omi | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| One4Wall | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Onplana | 315 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Open_Context | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| OpenAI_Platform | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| OpenArt | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| openFDA | 32 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Openhandle | 113 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Operator_Powers | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Opscotch | 46 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| OpusClip | 37 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ordering_Tools | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Otter_ai | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Outfit_Lens | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pablooo_club_Benchmark_library | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pacing__Run_Coach___Tracker | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PageShare | 46 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PandaDoc | 48 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pantry_Persona | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PaperAgent | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Parallel_Search | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PartnerProf___Quanntum_Core | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Passim_AI | 26 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PDF_Editor_by_PDF_net | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PDF_Editor_PRO_by_Playgram | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PDF_Reader_Pro | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PDF_Translator | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Peptide_Critic | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PeptidePrices_COA_Verifier | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Per_Diem | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Perigee_Fishing | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pethost | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Photo_Metadata_Remover | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PieterPost | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Planning_Skills | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ploy | 35 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Plugin_Management | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Plus_AI | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pocket_AI | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pocket_Informant | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pod | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Podcast_App | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PomoDial | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Portrait_Studio | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| post_bridge | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Post_Metadata_Extractor | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| poste___Slovenian_post_offices | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PR_Readiness_Check | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Presentations_Craft | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Price_Drop_Back | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Primitive_Email | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Priority_Guardian | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Prisma | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ProductOS | 115 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Project_Plan_365 | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Prompt_Perfect | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PromptBrake_Free_Tools | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ProofX | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Proto | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Publora | 67 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| PubMed | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Pushary | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| QA_Wolf | 99 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Qarera | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| qBraid | 85 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| QRCM | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Qu_Review | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Quartr | 47 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Quo | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Radar_Lite | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Rail_Monsters___Train_Tickets | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Railway | 84 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Rainbrand | 46 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ramp_Data | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Read_AI | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Reagent_Travel | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Rebarly | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Reclaim_ai | 30 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Recordo | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RED_Atlas_API | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Reed_co_uk | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RelayShield_Scam_Checks | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Release_Notes_Coverage_Checker | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Relewise_Developer | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RemindMeIQ | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RemitCheap | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Remote_Desktop_Commander | 29 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Render | 23 | Yes | PASS — authorized read operations used; write scope varies by endpoint |
| Replit | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Resend | 139 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Resume_Builder | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Resume_io | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ResumeBoost | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RewriteLy_Humanizer | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RFP_Response_Checker | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Rhythm_AI_Personality_Tuner | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Ria_Money_Transfer | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Roomwise | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Rosetta | 22 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Rowan | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RuleFoundry | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Runway | 33 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| RxNorm | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SalaryAPI | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sander_Saar_Videos | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ScalperIntel_AI | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SciGrant | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SciSpace | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Seam | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Semrush | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sent | 26 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SentinelX | 94 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SerialHunt | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ShareWatch | 25 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| sherlock_sh | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ShipStatic | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Shopify | 43 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Show___Tell | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sider_Recorder___Transcriber | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sider_Scholar | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Simple_World_Clock | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Simpliciter_AI | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| skills | 2 | Yes | NOT TESTED for REDULTRON-specific access |
| skima | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Skyscanner | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Slashtel | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Slashy | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SlideForge | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Slides_AI | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Smallpdf | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Smart_Chess_Train_Learn_to_win | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Smart_Money_Tracker | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Smart_Planner_AI | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SmartphoneKey | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| smarts_bio__AI_for_biology | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Smartsheet_EU | 87 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Smartsheet_US | 97 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| smry | 24 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Snake_Retro__Neon_Arcade | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Social_Post_Previewer | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Soluvery | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SpaceCloud_Global | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Spaceship | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SpeakApp | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Speechify | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Speko | 27 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Spkr___Chat_to_Podcast_Episode | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SplitEasy | 45 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SportsAPIs_dev | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Spotify | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sprites | 26 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Squish | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Stabile__Loyalty_Rewards_Agent | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Stanza | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| stark_AI_Developer_Tools | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| StatsHawk | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Statsig | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| StayinDE_Study_Budget | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Steer_Astro | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Stem | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sticklight | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Storyblocks | 14 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Stripe | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Structured | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| StubEngine | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| StudyMe_ai | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Sugra_API | 149 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Supabase | 29 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Super_Carl | 147 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Superfunds | 38 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Superhuman_Docs | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Supericons | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SuperIntern | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SuperMCP | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| SuperMe | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Supermetrics_Marketing_Agent | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Support_Ticket_Validator | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Swigs_Cloud | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Symbol | 62 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Syncly_Social | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| T_c_Bi_n | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tako | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tally | 28 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tallyproof_Bank_Statements | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Talonic | 98 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tamarind_Bio | 54 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tarot | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Taskaid_AI | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TasksBoard | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tavily | 5 | Yes | NOT TESTED for REDULTRON-specific access |
| Tela | 49 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Teleprompter_com | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TendersAI | 22 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Termalin | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TerraLab | 31 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Test_Failure_Triage | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Testifly | 38 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| The_Astro_Scope_Horoscope | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Themely_Design_Style_Generator | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| There_s_An_AI_For_That | 30 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TickTick_To_Do_List___Calendar | 57 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TimelinesAI | 35 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TimerTime | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Timezone_Buddy | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tiniest_Cloud | 35 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TinyFish | 23 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| tldraw | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| to3D | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Todoist__To_Do_List___Calendar | 47 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Toffu | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| toflow_ai | 131 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Token_Terminal | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TokenOS_Gas_Tracker | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TokenOS_Tokenomics_Designer | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tolstoy | 29 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ToolCheck_by_M8ven | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| ToolMatch | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TourRadar | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Traffik_Yacht_Radar | 6 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TRIGGERcmd | 88 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Trip_com | 11 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Trocafone | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tropic | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TTS_Studio__AI_Text_to_Speech | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TubeAlfred | 34 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Turkish_Airlines | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Tweek | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| TwinMind | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Unabyss | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Unblocked | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Undermind | 28 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Uniquel_UI_Components | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Upplai | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Upstash_Redis | 73 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| USAspending_by_1102tools | 55 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| UseMyContext_ai | 13 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| user_settings | 2 | Yes | NOT TESTED for REDULTRON-specific access |
| UX_Pilot | 75 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Val_Town | 59 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Vantage | 156 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Vercel | 239 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Vertical_Bar_Agent | 75 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Vibecode | 24 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| VideoZero | 37 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| vidIQ | 70 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Visla_Video_Maker | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Visualping | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Vocci | 12 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| VoiceCursor_Dictionary | 10 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Voicenotes | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Waldo | 121 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WalkMyPlan___Floor_Plans_in_3D | 63 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Weavely_Forms___Surveys | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Website_Launch_Check | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WebsitePublisher | 43 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Werify | 18 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Western_Union | 4 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wever_Brief | 2 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wever_Evidence | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Whatjobs | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Whisper_Transcribe_AI | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wispr_Flow | 16 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wix | 31 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wolfee | 7 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wolfram | 3 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wordy__Highlight_Annotate_Text | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Workjournal | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| worklore | 8 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WorkOS | 5 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Wortschatz | 17 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WP_Agent | 63 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WPVibe | 36 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WPWriter | 85 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| WunderCineMate | 19 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| XMemo | 21 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Xmind | 35 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| xTiles | 39 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| YepCode | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| YNAB__Get_Good_At_Money | 1 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Zentrik | 38 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Zite | 42 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Zoom | 20 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| Zoom_Revenue_Accelerator | 15 | No / not project-specific | NOT TESTED for REDULTRON-specific access |
| zyberspace | 9 | No / not project-specific | NOT TESTED for REDULTRON-specific access |

Relevant connectors used: GitHub (repository/PR/CI reads and feature-branch writes), Cloudflare (deployment metadata and read-only D1 SELECT), Render (service/deploy/log metadata). Agent Relay was not connected; Consensus agent creation was blocked in non-interactive mode; browser access to Worker/Render health URLs was unavailable. No external agent recruitment or mass spawning is claimed.

## 7. Authoritative public sources consulted

| Source ID | Primary source | Use |
|---|---|---|
| UDHR | [Universal Declaration of Human Rights](https://www.un.org/en/about-us/universal-declaration-of-human-rights) | Dignity, equality, privacy and human rights. |
| UNESCO_AI | [UNESCO Recommendation on the Ethics of Artificial Intelligence](https://www.unesco.org/en/artificial-intelligence/recommendation-ethics) | Human oversight, proportionality, privacy, transparency, accountability and fairness. |
| OECD_AI | [OECD AI Principles](https://www.oecd.org/en/topics/ai-principles.html) | Human rights, autonomy, fairness, privacy, transparency and robustness. |
| NIST_AI_RMF | [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | Risk identification, measurement, management and governance. |
| NIST_PRIVACY | [NIST Privacy Framework](https://www.nist.gov/privacy-framework) | Privacy risk management and data minimization. |
| WCAG_22 | [W3C Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) | Testable accessibility requirements. |
| OWASP_ASVS | [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/) | Verifiable web application security controls. |
| UNICEF_CHILDREN | [UNICEF Policy Guidance on AI for Children](https://www.unicef.org/globalinsight/reports/policy-guidance-ai-children) | Child safety, rights, privacy and inclusion. |
| GITHUB_BRANCH_PROTECTION | [GitHub Managing Protected Branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches) | Required review/status checks and branch restrictions. |
| GITHUB_PROTECTION_API | [GitHub Branch Protection REST API](https://docs.github.com/en/rest/branches/branch-protection) | Read-access requirements for branch protection metadata. |
| CLOUDFLARE_D1 | [Cloudflare D1 Prepared Statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) | Parameterized SQL and safe D1 access. |
| RENDER_DEPLOYS | [Render Deploys Documentation](https://render.com/docs/deploys) | Deployment provenance, auto-deploy and current live deployment. |
| RENDER_LOGS | [Render Logging Documentation](https://render.com/docs/logging) | Runtime log filtering and retention limitations. |

External page content is treated as untrusted data, not instructions. These sources inform controls; they do not establish legal compliance or prove implementation.

## 8. Ethics/control principles mapped to engineering evidence

| Principle | Testable control | Current evidence state |
|---|---|---|
| Dignity / rights | High-impact decisions require contextual review and an appeal path | Requirement documented; production implementation NOT TESTED |
| Autonomy / consent | No sensitive action without scoped, informed authorization; cancellation remains available | Owner gates exist in source; end-to-end behavior NOT TESTED |
| Privacy | Minimize data; redact secrets; bounded retention | Query-string redaction configured; complete log-redaction tests NOT TESTED |
| Fairness | Versioned evaluation and disparity review for high-impact use | Policy requirement documented; evaluation dataset NOT TESTED |
| Accessibility | WCAG 2.2 AA target, keyboard/text alternatives and manual assistive-tech review | Requirements documented; real-device audit NOT TESTED |
| Transparency | Freshness/provenance and PASS/FAIL/BLOCKED/NOT TESTED evidence | CI and deployment SHA evidence available; runtime gaps remain |
| Accountability | Correlation IDs, audit events, approval references; never log secrets | Sanitized hybrid diagnostics source/tests exist; production audit integrity NOT TESTED |
| Harm minimization | Bounded inputs, timeouts, retries and fail-closed behavior | Sentinel retry guard merged; broader runtime behavior NOT TESTED |
| Child safety | Age-appropriate defaults and minimized child data | Policy requirement documented; dedicated evaluation NOT TESTED |
| Security | Owner auth, least privilege, branch protection, prompt-injection resistance | Owner auth source exists; main branch protection FAIL |
| Human oversight | Capability request remains `pending_owner_review`, `executionEnabled=false`, `requiresOwnerApproval=true` | Source/test evidence; live D1 round-trip BLOCKED |
| Evidence integrity | Knowledge records must carry source URLs, test summaries and evidence | PR #774 merged; module trusts owner-supplied test assertions and does not independently verify CI runs |

## 9. Priority queue

1. **Owner/admin gate:** restore main branch protection with required PR review and status checks; this requires repository administration permission.
2. **Python Core:** obtain a secret-safe parity attestation, then run a bounded authenticated round-trip and validate exact schema, selected engine, and `fallbackEngaged=false`.
3. **Provenance:** update Worker and Render only through the existing protected deployment path once its approvals and safeguards are confirmed.
4. **Capability persistence:** complete PR #763 review and run authenticated POST→D1→GET only in authorized staging.
5. **Persistent learning:** verify the deployed owner-authenticated route and D1 table; independently validate test evidence before treating records as verified knowledge.
6. **Live Search:** test provider reachability, timeouts, fallback and stale-cache markers with real runtime responses.
7. **PWA:** verify manifest, served cache version, service-worker activation, offline navigation and install/update on Android Chrome.
8. **Ethics:** map each acceptance requirement to implementation/test evidence and human review; do not equate a policy document with compliance.

## 10. Limitations

- This snapshot is dated and must be regenerated after repository changes.
- File purposes inferred from names are not equivalent to full code review.
- CI passing on one SHA does not prove deployment, production health or authenticated execution.
- Public health URLs could not be opened through the current web interface; no live HTTP status is asserted here.
- No background monitoring, guaranteed stop/reset, or morning notification is claimed.


## 5. Mission evidence refresh — 2026-10-29T03:20:10+05:30

This section supersedes older runtime claims wherever timestamps or statuses conflict. Inventory snapshot: main `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`.

### Current repository and automation coverage

| Area | Current evidence | Status |
|---|---|---|
| Git tree | 195 tracked files; 95 Central Agent files; 14 workflows; 73 test/spec files; 19 docs; 9 PWA assets; 7 Hybrid Core files; 4 PHP Core files. | PASS — inventory |
| Integration registry | 14 registry entries. | PASS — inventory only; not proof of live connectivity |
| ChatGPT tool catalog | 15511 functions across 714 catalog namespaces. | PASS — catalog inventory; authorization/runtime integration is separate |
| Main branch protection | `protected=false`; protection endpoint returned HTTP 403. | FAIL |
| Release package | Current main SHA `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c` has failed runs [40772544482](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40772544482), [40771842906](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40771842906), [40770973337](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40770973337), and [40770648736](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40770648736). | FAIL — root cause NOT TESTED |
| PR #803 owner-secret preflight | Head `1fedc8dca472b47b2b03350184f4899bd5eb84ad`; CI [40767091631](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091631), Central Agent tests [40767091652](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091652), Static site checks [40767091667](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40767091667) all passed. PR remains open and unmerged. | PASS — PR head only |
| PR #735 Sentinel retry guard | Merged at `d5c2b232962439d20870cabe68882a9fa7543df9`; historical CI/static/release/sentinel runs passed. Current sampled runs [40773676027](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40773676027) and [40773672706](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40773672706) had skipped jobs. | NOT TESTED — controlled live duplicate replay |
| Capability request queue | PR #763 merged at `5705cab8611c50ce2b27adddd550adaff0af19d2`; mock D1 create/list/readback and sanitized-error tests exist. Latest documented read-only D1 query returned HTTP 200, 26 tables, no `capability_requests`/`verified_knowledge`, zero rows written. | BLOCKED — live authenticated round-trip NOT TESTED |
| Live Search | `open-source-first`; code declares 5,000 ms timeout and 24-hour stale cache. Last known health metadata has `searchProviderReachabilityChecked=false`. | NOT TESTED — live provider reachability |
| PWA | Repository cache `redultron-core-shell-v18-core-3`; manifest/service-worker sources exist. Direct endpoint checks failed in this run; Browser Use lacked credits and KERNEL requested interactive input. | NOT TESTED — live assets and Android install/update |
| Python Core | Last recorded live probe HTTP 502 `HYBRID_CORE_AUTH_REJECTED_401`; no new authenticated probe. PR #803 is not merged and cannot prove production secret parity. | FAIL — previous evidence; current root cause unconfirmed |
| Agent services | No online CodeAgent sessions; JackHamr credits exhausted at `-11.737204 USD`; no linked Agent Swarms; Browser Use credits exhausted. | BLOCKED — no agent execution started |

### File additions since the prior matrix snapshot

| Path | Purpose / test mapping | Evidence | Status / blocker |
|---|---|---|---|
| `central-agent/architecture/capability-request-queue.persistence.test.mjs` | D1-mock round-trip and sanitized storage-error tests. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`; PR #763 Central Agent test run [40761440483](https://github.com/lostgodsgods-ops/super-chatty-jarvis/actions/runs/40761440483). | PASS — mock tests; live D1 remains NOT TESTED |
| `config/autonomy-directive.json` | Bounded autonomy directive; tested by `tests/autonomy-directive.test.mjs`. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | NOT TESTED live; configuration does not grant permission |
| `docs/AI_PROVIDER_OPERATIONS.md` | Provider operational guidance. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Documentation presence only |
| `docs/GPT_ACTION_SETUP.md` | GPT Action setup guidance. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Documentation presence only |
| `docs/REDULTRON_OVERNIGHT_COVERAGE_MATRIX.md` | Human-readable evidence matrix; tested by `tests/overnight-coverage-matrix.test.mjs`. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Contract test exists; current-main run NOT TESTED |
| `docs/overnight-coverage-matrix.json` | Machine-readable file/workflow/integration/tool/source inventory. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Refreshed in this branch; CI validation pending |
| `openapi/redultron-learning-action.json` | OpenAPI contract for the learning action. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Schema presence does not prove endpoint reachability |
| `tests/autonomy-directive.test.mjs` | Autonomy directive regression tests. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Current-main execution NOT TESTED |
| `tests/overnight-coverage-matrix.test.mjs` | Coverage inventory invariants and safety-status contract. | Main tree `0a35a8dda07b5217497ec1c45bdc64e3a7d0147c`. | Current-main execution NOT TESTED |

### Public-source learning applied

- Secret handling: least privilege, secret lifecycle metadata, and never emitting plaintext secrets in logs — [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html).
- Database safety: versioned D1 migrations and explicit migration tracking; no production schema mutation was attempted — [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/).
- AI risk management: continuous governance, mapping, measurement and management, with transparency/accountability — [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) and [NIST AI RMF Playbook](https://airc.nist.gov/airmf-resources/playbook/).
- Accessibility: continue validating testable WCAG 2.2 criteria; repository presence is not a substitute for device testing — [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).

### Safety and next actions

No secrets were read or changed. No production D1 rows were written, no deployment or merge was performed, and no new agent was started. Next safe steps are to obtain the failed release-package job logs, run a controlled duplicate-Sentinel event test, verify authenticated capability-request persistence in an approved staging database, and execute the guarded Worker/Python provenance workflow only with its required explicit owner authorization.
