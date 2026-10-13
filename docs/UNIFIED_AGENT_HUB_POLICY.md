# Super Chatty Jarvis — Unified Agent Hub Policy (Copy/Paste)

Owner: Lost God
Status: Proposed v1 policy — NOT a statement that production deployment is complete.

## Goal
Provide a shared, authenticated relay through which approved ChatGPT and Gemini connectors can exchange explicitly published task records, data summaries, status, and results.

## Capability boundaries
1. ChatGPT and Gemini remain separate services. The relay does not merge model weights, hidden instructions, private conversations, subscriptions, app permissions, or internal tool access.
2. Each agent can use only tools explicitly connected to its own adapter and granted permissions. Tool calls must be executed by a trusted task runner, not by arbitrary payload text.
3. The relay stores messages; it is not itself an execution engine. A QUEUED record is not proof that a task ran.
4. The mobile/client UI must never contain a long-lived shared relay secret. Use a backend session or short-lived, scoped credential for client access.

## Authentication and authorization
- No default/fallback secret is permitted.
- Store secrets as Cloudflare Worker secrets; never commit or paste secret values into chat.
- Use exact credential validation and rotate compromised credentials.
- Allowlist CORS origins; CORS is not authentication.
- Validate agent identity, recipient, payload type, schema, and size server-side.
- Keep the least-privilege principle: read status separately from publishing tasks; require owner approval for deployments, account changes, payments, messages, deletion, device control, or other high-impact actions.

## Task lifecycle
DRAFT -> QUEUED -> CLAIMED -> RUNNING -> SUCCEEDED / FAILED / NEEDS_APPROVAL.
Every transition must include task ID, agent ID, timestamps, idempotency key, and an audit event. Use a durable queue/transactional store or Durable Object to prevent duplicate claims. Verify output independently before reporting success.

## Email security
- Allowlist exact sender addresses. A subject tag alone is not authorization.
- Treat email body, attachments, and links as untrusted input.
- Email may create a review task; it must never directly authorize tool execution, deployment, financial activity, credential changes, or device actions.
- Redact sensitive content from logs and retain only the minimum necessary data.

## Observability
Expose authenticated task status, recent audit summaries, health, and deployment/test evidence. Do not expose secrets, raw tokens, private email bodies, or unrestricted logs to a public endpoint. Report PASS only after an independent check; otherwise use FAIL, BLOCKED, or NOT TESTED.

## Rollout gates
1. Unit tests and static checks pass.
2. Deploy to a staging Worker with a dedicated KV namespace and secrets.
3. Verify unauthorized requests return 401, disallowed origins return 403, valid publish/poll/ack works, oversized/invalid payloads fail, and email allowlist works.
4. Verify task runner and end-to-end result checks.
5. Only then propose production deployment. Never overwrite the existing gateway blindly.
