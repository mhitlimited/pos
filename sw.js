/* ProPOS Service Worker — নতুন ভার্সন দিলে CACHE_VERSION বাড়ান */
const CACHE_VERSION = 'v8';
const APP_CACHE = `propos-app-${CACHE_VERSION}`;
const CDN_CACHE = `propos-cdn-${CACHE_VERSION}`;
const APP_SHELL = ['./', './index.html', './privacy.html', './terms.html', './style.css', './manifest.webmanifest',
  './js/core.js', './js/ui.js', './js/app.js', './js/people.js', './js/misc.js', './js/settings.js', './js/config.js', './js/cloud.js', './js/pwa.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE)
    .then(c => Promise.all(APP_SHELL.map(u => c.add(u).catch(() => null)))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('propos-') && k !== APP_CACHE && k !== CDN_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const req = event.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    const isApp = /\/(index\.html)?$/.test(url.pathname);
    event.respondWith(fetch(req).then(res => {
      if (res && res.ok && url.origin === self.location.origin) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(isApp ? './index.html' : req, copy)); }
      return res;
    }).catch(() => (isApp ? caches.match('./index.html') : caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))));
    return;
  }
  if (url.origin === self.location.origin) { event.respondWith(swr(req, APP_CACHE)); return; }
  if (CDN_HOSTS.includes(url.hostname)) event.respondWith(swr(req, CDN_CACHE));
});
function swr(request, name) {
  return caches.open(name).then(cache => cache.match(request).then(cached => {
    const net = fetch(request).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
}
