# REDULTRON CORE 3.0 — Android Install Guide

## What this is
This is a Progressive Web App (PWA) bundle for Chrome on Android. It is not an APK. The ZIP cannot install itself; the files must be served from an HTTPS origin (or localhost for development).

## Install on Android
1. Extract the downloaded ZIP.
2. Publish the **contents** of the `redultron-core-3/` folder to an HTTPS static site. Keep `index.html`, `manifest.webmanifest`, `sw.js`, `diagnostics.js`, and the icon files together in the same directory.
3. Open that HTTPS app URL in Chrome on the phone.
4. Wait for the page to finish loading. In Chrome's menu, choose **Install app** (or **Add to Home screen**, depending on Chrome version).
5. Launch REDULTRON from the home-screen icon. Use the in-app update control after a new release is published.

## Important operational limits
- A ZIP build is not proof that the production Worker or Python Core is healthy.
- Owner-only features require a valid owner session. Do not place API keys, owner secrets, or `.env` files in the static folder.
- Voice input requires browser microphone permission and a compatible speech-recognition implementation. Device-level voice, camera, notifications, and offline behavior must be tested on the actual phone.
- Backend features need the configured HTTPS Worker and authorized integrations. A dashboard panel is not proof that its integration is live.
- Keep production deployment and secret synchronization behind the repository's approval process. Do not paste secrets into the app or chat.
- This package does not include an APK. A signed APK requires a separate Android wrapper and signing/release pipeline.

## Free hosting note
A free HTTPS static-hosting tier can serve the PWA. Hosting-provider quotas and account requirements can change. If using the existing Cloudflare Worker, publish only through the reviewed, approval-gated deployment pipeline; do not upload files directly to production outside that process.

## Build provenance
The ZIP's `BUILD-METADATA.txt` records the source commit. Verify the provided SHA-256 checksum before distributing the package.
