const CACHE = "vela-studio-shell-v3";
const ROOT = self.registration.scope;
const SHELL = [ROOT, "index.html", "styles.css?v=3", "app.js", "manifest.webmanifest", "icon.svg"].map((path) => new URL(path, ROOT).href);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || /\/api\//.test(url.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(ROOT, copy)); return response;
    }).catch(() => caches.match(ROOT)));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); return response;
  }).catch(() => caches.match(request)));
});
