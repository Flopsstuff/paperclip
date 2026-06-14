const CACHE_NAME = "paperclip-v3";

// Auth-sensitive / self-referential paths the SW must never intercept.
const PASS_THROUGH = new Set(["/site.webmanifest", "/sw.js"]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API calls, cross-origin requests, and auth-sensitive assets.
  // Returning (not calling respondWith) lets the network handle them untouched.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    PASS_THROUGH.has(url.pathname)
  ) {
    return;
  }

  // Network-first; cache is only an offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Never cache redirected / opaqueredirect responses (auth challenges).
        if (
          response.ok &&
          !response.redirected &&
          response.type !== "opaqueredirect"
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Always resolve to a real Response — never undefined.
        if (request.mode === "navigate") {
          const cached = await caches.match("/");
          return cached || new Response("Offline", { status: 503 });
        }
        const cached = await caches.match(request);
        return cached || new Response("", { status: 504, statusText: "Offline" });
      })
  );
});
