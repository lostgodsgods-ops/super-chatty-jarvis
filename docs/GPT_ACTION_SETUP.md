# Connect a private GPT Action to REDULTRON knowledge

This connects a **private custom GPT** to REDULTRON's verified knowledge API. It does not automatically connect this ChatGPT conversation's hidden context or change the underlying model weights.

## Before enabling the Action

1. Deploy the Worker revision that contains `/api/learning/knowledge`. Do not assume production has the current main commit; verify the deployed SHA first.
2. In Cloudflare Worker secrets, set `BRIDGE_SECRET` to a long, unique random secret (at least 32 characters). Never commit it or paste it into public chat. The API accepts the existing owner session or this route-specific bearer secret.
3. In the private custom GPT editor, add an Action by importing `openapi/redultron-learning-action.json`.
4. Set Action authentication to API Key, header `Authorization`, scheme/prefix `Bearer`, and enter the same `BRIDGE_SECRET` value in the GPT editor. Keep the GPT private and do not share its action credentials.
5. Test a GET query with no sensitive data, then a POST with a public HTTPS source and real test evidence. Verify the record appears on a subsequent GET.

## Privacy and safety

- This Action grants access to the private knowledge store to whoever can use the configured GPT Action. Keep the GPT private; revoke/rotate `BRIDGE_SECRET` if its access scope changes.
- Never store API keys, passwords, personal secrets, or raw private user data as knowledge.
- Knowledge records are evidence-backed memory; they do not authorize deployment, external account changes, or other consequential actions.
- A successful GitHub workflow is not a live deployment test. Mark production integration PASS only after an authenticated end-to-end probe.

## API

- `GET /api/learning/knowledge?q=<terms>&limit=10`
- `POST /api/learning/knowledge`

The API contract lives at `openapi/redultron-learning-action.json`.
