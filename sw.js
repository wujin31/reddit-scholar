// Offline support. The app shell is served from cache and refreshed in the background;
// recipe data is network-first with the cache as a fallback.

const SHELL = "rb-shell-v2";
const SHELL_FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/parser.js", "js/units.js", "js/store.js", "js/timers.js",
  "icons/apple-touch-icon.png", "icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rb-shell-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/recipes/")) {
    // Data: store.js keeps its own offline copy, so just go to the network.
    return;
  }

  // Shell: stale-while-revalidate.
  e.respondWith(caches.open(SHELL).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached ?? fresh;
  }));
});
