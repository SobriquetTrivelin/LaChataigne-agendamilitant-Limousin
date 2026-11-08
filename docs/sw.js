/* La Châtaigne — service worker : fonctionne hors-ligne. La version est mise à jour
   automatiquement par tools/build.py (ne pas modifier à la main). Licence : AGPL-3.0-or-later. */
const VERSION = '87af50a596';
const CACHE = 'chataigne-' + VERSION;
const COQUILLE = ['./', 'index.html', 'style.css', 'app.js', 'ics.js', 'manifest.webmanifest',
  'icons/chataigne.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'data/config.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(COQUILLE);
    // données + affiches (meilleur effort) pour un usage complet hors-ligne
    try {
      const rep = await fetch('data/evenements.json', { cache: 'no-cache' });
      await cache.put('data/evenements.json', rep.clone());
      const doc = await rep.json();
      const affiches = new Set(doc.evenements.flatMap((e) => e.affiches || []));
      await Promise.allSettled([...affiches, 'agenda.ics'].map((u) => cache.add(u)));
    } catch (_) { /* hors-ligne à l'installation : sans gravité */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n.startsWith('chataigne-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const frais = url.pathname.endsWith('/evenements.json') || url.pathname.endsWith('/agenda.ics');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (frais) {                       // réseau d'abord : on veut les nouveautés du mois
      try {
        const rep = await fetch(req, { cache: 'no-cache' });
        if (rep.ok) cache.put(req, rep.clone());
        return rep;
      } catch (_) { return (await cache.match(req)) || Response.error(); }
    }
    const enCache = await cache.match(req, { ignoreSearch: true });
    if (enCache) return enCache;       // le reste : cache d'abord
    try {
      const rep = await fetch(req);
      if (rep.ok) cache.put(req, rep.clone());
      return rep;
    } catch (_) {
      return req.mode === 'navigate' ? (await cache.match('index.html')) || Response.error() : Response.error();
    }
  })());
});
