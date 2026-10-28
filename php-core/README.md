# REDULTRON PHP Core

A PHP 8.3 / Apache sidecar that mirrors the bounded task contract used by the current Python Core. It is a separate service, not a replacement for the Cloudflare Worker or existing Python sidecar until routing and production parity are explicitly verified.

## API

- `GET /health` returns minimal service health. It does not prove authenticated execution works.
- `POST /v1/execute` requires `X-Owner-Secret` and `Content-Type: application/json`.
- Request JSON must contain exactly `task` and `text`.
- Supported tasks: `summarize`, `extract_keywords`, `classify_text`.
- Body limit: 10 KiB. Text limit: 16,000 Unicode characters.
- Responses include `X-Request-ID`, `Cache-Control: no-store`, and sanitized machine-readable error codes.
- Unknown routes/tasks are denied. No arbitrary PHP, shell, or user-supplied code is executed.

## Run locally

PHP 8.3 is required; no third-party runtime dependencies are used.

```sh
cd php-core
export OWNER_SECRET='replace-with-a-random-secret-at-least-32-characters-long'
php -S 127.0.0.1:8788 index.php
```

The included container is a local/staging runner using PHP's built-in web server. Do not use the built-in server for production traffic. For production, run the same entrypoint under a production-grade PHP web server behind HTTPS ingress, request-size/rate limits, and a secret manager; never expose the sidecar directly over plaintext HTTP.

## Test

From the repository root:

```sh
php -l php-core/index.php
php php-core/tests.php
```

The contract tests use an explicit test-only secret. Never reuse it in production.

## Integration status

This service is not automatically connected to the Worker. Before routing production traffic to it, implement and test an explicit Worker adapter, verify HTTPS reachability, compare secret configuration without printing values, run an authenticated end-to-end probe, and provide a rollback path. Configuration or `/health` alone is not evidence of successful hybrid execution.
