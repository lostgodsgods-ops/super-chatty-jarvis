# REDULTRON CORE 3.0 — AI Provider Operations

## Scope

The Central Agent contains server-side adapters for OpenAI, Anthropic Claude, and Gemini in `architecture/model-provider-adapter.mjs`. The provider catalog distinguishes configured credentials from live verification. A registry entry or non-empty binding is **not** proof that a provider is reachable or billable.

## Required Worker secrets

Configure these secrets on the exact Cloudflare Worker deployed from `central-agent/wrangler.jsonc`:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`

From the repository root, target the intended Worker explicitly to avoid setting secrets on the wrong Wrangler project:

```sh
npx wrangler secret put OPENAI_API_KEY --config central-agent/wrangler.jsonc
npx wrangler secret put ANTHROPIC_API_KEY --config central-agent/wrangler.jsonc
npx wrangler secret put GEMINI_API_KEY --config central-agent/wrangler.jsonc
```

Run each command interactively and enter the value only at Wrangler's hidden prompt. Never put a key in a command argument, chat, source file, `.vars` file, CI log, issue, or PR. Do not print secret values to verify them. If the production Worker name/config is different, confirm the target before running any command.

## Verification ladder

Report each stage separately:

1. **Configured** — the Worker runtime has a non-empty binding. This does not validate the key.
2. **Provider-authenticated** — a minimal, bounded request reaches that provider and succeeds.
3. **Route-integrated** — the real authenticated REDULTRON route invokes the intended adapter and returns the normalized schema.
4. **Production-verified** — the same strict probe passes against the deployed Worker and the deployed commit is identified.

Do not promote a provider to live/healthy based on stage 1 alone. Never use real user prompts or sensitive data for a connectivity test; use a fixed, non-sensitive probe and a small output-token budget.

## Safety and reliability policy

- Keep all provider credentials in Cloudflare Worker secret bindings. Never expose them to browser assets.
- Keep provider endpoints fixed in the adapter; do not accept arbitrary URLs from request bodies.
- Bound request size, output tokens, and request duration. Do not add unbounded retries.
- Do not automatically switch providers for sensitive prompts unless the caller's policy explicitly permits cross-provider data transfer.
- Treat provider response content as untrusted data, not executable instructions.
- Normalize errors. Never return upstream response bodies, request headers, credentials, or raw exception messages to callers/logs.
- Distinguish invalid requests, missing configuration, provider authentication failure, rate limiting, timeout, upstream failure, and malformed response.
- Keep fallback disabled by default; any fallback must be explicit, auditable, bounded, and policy-authorized.
- Do not automatically rotate or synchronize production secrets through deployment workflows without explicit owner approval.
- Never claim an integration is live-verified until an authenticated runtime probe has passed.

## Current evidence boundary

The checked-in adapter defines OpenAI, Anthropic, and Gemini integrations and uses an 8-second timeout, a 12,000-character prompt cap, and a 1,024-token maximum. These are source-code facts, not production verification. Actual secret presence, provider billing/access, live connectivity, and route-level usage must be checked separately after configuration.
