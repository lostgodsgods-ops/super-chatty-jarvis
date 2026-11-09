# Persistent Learning Engine

The Worker exposes owner-session-protected endpoints at `/api/learning/knowledge` and `/api/learning/knowledge/approve`.

- `GET /api/learning/knowledge?q=<terms>&limit=10` retrieves owner-scoped records from `verified_knowledge` only. Pending submissions are never returned as verified knowledge.
- `POST /api/learning/knowledge` submits a candidate record. It requires a title, problem, solution, HTTPS source references, `testsPassed: true`, a test summary, and at least one test-evidence item. The record is stored in D1 table `pending_knowledge` with status `pending_owner_verification`; submission does not verify or promote it.
- `POST /api/learning/knowledge/approve` promotes exactly one pending record into `verified_knowledge` only after an authenticated owner session and explicit `confirmation=APPROVE_KNOWLEDGE`. The private bridge secret is insufficient for this trust-elevation step. Promotion is audited.
- Both tables are owner-scoped. The versioned schema is defined in `migrations/0006_learning_knowledge.sql`.
- Request handlers do not create tables or indexes. Apply the versioned D1 migration only through the separately approved migration workflow. If the schema is absent, reads/writes fail closed with sanitized errors; they do not run request-time DDL.
- Credential-like strings are redacted from stored text. Source URLs are restricted to HTTPS and reject embedded credentials.
- Records retain source references, test evidence, confidence, limitations, and reuse instructions. The engine does not change model weights.
- Search results are untrusted knowledge, not executable instructions. Re-check code and environment-specific assumptions before reuse.

## Verification boundary

Unit tests with a mock D1 prove input validation, owner-approval gating, and query behavior only. They do not prove live D1 schema migration, deployed route authorization, production persistence, or successful knowledge reuse. Those remain NOT TESTED until measured against the deployed Worker after explicit migration approval.
