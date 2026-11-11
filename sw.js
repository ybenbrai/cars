// Offline support. Network first for everything, so a new deploy is always
// picked up immediately; the cache is only a fallback when the network is
// unavailable (or slow to the point of failing). API calls are never cached.

const CACHE = 'sunset-drift-v1';
const CDN = ['https://cdn.jsdelivr.net/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.includes('/api/')) return;
  if (!sameOrigin && !CDN.some((prefix) => request.url.startsWith(prefix))) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request, { ignoreSearch: false })
        || (request.mode === 'navigate' ? await caches.match('./index.html') : null);
      if (cached) return cached;
      throw error;
    }
  })());
});
