# Super Chatty Jarvis — Standalone PWA & Owner Gate

## Scope

This is an installable Progressive Web App (PWA), not an Android APK. The manifest requests `display: standalone` with `display_override: ["standalone"]` and a branded dark launch surface. The first-screen install banner uses Chrome's `beforeinstallprompt` event when Chrome exposes it; tapping **INSTALL APP NOW** invokes the native prompt. The Android/Chrome install UI and splash screen are controlled partly by the operating system and browser; behavior varies by device.

## Owner-first startup

- On cold start, the UI stays locked and does not run the Worker health check, D1 telemetry reads, or SSE stream.
- The only initial backend request is `GET /auth/session`, to validate an existing HttpOnly owner session.
- If the session is not valid, the owner must sign in with the configured password or an already-registered WebAuthn passkey.
- After successful verification, the UI may check Worker health, load owner memory/telemetry, and start the authenticated event stream.
- Protected APIs must continue enforcing authorization on the Worker. A frontend lock is not a replacement for server-side authorization.
- WebAuthn/passkey sign-in requires a supported browser, HTTPS, a registered credential, and device/platform support. A fingerprint is not guaranteed on every Android device.

## Updates and cache

- The shell cache name is versioned. The service worker skips waiting, claims clients, and removes older Super Chatty shell caches on activation.
- HTML, manifest, and service-worker requests bypass the HTTP cache and are revalidated.
- While the PWA is open, it checks for service-worker updates every 60 seconds and when the app becomes visible. It reloads when the new worker takes control.
- A closed app cannot be forced to update instantly by a GitHub commit alone. It updates on a subsequent launch/online check; no reinstall should be needed for ordinary web-asset updates. Offline clients necessarily retain their last cached shell until connectivity returns.

## Deployment

The existing GitHub Actions deployment workflow targets `main` and deploys `src/worker.mjs` using `wrangler.jsonc`. It runs `npm test` before deploying. The repository must have a valid GitHub Actions secret named `CLOUDFLARE_API_TOKEN`; never paste that token into source code or chat.

1. Merge the reviewed PWA change into `main`.
2. In GitHub, open **Actions** and verify the static-site checks and Cloudflare deployment workflow are green.
3. Open the production PWA over HTTPS. Confirm the installed app launches without the browser tab bar using Chrome's **Install app** or **Add to Home screen** option, where available.
4. On a browser that exposes `beforeinstallprompt`, verify **INSTALL APP NOW** opens the native install dialog from one tap. If the event is unavailable, verify the banner explains that Chrome has not yet confirmed install eligibility; the site does not pretend it can force a native prompt.
5. Verify an unauthenticated launch shows **OWNER SESSION REQUIRED** and does not issue health, D1 telemetry, or SSE requests.
6. Sign in with the owner password or registered passkey; verify health/telemetry/SSE only begin after the session is confirmed.
7. Reload the installed PWA and verify session restoration only if the secure session cookie remains valid.

## Required manual acceptance tests

- [ ] Android Chrome install launches in standalone display mode.
- [ ] When `beforeinstallprompt` fires, **INSTALL APP NOW** opens Chrome's native install prompt from a user tap.
- [ ] When `beforeinstallprompt` does not fire, the install banner reports that native prompt eligibility is unavailable without claiming installation succeeded.
- [ ] New install shows the configured app icon and splash background.
- [ ] No health request, D1 telemetry request, or SSE request occurs before session verification.
- [ ] Invalid/expired session leaves telemetry and SSE locked.
- [ ] Valid owner password session unlocks services.
- [ ] Registered passkey sign-in succeeds on the target device.
- [ ] Sign-out stops the event stream and clears owner-only telemetry from the screen.
- [ ] A pushed update is picked up while the PWA is open; a closed PWA updates on next launch/online check.
- [ ] Offline launch remains locked if no valid owner session can be verified.

Do not mark device-specific behavior PASS until it has been exercised on the target Android phone.
