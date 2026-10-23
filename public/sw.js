// Tripanize service worker: read-only offline support.
// - Static assets are cached for offline use.
// - Trip snapshots (/api/trips/:id/snapshot) are cached by the page while online and served when offline.
// - Page navigations fall back to /offline when the network is unavailable.
// - Mutations are never queued: editing requires a connection (the UI says so).
const STATIC = "tripanize-static-v6";
const SNAPSHOTS = "tripanize-trip-snapshots";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(["/offline", "/icon.svg", "/manifest.webmanifest", "/brand/tripanize-mark.png", "/brand/tripanize-wordmark.png", "/brand/tripanize-favicon-transparent.png", "/brand/tripanize-icon-180.png", "/brand/tripanize-icon-192.png", "/brand/tripanize-icon-512.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "clear") e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/brand/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }

  if (/^\/api\/trips\/[^/]+\/snapshot$/.test(url.pathname)) {
    e.respondWith(fetch(req).catch(() => caches.open(SNAPSHOTS).then((c) => c.match(url.pathname)).then((r) => r || new Response(JSON.stringify({ error: "offline" }), { status: 503 }))));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.open(STATIC).then((c) => c.match("/offline")).then((r) => r || Response.error())));
  }
});
