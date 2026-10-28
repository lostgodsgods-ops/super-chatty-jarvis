"use strict";
const CACHE_NAME = "redultron-core-shell-v18-unified-deck";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./diagnostics.js"];
const LEGACY_CACHE_PREFIXES = ["redultron-core-shell-", "super-chatty-jarvis-shell-", "super-chatty-jarvis-", "chatty-jarvis-"];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" })));
    } catch (error) { /* Optional shell assets must not block installation. */ }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) =>
      LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && key !== CACHE_NAME
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data && event.data.type === "PURGE_LEGACY_CACHES") {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) =>
        LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && key !== CACHE_NAME
      ).map((key) => caches.delete(key)));
    })());
  }
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope) && "focus" in client) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(request, { cache: "no-store" }));
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put("./index.html", response.clone()).catch(() => {}));
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/manifest.webmanifest") || url.pathname.endsWith("/index.html")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(request, { cache: "no-store" }));
        if (response.ok) return response;
      } catch {}
      return (await caches.match(request)) || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try { return await fetch(request); } catch { return Response.error(); }
  })());
});
