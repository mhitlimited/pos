/* PWA: network-first updates, auto cache clear, install + offline badge */
(function () {
  'use strict';

  async function clearOldCaches() {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      const keep = keys.filter(k => !k.startsWith('propos-') || k.indexOf('v9') !== -1);
      // Delete all propos caches except current v9 — forces fresh assets next load
      await Promise.all(
        keys.filter(k => k.startsWith('propos-') && k.indexOf('v9') === -1).map(k => caches.delete(k))
      );
    } catch (_) {}
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await clearOldCaches();

        const hadController = !!navigator.serviceWorker.controller;
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

        // Always check for updates on load
        try { await reg.update(); } catch (_) {}

        if (reg.waiting && hadController) showUpdateBar(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              // Auto-activate new SW (skipWaiting already in install) + soft reload prompt
              showUpdateBar(nw);
            }
          });
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing || !hadController) return;
          refreshing = true;
          // Clear any leftover caches then reload once
          clearOldCaches().finally(() => location.reload());
        });

        // Periodic update check
        setInterval(() => { try { reg.update(); } catch (_) {} }, 15 * 60 * 1000);

        // Tell SW to clear stale caches when page becomes visible
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            try { reg.update(); } catch (_) {}
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage('CLEAR_CACHES');
            }
          }
        });
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
    });
  }

  // ---------- Install button ----------
  let deferredPrompt = null;

  function makeInstallBtn() {
    let b = document.getElementById('pwa-install-btn');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'pwa-install-btn';
    b.type = 'button';
    b.className = 'pwa-install-btn';
    b.innerHTML = '<i class="fa-solid fa-download"></i> Install app';
    b.style.display = 'none';
    document.body.appendChild(b);
    return b;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = makeInstallBtn();
    if (!btn) return;
    btn.style.display = 'flex';
    btn.onclick = async () => {
      btn.style.display = 'none';
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) {}
      deferredPrompt = null;
    };
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
    deferredPrompt = null;
  });

  // ---------- Update bar ----------
  function showUpdateBar(worker) {
    if (document.getElementById('pwa-update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-update-bar';
    bar.className = 'pwa-update-bar';
    bar.innerHTML =
      '<div class="msg">New version available<small>Tap update to load the latest app</small></div>' +
      '<button type="button">Update</button>';
    bar.querySelector('button').onclick = () => {
      try {
        if (worker && worker.postMessage) worker.postMessage('SKIP_WAITING');
      } catch (_) {}
      clearOldCaches().finally(() => setTimeout(() => location.reload(), 400));
    };
    document.body.appendChild(bar);
  }

  // ---------- Persistent storage for shop data (not SW cache) ----------
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // ---------- Online / Offline badge ----------
  function updateNet() {
    let b = document.getElementById('net-badge');
    if (navigator.onLine) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      b = document.createElement('div');
      b.id = 'net-badge';
      b.textContent = '● Offline mode';
      document.body.appendChild(b);
    }
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  document.addEventListener('DOMContentLoaded', updateNet);

  try {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      document.documentElement.classList.add('pwa-standalone');
    }
  } catch (_) {}
})();
