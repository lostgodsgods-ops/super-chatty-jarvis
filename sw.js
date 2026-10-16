/* Super Chatty Jarvis PWA service worker.
 * Immediate activation is intentional; cache cleanup is scoped to this app's cache prefix.
 */
const CACHE_PREFIX = "super-chatty-jarvis-";
const CACHE_VERSION = "v1";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

self.addEventListener("install", (event) => {
  // Activate the new worker without waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Network-first pass-through: do not cache authenticated or API responses.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }
  // No response cache is populated by this worker yet; let the browser fetch normally.
});
