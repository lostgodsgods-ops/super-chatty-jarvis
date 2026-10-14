# Super Chatty Central Agent v1

An isolated AI gateway for Super Chatty Jarvis. It is separate from the existing site and other Workers.

## Live endpoints

- Health: https://super-chatty-central-agent-v1.lostgodsgods.workers.dev/health
- Site origin allowed for browser CORS: https://super-chatty-jarvis-site.lostgodsgods.workers.dev

## Current scope

- `GET /health`: public health/configuration status; never returns secrets.
- `POST /chat`: owner-authenticated chat. Use JSON `{"message":"..."}`; optional `"provider":"gemini"` selects Gemini, while the default `workers-ai` uses Cloudflare Workers AI.
- `GET /agents`: owner-authenticated catalogue of proposed child-agent roles; it does not spawn agents.
- `GET /policy`: owner-authenticated fail-closed policy description.
- `POST /tasks` and `GET /results`: return 503 until durable storage, single-use approval consumption, audit logging, and a tested executor exist.
- `policy.mjs`: pure policy checks; unknown actions are denied by default.
- `policy.test.mjs`: Node.js built-in tests. Run with `node --test central-agent/policy.test.mjs`.

## Provider and secret setup

Secrets must be added in Cloudflare Workers & Pages → `super-chatty-central-agent-v1` → Settings → Variables and Secrets. Exact UI labels may vary.

- `OWNER_API_KEY` (Secret): required before any protected endpoint works. Generate a strong random value privately and keep it in a password manager. Never put it in frontend JavaScript, HTML, a mobile bundle, or a chat message.
- `GEMINI_API_KEY` (Secret): optional; required to use `"provider":"gemini"`. Create/manage the key in Google AI Studio and store it only as a Worker secret. Never commit or expose it.
- `GEMINI_MODEL` is a non-secret variable and defaults to `gemini-2.5-flash`.
- `ALLOWED_ORIGINS` is a non-secret comma-separated exact-origin allowlist. Do not use `*` for the owner API.

The code supports both providers, but Gemini is not live until `GEMINI_API_KEY` is configured and a real authenticated chat call succeeds. Do not treat `geminiConfigured: false` as a working integration.

## Authority model

1. The owner is the final authority. ChatGPT is a command/coordination channel, not a source of additional permissions.
2. The Central Agent can plan, summarize, review and propose work. It cannot self-grant permissions.
3. Creating/activating child agents and all external side effects require explicit, action-scoped owner approval.
4. Every executor must independently enforce the policy. A model response is never an authorization decision.
5. Unknown actions, missing tools, missing approvals, or missing durable audit/approval infrastructure must fail closed.
6. Child roles are bounded to `research`, `development`, `integration`, and `testing`; no root/admin role is available through the policy module.
7. “Self-repair” should mean diagnose, create a patch/PR, run tests and report evidence. Merge, secret changes, permission changes and deployment remain separately owner-approved.

## Security boundaries

- Do not put secrets in source control, frontend code, app bundles, logs, or model prompts.
- This version does not run arbitrary tools, deploy child agents, or execute external side effects.
- The `/agents` list is a plan, not evidence that agents are running.
- `/tasks` and `/results` remain unavailable until a durable queue, approval records, audit trail, emergency stop/revocation, and a tested executor are implemented.

## GitHub Actions deployment

The manual workflow requires repository Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CENTRAL_AGENT_OWNER_KEY`. The Cloudflare API token must have least-privilege Worker deployment permissions. A revoked/invalid token cannot be repaired by the workflow.

## Monitoring

The workflow **Monitor Central Agent** checks `$CENTRAL_AGENT_URL/health` every 15 minutes and can open/update an incident issue when the check fails. It requires a repository Actions variable `CENTRAL_AGENT_URL` containing the deployed Worker base URL (HTTPS, without `/health`). It is useful only after the workflow is merged into the default branch and the variable is configured. It reports failures; it does not automatically repair code or deploy.

## Remaining gaps before calling this a functioning multi-agent system

- Configure `OWNER_API_KEY` and verify correct/incorrect authentication.
- Configure `GEMINI_API_KEY` and verify a real Gemini response.
- Test Workers AI response with a valid owner key.
- Durable queue and result persistence (KV or Durable Objects).
- Single-use, action-scoped owner approval records.
- Audit trail and emergency stop/revocation.
- Sandboxed runner for registered child agents.
- Safe test execution and patch/PR workflow.
- Server-side proxy integration with the existing site.
- Full automated tests and verified end-to-end deployment.
