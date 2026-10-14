# Passkey authentication staging

This folder is an isolated implementation proposal. It is **not connected to the production Worker** and must not be treated as live Owner authentication.

## Current staging API

- `GET /health` — non-authenticated staging health check.
- `POST /passkey/register/options` — requires `x-owner-setup-token`; available only while no passkey is enrolled.
- `POST /passkey/register/verify` — validates WebAuthn registration and consumes the one-time challenge.
- `POST /passkey/login/options` — generates a five-minute challenge for a discoverable passkey.
- `POST /passkey/login/verify` — verifies the assertion, updates the signature counter, then issues a random 1-hour KV session.
- `GET /auth/status` — checks the Bearer session.
- `POST /auth/logout` — revokes the current KV session.

## Required environment

- `RP_ID`: exact relying-party domain (no scheme or port).
- `RP_NAME`: display name.
- `ALLOWED_ORIGIN`: one exact HTTPS origin; do not use a wildcard.
- `OWNER_SETUP_TOKEN`: Cloudflare secret used only for initial passkey enrollment.
- `DB`: a **new staging-only** D1 database with `passkey-schema.sql` applied.
- `SESSIONS`: a **new staging-only** KV namespace.

Do not point staging at the production D1 database or production session KV. Do not put secrets in GitHub source, commits, or chat. The setup token should be entered only in the private staging UI/request, never committed.

## Before deployment

1. Provision separate staging D1 and KV resources.
2. Confirm `RP_ID` and `ALLOWED_ORIGIN` match the actual staging hostname exactly.
3. Add an explicit rate limit to registration/login routes and protect the bootstrap token with rotation and expiry.
4. Add route-level tests with D1/KV mocks, including concurrent challenge reuse, invalid attestation, unknown credential, session expiry, logout, and wrong origin.
5. Run the GitHub Actions workflow and review all checks.
6. Deploy only to a separate staging Worker, then test on a real Android device with the native passkey prompt.
7. Do not connect these routes to privileged agents until the complete test suite passes and the route is reviewed.

## Known limitations

- This branch currently permits only one initial Owner passkey; adding/recovering credentials needs an authenticated and audited owner flow.
- The one-time bootstrap token does not expire automatically at the application layer. Configure/rotate it as a Cloudflare secret and do not expose it in URLs.
- The Worker does not execute agent tasks or grant permissions. It only covers the authentication API.
- No biometric template or raw biometric data is received by this server.
