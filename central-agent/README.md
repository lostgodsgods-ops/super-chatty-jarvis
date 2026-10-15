# Super Chatty Central Agent

Central Agent v1.3.0 adds an owner-defined password flow. It does not connect to Google Gemini.

## Owner password setup

- Open `/owner#setup=<one-time-token>` using the private setup link.
- Choose and confirm a password of 12–256 characters.
- The Worker derives a salted PBKDF2-HMAC-SHA-256 hash (100,000 iterations, the maximum supported by Cloudflare Workers Web Crypto). The raw password is not stored.
- Sign-in returns a random session token held in the owner page's JavaScript memory only; it is not written to `localStorage` or `sessionStorage`. Sessions expire after one hour.
- The credential row is protected by a D1 primary key so first-time setup can succeed only once.
- Keep `OWNER_SETUP_TOKEN` as a GitHub Actions secret. The deployment workflow installs it as a Cloudflare Worker secret when deploying. Never put it in source code, a public issue, or a normal chat message.
- For automated first-time bootstrap, optionally add `CENTRAL_AGENT_OWNER_PASSWORD` as a GitHub Actions secret. The deployment workflow checks `/auth/status` first and only submits this password if setup is still required. After `/auth/status` reports setup complete and the owner login is verified, remove `CENTRAL_AGENT_OWNER_PASSWORD` from GitHub Actions secrets; it is not needed for later deployments.
- Password login and setup require HTTPS. The owner setup page uses a fragment token so the token is not sent in the initial HTTP request or referrer.

## Required bindings and variables

- D1 binding `DB` → database `super-chatty-owner-auth` (table `owner_credentials` is provisioned).
- KV binding `SESSIONS` → namespace `SUPER_CHATY_OWNER_AUTH`.
- AI binding `AI` for Cloudflare Workers AI.
- `ALLOWED_ORIGINS` limits browser cross-origin access.
- Secret `SEARCH_API_KEY` configures the owner-authenticated `POST /search` endpoint through Tavily Search API. It is installed by the Central Agent deployment workflow and never stored in source code.

Required GitHub Actions secrets:
- `OWNER_SETUP_TOKEN` — bootstrap token used by the setup endpoint. Do not use your actual owner password as this token.
- `CENTRAL_AGENT_OWNER_PASSWORD` — optional temporary secret for automated first-time bootstrap only; remove it after successful setup and login verification.

## Endpoints

- `GET /health` — public status only; does not expose secrets.
- `GET /owner` — password setup/login page.
- `GET /auth/status` — reports whether first-time setup is required.
- `POST /auth/setup` — one-time password setup; requires bootstrap token.
- `POST /auth/login` — verifies password and creates a one-hour session.
- `POST /auth/logout` — revokes current session.
- `GET /policy`, `GET /agents`, `POST /chat` — require a valid owner session.
- `POST /search` — requires a valid owner session and `SEARCH_API_KEY`; accepts `{ "query": "...", "searchDepth": "basic" }` and returns up to five results with HTTP(S) source URLs.
- `POST /tasks` — requires a valid Owner session and a one-task approval object: `{ approved: true, action: "knowledge_search", query: "<same exact normalized query>", confirmation: "APPROVE THIS EXACT KNOWLEDGE QUERY", nonce: "<new UUID>" }`. The nonce is stored under a unique constraint to reject replay. Only read-only Tavily search tasks are accepted; other actions fail closed.
- `GET /tasks` — lists recent task metadata for the authenticated Owner.
- `GET /results?id=<task-id>` — returns a task result; without `id`, returns recent completed/failed results. Result URLs are source references, not executable instructions.
- A Cloudflare Cron trigger runs every 15 minutes and processes at most three explicitly approved queued searches per tick. It cannot create tasks, widen scopes, call arbitrary URLs, or perform other external side effects. This is bounded scheduled retrieval, not model retraining or an unlimited global crawler.
- Task records and audit events are stored in the existing D1 database. Tables are provisioned lazily by the queue module. A task is accepted only if the task and approval audit can be written in a D1 batch.

## Controlled knowledge queue

- The queue stores fetched source metadata/content as a durable per-task result. It does not modify model weights or claim to synchronize all global knowledge.
- Owner approval is per exact query, action, and one-time nonce. The scheduler only consumes rows already stored with `owner_approved = 1`.
- `SEARCH_API_KEY` must be configured as a Worker secret. If D1 or the key is unavailable, task creation/execution fails closed.

## Security status and limitations

- Tavily search runs server-side; the API key is a Cloudflare Worker secret and is never returned to clients.
- No Gemini API key or Gemini provider is used.
- Unknown actions fail closed; no child agents or external tools execute.
- This is password authentication, not account recovery. WebAuthn/passkey or device biometric registration and signature verification are not implemented. If you forget the password, a separately reviewed owner recovery procedure is required.
- Add rate limiting / abuse monitoring before treating this as a production internet-facing login.
- Run `npm test` from the repository root. The owner auth tests use Node's built-in test runner.
