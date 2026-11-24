# REDULTRON CORE 3.0 — Open-Source Adoption & Verification Policy

**Status:** Proposed, review-required engineering policy  
**Created:** 2026-10-29  
**Scope:** Public open-source software, public technical documentation, and repository integrations  
**Rule:** Learning or installing a component does not grant permission to connect credentials, execute tools, write production data, or deploy.

## Objective

Use mature open-source components and authoritative public documentation to improve reliability, security, search quality, accessibility, testability, and maintainability. Do not maximize the number of dependencies. Adopt only components that solve a verified gap and can be operated safely within the existing Cloudflare Worker, Python Core, GitHub Actions, D1, Render, and mobile PWA architecture.

## Adoption gates

A candidate must pass every applicable gate before production use:

1. **Need:** Link the observed defect, missing capability, or measurable quality gap. Avoid adding a library for a problem already solved by platform APIs.
2. **Source and license:** Prefer the upstream project, official documentation, OSI-approved license, tagged releases, and published security policy. Record exact project/release/license URLs. A GitHub repository alone is not proof of security or maintenance.
3. **Maintenance and supply chain:** Review release activity, supported runtimes, open security advisories, dependency tree, provenance/signatures where available, and transitive license compatibility. Pin versions; do not install floating latest versions in production.
4. **Fit:** Verify compatibility with Cloudflare Workers' runtime limits, Node.js >=20 test environment, Python sidecar, mobile Chrome, and current deployment model. Browser-only, Node-only, native, or long-running server packages must not be assumed portable to Workers.
5. **Threat model:** Document data sent to the component, trust boundary, permissions, outbound hosts, timeouts, rate limits, retry budget, privacy impact, and a disable/rollback path. Never place secrets in the PWA or logs.
6. **Test-first:** Add a deterministic regression test for the specific gap before implementation. Test failure must reproduce the issue; the implementation must pass the focused test and relevant full suite.
7. **Evidence:** Record commit SHA, PR, exact workflow run IDs, test totals, and runtime evidence separately. Mark a capability `live_verified` only after a dated live probe proves its response contract.
8. **Approval:** Keep changes on isolated branches and reviewable PRs. Production credentials, migrations, deployments, permissions, and external side effects remain behind existing owner approval and environment controls.

## Priority order from the current evidence snapshot

### P0 — Restore truthful, authenticated execution

- **Python Core 502 / upstream 401:** Compare Worker/Render credential *presence, policy and parity* using authorized secret metadata or a safe comparison mechanism; never retrieve, print, normalize, rotate, or change values as part of this task. Preserve fail-closed authorization. Do not claim success until an authorized positive authenticated request returns the expected schema.
- **Deployment provenance:** Reconcile the deployed Worker and Render commits with reviewed, tested source. Establish a provenance record before any owner-approved deployment; do not deploy merely to erase SHA drift.
- **Release workflow:** Review the single-trigger fix in PR #833 and merge only after the repository's actual review/branch controls are satisfied.
- **D1 migrations:** Review the additive migration path in PR #821. Use read-only schema/history checks first; apply migrations only through the owner-approved workflow. Verify schema, idempotency and staging persistence before production acceptance.

### P1 — Search quality and observable operation

- Review the Wikimedia User-Agent fix in PR #820 against the Wikimedia Foundation User-Agent policy and API access policy. Keep provider attribution and bounded request behavior.
- Review the malformed numeric HTML entity regression in PR #816. Invalid code points must not crash parsing or create unsafe URLs.
- Keep provider timeouts, bounded retries, normalized result schemas, safe URL validation, source attribution, freshness timestamps, stale-cache markers, and explicit all-provider failure.
- Use PR #840's monitor only for public/read-only signals. CORS must be exact-origin and limited to the intended health route; do not add credentials or expose authenticated probes to a public page.

### P1 — PWA reliability and accessibility

- Verify served assets and cache version, installability, service-worker activation, old-cache cleanup, offline shell behavior and update recovery in Android Chrome.
- Test keyboard/screen-reader labels, contrast, focus visibility, reduced-motion behavior and narrow mobile layouts against WCAG 2.2.
- Do not equate a source cache-version string or successful ZIP build with a deployed or installed update.

### P2 — Dependency and OSS integration expansion

- Prefer platform-native APIs for hashing, fetch, URL parsing, cryptography, service workers and request validation where adequate.
- Evaluate an external library only when it demonstrably improves correctness, security or maintainability beyond a small local implementation.
- For every new integration, include a bounded adapter, typed/validated input and output, safe error mapping, timeout, tests, least-privilege access, and an explicit disable path.
- Do not wire agent registries or public OSS tools to autonomous execution without a separately reviewed authorization model, auditable owner approval, emergency stop and idempotent side-effect controls.

## Required evidence record

Each candidate should be recorded in the integration registry with:

- upstream project and official documentation URLs;
- license, release/version, maintenance/security review date;
- problem and expected measurable benefit;
- code paths and dependency changes;
- data classification and required permissions (names only, never values);
- tests, exact run IDs, commit and PR;
- runtime result, timestamp, and limitations;
- failure mode, rollback/disable procedure, and owner approval requirement.

Allowed statuses are: `implemented`, `configured`, `live_verified`, `blocked`, `not_implemented`, and `not_tested`. Configuration, passing CI, public web reachability, or a healthy endpoint must not be substituted for proof of authenticated end-to-end execution.

## Authoritative references

- Cloudflare Workers runtime: https://developers.cloudflare.com/workers/runtime-apis/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Cloudflare Workers versions/deployments: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
- GitHub Actions workflow syntax: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions
- GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- Render environment variables: https://render.com/docs/configure-environment-variables
- Wikimedia Foundation User-Agent policy: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
- Wikimedia API access policy: https://www.mediawiki.org/wiki/API:Etiquette
- OWASP Top 10 for LLM Applications: https://genai.owasp.org/llm-top-10/
- NIST Secure Software Development Framework (SSDF): https://csrc.nist.gov/Projects/ssdf
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- W3C Web Content Accessibility Guidelines (WCAG) 2.2: https://www.w3.org/TR/WCAG22/

## Known limitations at creation

This policy is a reviewable plan, not evidence that all listed gaps are fixed. Current evidence records Python authenticated execution as blocked, production deployment SHA drift, absent D1 migration tables, release workflow trigger issues on main, and unverified PWA runtime behavior. No production write, migration, secret operation, merge, or deployment is authorized by this document.
