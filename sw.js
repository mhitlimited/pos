/* ProPOS Service Worker — network-first, aggressive cache refresh (v9)
   App data lives in localStorage + optional Google Drive.
   SW cache is only a short offline fallback and is replaced on every deploy. */
const CACHE_VERSION = 'v9';
const APP_CACHE = `propos-app-${CACHE_VERSION}`;
const CDN_CACHE = `propos-cdn-${CACHE_VERSION}`;

const APP_SHELL = [
  './', './index.html', './privacy.html', './terms.html', './style.css', './manifest.webmanifest',
  './js/core.js', './js/ui.js', './js/app.js', './js/people.js', './js/misc.js', './js/settings.js',
  './js/config.js', './js/cloud.js', './js/pwa.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  // Take over immediately so users never stay on a broken old SW
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then(cache =>
      Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Delete every old propos cache — keep only current version
    await Promise.all(
      keys
        .filter(k => k.startsWith('propos-') && k !== APP_CACHE && k !== CDN_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data;
  if (data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('propos-')).map(k => caches.delete(k)));
      const cache = await caches.open(APP_CACHE);
      await Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => null)));
    })());
  }
});

/** Network-first: always try network, fall back to cache only if offline */
function networkFirst(request, cacheName) {
  return fetch(request)
    .then(res => {
      if (res && res.ok && (request.method === 'GET')) {
        const copy = res.clone();
        caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.open(cacheName).then(c => c.match(request).then(r => r || caches.match('./index.html'))));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigations: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin app assets (JS/CSS/HTML/icons): network-first so updates are never stuck
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, APP_CACHE));
    return;
  }

  // CDN: network-first with cache fallback
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(req, CDN_CACHE));
  }
});
