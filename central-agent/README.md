# Super Chatty Central Agent v1

This is an isolated, initial AI gateway for Super Chatty Jarvis. It is intentionally separate from the existing site and Workers.

## Current scope

- `GET /health`: public health and configuration status; never returns secrets.
- `POST /chat`: owner-authenticated Workers AI chat.
- `GET /agents`: owner-authenticated planned agent roles.
- `POST /tasks` and `GET /results`: currently return 503 until durable storage and an executor are implemented.

## Security boundaries

- The Worker expects the secret `OWNER_API_KEY`; never commit it to GitHub source code.
- Do not place `OWNER_API_KEY` in browser JavaScript, an HTML file, or a mobile app bundle. Those locations are inspectable by users and apps.
- Do not paste third-party API keys into ChatGPT or agent prompts. Add them only through the provider's secret manager / Cloudflare Worker secrets.
- This v1 does not create third-party API keys, change permissions on external services, run arbitrary tools, deploy other agents, or bypass owner approval.
- All integrations should use least-privilege credentials. Broad "allow everything" keys increase risk and are not required for an initial setup.
- The `/agents` list is a plan, not evidence that those agents are running.
- The AI model must not be allowed to approve its own permissions or grant itself new tools.

## Required GitHub Actions secrets

Set these in the repository's Actions secrets before running the manual workflow:

1. `CLOUDFLARE_API_TOKEN`: a valid Cloudflare API token with only the permissions required to deploy Workers and use Workers AI for this account.
2. `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
3. `CENTRAL_AGENT_OWNER_KEY`: a strong random owner key, generated and stored privately. Do not paste it into chat or commit it.

The existing Cloudflare token must be verified before deployment; this workflow cannot fix a revoked or invalid token.

## Deployment

Run the GitHub Actions workflow named **Deploy Central Agent** from the Actions tab after reviewing the files and adding the required secrets. The workflow uploads `CENTRAL_AGENT_OWNER_KEY` to the Worker as the secret `OWNER_API_KEY` and deploys the isolated Worker.

After deployment, verify `GET /health` returns HTTP 200. A 200 health check proves the Worker is reachable; it does not prove chat, task execution, or project integration works.

## Safe project integration

The existing project site must not receive the owner key in frontend code. To connect the UI, add a server-side proxy in the existing site Worker (or use a protected authenticated server route) that forwards an authorized request to this Worker. Review and test that change separately before deploying it.

## Known gaps before calling this a full agent leader

- Durable task queue and result persistence (KV or Durable Objects).
- Explicit approval records and a non-bypassable execution policy.
- A real executor/runner for registered child agents.
- Server-side proxy integration with the existing site.
- Integration-specific secrets and provider permissions, added individually and least-privileged.
- Automated tests and a live deployment verification report.
