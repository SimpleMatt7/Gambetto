// Service worker di Gambetto: rende l'app installabile e utilizzabile senza rete
// (partite contro il computer, in due sullo stesso schermo, lezioni e aperture).
// Account e partite online passano sempre dalla rete.
const CACHE = 'gambetto-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest', './favicon.svg'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetwork(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(fallbackKey ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) return cached;
    throw error;
  }
}

async function fromCache(request) {
  const cached = await caches.match(request);
  return cached ?? fromNetwork(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  if (request.mode === 'navigate') {
    // La pagina si prende sempre fresca, così gli aggiornamenti arrivano subito; senza rete vale l'ultima salvata.
    event.respondWith(fromNetwork(request, './'));
  } else if (url.pathname.includes('/assets/') || url.pathname.includes('/stockfish/')) {
    // File con impronta o versione nel nome: non cambiano mai, la copia salvata è sempre buona.
    event.respondWith(fromCache(request));
  } else {
    event.respondWith(fromNetwork(request));
  }
});
