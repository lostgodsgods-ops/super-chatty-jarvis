# REDULTRON Hybrid Core (Python + Cloudflare Workers)

This service is a bounded processing sidecar. Cloudflare Workers run the fast JavaScript routing/authentication layer; the Python service performs CPU-local, allowlisted text transforms. It does **not** execute arbitrary code, shell commands, plugins, or user-supplied Python.

## Implemented tasks

- `summarize`: deterministic first-three-sentence extraction.
- `extract_keywords`: bounded keyword frequency ranking.
- `classify_text`: small deterministic labels for current-information and technical-issue text.

These are a secure integration foundation, not an LLM or general-purpose autonomous reasoning engine.

## Local verification

From repository root:

```sh
python -m unittest discover -s hybrid-core -p 'test_*.py' -v
npm test
```

## Run the Python service

Use Python 3.12+; no third-party dependencies are required. Generate a random secret with at least 32 characters and inject it through your host's secret manager. Do not commit it or paste it into chat.

```sh
export OWNER_SECRET='<set in your local shell / secret manager>'
python hybrid-core/python_core.py
```

The default listener is `127.0.0.1:8788`. For a container, set `HOST=0.0.0.0` and place it behind the hosting platform's HTTPS ingress. Never expose the service directly over plaintext HTTP. The `Dockerfile` is provided for a platform that supplies TLS ingress and secret injection.

## Cloudflare Worker integration

- Configure `PYTHON_CORE_URL` as a Worker environment variable pointing to the HTTPS service's `/v1/execute` endpoint.
- Configure `OWNER_SECRET` as a **Worker secret**, and inject the exact same value into the Python service's secret store. Never put it in `vars`, source code, PWA JavaScript, logs, or request responses.
- Route: `POST /api/hybrid/execute`.
- The caller must first have a valid owner session (`Authorization: Bearer <owner-session-token>`). The Worker forwards the server-side secret to Python.
- Supported body: `{"task":"summarize","text":"..."}`, with task allowlist and a 16,000-character limit.
- Timeout: 5 seconds. Missing bindings, non-HTTPS URLs, upstream auth failures, malformed responses, and timeouts fail closed with structured error codes.
- Health reports configuration only; it does not prove Python service reachability. A successful authenticated query is required for runtime verification.

## Secret-safe configuration diagnostics

The shared Worker adapter exposes `inspectHybridCoreConfiguration(env)` for tests and the secret-gated `POST /api/internal/hybrid-probe`. Its diagnostics report only:
- selected provider (`php`, `python`, or `none`);
- whether an endpoint is configured and passes the HTTPS/path policy;
- whether the owner secret is present and meets the 32-character minimum;
- a sanitized configuration failure code;
- whether a real authenticated round-trip has verified reachability and secret acceptance.

The diagnostics never return the endpoint URL/hostname, secret value, secret length, headers, or upstream response body. Configuration checks alone leave `runtimeReachabilityVerified=false` and `ownerSecretMatchVerified=false`. These fields become true only after a successful authenticated sidecar response with the documented task-specific result schema. An upstream 401/403 stays a failure; it is not converted into a successful health result.

The Worker validates result shapes consistently for Python and PHP: `summarize` returns a bounded string, `extract_keywords` returns a bounded array of term/count records, and `classify_text` returns labels plus a character count.

## Security boundaries

The Python service checks `X-Owner-Secret` with constant-time comparison, caps request bodies, disables request-body/header logging, and rejects unknown routes/tasks. Use an HTTPS ingress with rate limiting. Rotate the secret through the authorized secret manager if it is exposed.
