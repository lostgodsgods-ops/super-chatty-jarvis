# Super Chatty Jarvis — Guarded Voice, Capability Index, and Intel Cron

## Runtime architecture

```mermaid
flowchart TD
  M[Vivo Android / PWA] -->|Owner session + same-origin HTTPS| W[Cloudflare Worker]
  M -->|Mic stream, RMS onset| V[RMS barge-in monitor]
  V -->|speech onset while TTS active| T[Abort chat turn + speechSynthesis.cancel]
  M -->|SpeechRecognition transcript| W
  W --> A[Owner authorization + edge guard]
  A --> C[/api/capabilities/ingest]
  C --> H[HTTPS + exact hostname allowlist]
  H --> O[OpenAPI/Swagger parser]
  O --> S[D1 capability_snapshots]
  S --> R[Metadata-only capability index]
  R -. execution disabled; approval required .-> P[Owner-reviewed tool proposal]
  W --> D[D1 session ledger]
  W --> K[KV hot state / locks]
  CRON[15-minute scheduled Worker] --> I[Repository + allowlisted API telemetry]
  I --> D
  CRON --> Q[Sentinel + stale-task recovery + bounded research]
  Q --> D
  I -. proposal only; no source edits or deploys .-> P
```

## Capability ingestion contract

Endpoint: `POST /api/capabilities/ingest`

Request body:

```json
{ "specUrl": "https://api.example.com/openapi.json" }
```

Before using it, set the exact hostnames allowed to serve API specifications in the Cloudflare Worker variable `CAPABILITY_SPEC_HOSTS`, comma-separated, e.g. `api.example.com,docs.example.com`. Hostnames are exact matches, HTTPS is required, redirects are rejected, response bodies are capped at 512 KB, and no credentials are imported. The endpoint stores a normalized schema index in D1. It does **not** clone a service's implementation, execute endpoints, or automatically grant tools permissions.

A schema index is metadata, not an executable integration. A later tool adapter must be implemented or explicitly reviewed and approved before it can perform any external action.

## Scheduled intelligence

The Central Agent cron runs every 15 minutes. When `INTEL_CRON_ENABLED=true`, it records:
- Public GitHub repository counters and last-push metadata for `GITHUB_REPOSITORY`.
- Aggregate active-session count from `owner_sessions` when that table is available; no session token or user message is exported.
- Optional public JSON endpoints configured through `INTEL_API_ENDPOINTS_JSON` and `INTEL_API_ALLOWED_HOSTS`. Only HTTPS, exact allowlisted hostnames, no URL credentials, no query strings, no redirects, and GET-only requests are accepted. For these endpoints, only status, content type, top-level JSON keys, and a SHA-256 body hash are persisted—not response values.
- Existing sentinel status, stale task recovery, approved task processing, and bounded research remain in the Worker schedule.

Telemetry is **proposal-only**. It cannot modify source, merge a pull request, deploy, execute external tools, or grant permissions.

## Voice interruption

The PWA uses Web Audio time-domain RMS while hands-free mode is enabled. Four consecutive frames above the adaptive threshold trigger `speechSynthesis.cancel()` and invalidate the active turn. SpeechRecognition still supplies the actual transcript; RMS alone never submits a command. Fetch cancellation uses the active turn's `AbortController`, while a monotonically increasing `turnId` discards late responses and memory writes.

Browser speech synthesis is not an AbortController-backed stream. It must be cancelled separately. Acoustic echo cancellation, noise suppression, and gain control are requested from the browser, but thresholds still require measurement on the target phone and room.

## Verification and deployment

Run locally with Node.js 20+:

```sh
npm test
node --test central-agent/architecture/capability-ingestion.test.mjs
```

The Central Agent deployment workflow runs policy/auth tests before deployment. After merge, verify:
1. GitHub Actions: deploy, PWA assets, static checks, and scheduled monitor.
2. `GET https://shrill-silence-164f.lostgodsgods.workers.dev/health`.
3. Authenticated read-only ingestion test against a harmless, allowlisted OpenAPI document.
4. On the Vivo Y51 Pro 5G: hands-free opt-in, speak-over-TTS latency, echo false positives, mic denial, lock/logout cleanup, and repeated conversation turns.

Do not mark device latency or acoustic performance as PASS without a physical-device run.
