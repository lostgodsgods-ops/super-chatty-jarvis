# REDULTRON CORE 3.0 — Privacy Shield and Zero-Trust Hardening

## Scope and truthful claims
This is a hardening proposal, not a security certification. No application can promise that all activity is untraceable or that hosting, network, Git, and upstream providers retain no metadata. This policy minimizes application-collected data and documents separate provider-level controls.

## Change in this branch
Worker observability remains enabled, while invocation log collection and persistence are disabled in Wrangler configuration and sampling is set to zero. Verify this setting against the deployed Cloudflare configuration after deployment. Platform analytics, network metadata, GitHub audit records, and upstream-provider logs are separate systems and are not disabled by this change.

## Privacy and retention
- Never log request bodies, Authorization headers, cookies, API keys, passkey assertions, or plaintext decrypted payloads.
- Do not persist full IP addresses, precise geolocation, or stable device fingerprints in application-owned D1/KV records.
- Use short-lived task/session records with explicit TTL and documented deletion.
- Keep only minimum security events needed for incident response: event category, coarse timestamp, opaque request ID, outcome, and policy reason.
- Document data flows and provider retention settings separately. Do not describe this as a universal zero-log guarantee.

## Cryptography
- Use HTTPS/TLS for network transport.
- Use AES-256-GCM only for payloads whose recipient is designed to decrypt them. Generate a fresh cryptographically secure 96-bit IV for every encryption under a key; never reuse a nonce.
- Keep encryption keys server-side or use a suitable key-management/envelope-encryption design. Never ship a shared secret in the PWA.
- HMAC signatures require canonical request construction, timestamp expiry, a cryptographically random nonce, replay detection, constant-time comparison, and key rotation. HMAC is not a replacement for identity and authorization.
- Do not wrap GitHub source pushes in an ad-hoc encrypted blob; use GitHub's expected API format and TLS.

## Zero-trust routes and agents
- Authenticate and authorize every privileged route on the server.
- Treat CORS/Origin as browser controls, not authentication.
- Apply request size limits, rate limits, timeouts, CSRF protection where cookie sessions are used, and session revocation.
- Keep public health responses minimal; protect detailed probes with owner authorization.
- Default-deny unknown tools and agent capabilities. Require explicit approval for destructive or externally visible actions.
- A five-second timeout is a bounded policy for selected operations, not a guarantee that every model call will complete within five seconds. Propagate cancellation and stop downstream work where supported.

## Sentinel and incident response
- Keep schema migrations separate from read-only schema/integrity verification.
- Use a hash-chain ledger only with a defined canonical serialization, sequence numbers, key management where keyed integrity is required, and verification tests. A hash chain alone does not prevent a privileged attacker from rewriting all records.
- On suspicious activity, rate-limit, revoke affected sessions, quarantine the relevant capability, alert the owner, and preserve minimal forensic evidence.
- Do not automatically wipe all credentials or databases on a single anomaly. Use a separately protected emergency stop that blocks privileged execution and supports deliberate recovery.

## CI/CD gates
1. Source-of-truth SHA and branch protection are verified.
2. Secret scanning and dependency audit pass.
3. Third-party Actions are pinned to immutable commit SHAs.
4. Application logging tests reject request-body and credential logging.
5. Unauthenticated privileged routes are rejected.
6. Expired/replayed signed requests are rejected.
7. Size, timeout, rate-limit, and cancellation tests pass.
8. Read-only Sentinel verifier performs no schema mutation.
9. Emergency stop blocks privileged execution and recovers safely.
10. Reviewed commit SHA matches deployed SHA; production smoke tests pass.
11. Cloudflare, GitHub, and upstream provider retention controls are independently reviewed.

## Status
- Wrangler configuration change: proposed in a review branch; not merged or deployed.
- Application log-content audit: not yet run.
- Provider-level telemetry and retention: not verified here.
- Runtime security tests and production deployment: not tested here.
- No claim of complete anonymity, universal zero logs, or untraceability is made.
