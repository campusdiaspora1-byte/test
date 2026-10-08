// Service worker de Your Own Duel : rend le site installable et garde en cache les fichiers fixes.
// Le jeu lui-même (/api) passe toujours par le réseau.
const CACHE = "yod-v2";
const SHELL = ["/", "/app.js", "/style.css", "/strings.json", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api")) return;
  // Textes et images des cartes : depuis le cache s'ils y sont (ils ne changent pas)
  if (u.pathname.startsWith("/t/") || u.pathname.startsWith("/hm/") || u.pathname === "/index-cards.json") {
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Le reste : réseau d'abord (pour toujours avoir la dernière version), cache si hors ligne
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/"))));
});
