/* ProPOS Service Worker
   নতুন ভার্সন দিলে শুধু CACHE_VERSION নম্বর বাড়ান (v1 -> v2) */
const CACHE_VERSION = 'v5';
const APP_CACHE = `propos-app-${CACHE_VERSION}`;
const CDN_CACHE = `propos-cdn-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './js/app.js',
  './js/tailwind-config.js',
  './js/pwa.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

// CDN থেকে আসা লাইব্রেরি (Tailwind, FontAwesome, Google Fonts)
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      // একটি ফাইল ব্যর্থ হলেও পুরো ইনস্টল যেন বাতিল না হয়
      .then((cache) => Promise.all(APP_SHELL.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('propos-') && k !== APP_CACHE && k !== CDN_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // পেজ নেভিগেশন: নেটওয়ার্ক না থাকলে index.html দেখাবে
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // নিজের ফাইল: cache আগে, পাশাপাশি ব্যাকগ্রাউন্ডে আপডেট
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, APP_CACHE));
    return;
  }

  // CDN ফাইল: cache আগে, পাশাপাশি ব্যাকগ্রাউন্ডে আপডেট
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
  }
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}
