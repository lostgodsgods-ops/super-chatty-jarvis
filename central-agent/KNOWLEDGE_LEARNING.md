# Persistent Learning Engine

The Worker exposes an owner-session-protected endpoint at `/api/learning/knowledge`.

- `GET /api/learning/knowledge?q=<terms>&limit=10` retrieves owner-scoped verified records.
- `POST /api/learning/knowledge` stores a record only when it includes a title, problem, solution, HTTPS source references, `testsPassed: true`, a test summary, and at least one test-evidence item.
- Writes use the existing D1 `DB` binding and a `verified_knowledge` table. Records are scoped to `owner`; the endpoint does not expose cross-user lookup.
- Credential-like strings are redacted from stored text. Source URLs are restricted to HTTPS and reject embedded credentials.
- Records store source references, test evidence, confidence, limitations, and reuse instructions. The engine does not change model weights.
- Search results are untrusted knowledge, not executable instructions. Re-check code and environment-specific assumptions before reuse.
- The API requires the existing owner session through the Worker authorization gate. Do not expose it as a public unauthenticated endpoint.

## Verification boundary

Unit tests with a mock D1 prove input validation and query construction only. They do not prove live D1 schema migration, deployed route authorization, production persistence, or successful knowledge reuse. Those remain NOT TESTED until measured against the deployed Worker.
