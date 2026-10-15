# Super Chatty Central Agent

Central Agent v1.3.0 adds an owner-defined password flow. It does not connect to Google Gemini.

## Owner password setup

- Open `/owner#setup=<one-time-token>` using the private setup link.
- Choose and confirm a password of 12–256 characters.
- The Worker derives a salted PBKDF2-HMAC-SHA-256 hash (210,000 iterations). The raw password is not stored.
- Sign-in returns a random session token stored in browser `sessionStorage`; sessions expire after one hour.
- The credential row is protected by a D1 primary key so first-time setup can succeed only once.
- Keep `OWNER_SETUP_TOKEN` as a Cloudflare Worker secret. Never put it in source code, a public issue, or a normal chat message. After the owner password is set, remove the setup secret from Worker settings.
- Password login and setup require HTTPS. The owner setup page uses a fragment token so the token is not sent in the initial HTTP request or referrer.

## Required bindings and variables

- D1 binding `DB` → database `super-chatty-owner-auth` (table `owner_credentials` is provisioned).
- KV binding `SESSIONS` → namespace `SUPER_CHATY_OWNER_AUTH`.
- AI binding `AI` for Cloudflare Workers AI.
- `ALLOWED_ORIGINS` limits browser cross-origin access.
- Secret `SEARCH_API_KEY` configures the owner-authenticated `POST /search` endpoint through Tavily Search API. It is installed by the Central Agent deployment workflow and never stored in source code.

Required secret for first-time setup:
- `OWNER_SETUP_TOKEN` — one-time bootstrap secret. Do not use your actual owner password as this token.

## Endpoints

- `GET /health` — public status only; does not expose secrets.
- `GET /owner` — password setup/login page.
- `GET /auth/status` — reports whether first-time setup is required.
- `POST /auth/setup` — one-time password setup; requires bootstrap token.
- `POST /auth/login` — verifies password and creates a one-hour session.
- `POST /auth/logout` — revokes current session.
- `GET /policy`, `GET /agents`, `POST /chat` — require a valid owner session.
- `POST /search` — requires a valid owner session and `SEARCH_API_KEY`; accepts `{ "query": "...", "searchDepth": "basic" }` and returns up to five results with HTTP(S) source URLs.
- `POST /tasks` and `GET /results` — remain blocked (503); no durable task executor exists.

## Security status and limitations

- Tavily search runs server-side; the API key is a Cloudflare Worker secret and is never returned to clients.
- No Gemini API key or Gemini provider is used.
- Unknown actions fail closed; no child agents or external tools execute.
- This is password authentication, not account recovery. If you forget the password, a separately reviewed owner recovery procedure is required.
- Add rate limiting / abuse monitoring before treating this as a production internet-facing login.
- Run `npm test` from the repository root. The owner auth tests use Node's built-in test runner.
