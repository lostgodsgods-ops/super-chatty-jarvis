# Super Chatty Central Agent v1

An isolated, initial AI gateway for Super Chatty Jarvis. It is separate from the existing site and Workers.

## Current scope

- `GET /health`: public health/configuration status; never returns secrets.
- `POST /chat`: owner-authenticated Workers AI chat. It plans and advises only.
- `GET /agents`: owner-authenticated catalogue of proposed child-agent roles; it does not spawn agents.
- `GET /policy`: owner-authenticated fail-closed policy description.
- `POST /tasks` and `GET /results`: return 503 until durable storage, single-use approval consumption, audit logging, and a tested executor exist.
- `policy.mjs`: pure policy checks; unknown actions are denied by default.
- `policy.test.mjs`: Node.js built-in tests. Run with `node --test central-agent/policy.test.mjs`.

## Authority model

1. The owner is the final authority. ChatGPT is a command/coordination channel, not a source of additional permissions.
2. The Central Agent can plan, summarize, review and propose work. It cannot self-grant permissions.
3. Creating/activating child agents and all external side effects require explicit, action-scoped owner approval.
4. Every executor must independently enforce the policy. A model response is never an authorization decision.
5. Unknown actions, missing tools, missing approvals, or missing durable audit/approval infrastructure must fail closed.
6. Child roles are bounded to `research`, `development`, `integration`, and `testing`; no root/admin role is available through the policy module.
7. “Self-repair” should mean diagnose, create a patch/PR, run tests and report evidence. Merge, secret changes, permission changes and deployment remain separately owner-approved.

## Security boundaries

- The Worker expects `OWNER_API_KEY`; never commit it to source code.
- Do not put `OWNER_API_KEY` in browser JavaScript, HTML, or a mobile app bundle.
- Do not paste third-party API keys into ChatGPT or agent prompts. Store them only in the provider's secret manager / Cloudflare Worker secrets.
- This version does not create third-party API keys, change external permissions, run arbitrary tools, deploy child agents, or connect itself to the existing site.
- Use least-privilege credentials; broad “allow everything” keys are not necessary.
- The `/agents` list is a plan, not evidence that agents are running.

## Required GitHub Actions secrets

Before using the manual deployment workflow, set these repository Actions secrets:

1. `CLOUDFLARE_API_TOKEN`: valid Cloudflare token with only required Worker deployment permissions.
2. `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
3. `CENTRAL_AGENT_OWNER_KEY`: strong random owner key, generated and stored privately. Do not paste it into chat or commit it.

The workflow cannot repair a revoked/invalid Cloudflare token. Secret values are not printed by the workflow.

## Deployment

Run **Deploy Central Agent** manually from GitHub Actions only after reviewing the files and adding the required secrets. It deploys the isolated Worker and sets `OWNER_API_KEY`.

After deployment, verify `GET /health` returns HTTP 200. This only proves reachability, not that chat, task execution, or project integration works.

## Monitoring

The workflow **Monitor Central Agent** checks `$CENTRAL_AGENT_URL/health` every 15 minutes and can open/update an incident issue when the check fails. It requires a repository Actions variable named `CENTRAL_AGENT_URL` containing the deployed Worker base URL (HTTPS, without `/health`). It becomes useful only after this workflow is merged into the default branch, the Worker is deployed, and the variable is configured. It reports failures; it does not automatically repair code or deploy.

## Integration plan

Connect the existing site only through a protected server-side proxy. Never expose the owner key in frontend code. Review and test that change separately before deploying it.

## Gaps before calling this a functioning multi-agent system

- Durable queue and result persistence (KV or Durable Objects).
- Single-use, action-scoped owner approval records.
- Audit trail and emergency stop/revocation.
- Sandboxed runner for registered child agents.
- Safe test execution and patch/PR workflow.
- Server-side proxy integration with the existing site.
- Individual provider integrations and least-privilege credentials.
- Automated tests and verified live deployment.
- Automatic diagnosis/repair proposals beyond health-incident reporting.
