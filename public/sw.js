/* StayShare service worker — app shell + offline fallback. Never caches /api. */
const VERSION = "ss-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/images/placeholder-room.svg", "/images/placeholder-building.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API responses (auth, prices, availability must always be live).
  if (url.pathname.startsWith("/api/")) return;

  // Pages: network-first, fall back to the cached copy, then the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic" && !url.pathname.startsWith("/account") && !url.pathname.startsWith("/checkout") && !url.pathname.startsWith("/pay")) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Build assets are content-hashed: cache-first.
  if (url.pathname.startsWith("/_next/static/") || SHELL_ASSETS.includes(url.pathname) || url.pathname.startsWith("/images/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
