/* PWA: Service Worker, install prompt, update bar, offline badge, persistent storage */
(function () {
  'use strict';

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const hadController = !!navigator.serviceWorker.controller;
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

        if (reg.waiting && hadController) showUpdateBar(reg.waiting);

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBar(nw);
            }
          });
        });

        // Reload once when new SW takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing || !hadController) return;
          refreshing = true;
          location.reload();
        });

        // Periodic update check (every 30 min while tab open)
        setInterval(() => { try { reg.update(); } catch (_) {} }, 30 * 60 * 1000);
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
      '<div class="msg">New version available<small>Update for the latest features and fixes</small></div>' +
      '<button type="button">Update</button>';
    bar.querySelector('button').onclick = () => {
      try { worker.postMessage('SKIP_WAITING'); } catch (_) {}
      // Fallback reload if controllerchange does not fire
      setTimeout(() => location.reload(), 800);
    };
    document.body.appendChild(bar);
  }

  // ---------- Persistent storage ----------
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

  // ---------- Display mode / standalone polish ----------
  try {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      document.documentElement.classList.add('pwa-standalone');
    }
  } catch (_) {}
})();
