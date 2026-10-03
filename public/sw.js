/*
 * Studio Flow service worker.
 *
 * Deliberately small. Its job is to make the app installable and to survive a
 * dropped connection — not to be an offline database.
 *
 * THE RULE THAT MATTERS: /api/* is never cached, never served from cache, and
 * never written to cache. This app holds ten agencies' invoices, receipts and
 * client records. A cached API response is stale money on someone's screen, or
 * worse, one tenant's data replayed from a shared cache. Financial figures and
 * permission-filtered payloads must come from the server every time, so the
 * fetch handler returns early for them and lets the network handle it.
 *
 * Everything else is static build output under /_next/static, which is
 * content-hashed and therefore safe to keep forever.
 */

const VERSION = "studio-flow-v2";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // A failed precache must not stop the worker installing — the app
      // works fine online without an offline page.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only. Cross-origin responses are opaque, so caching them
  // stores something we can't inspect or invalidate.
  if (url.origin !== self.location.origin) return;

  // Never touch the API. See the note at the top — this is the whole point.
  if (url.pathname.startsWith("/api/")) return;

  // Uploaded files are per-tenant and can be revoked; leave them alone too.
  if (url.pathname.startsWith("/uploads/")) return;

  // Hashed build output: the filename changes when the content does, so a hit
  // is always correct and a miss only happens once.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Pages: always try the network first, because a page rendered from stale
  // cache would show stale data. Cache is only a fallback for being offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((hit) => hit
        || new Response("You are offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }))),
    );
  }
});

/*
 * ── Web Push ──────────────────────────────────────────────────────────────
 * The server (lib/push.ts) sends a JSON payload { title, body, link }. We show
 * it as a system notification; tapping it focuses an open tab (navigating it to
 * the link) or opens a new one.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || "Studio Flow";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192-maskable.png",
    data: { link: data.link || "/" },
    // Collapse repeats of the same thing instead of stacking the lock screen.
    tag: data.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reuse a tab that's already on this app.
        if (client.url && new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(link).catch(() => {});
          return undefined;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
      return undefined;
    }),
  );
});
