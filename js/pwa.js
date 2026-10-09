/* PWA: Service Worker রেজিস্টার + ইনস্টল বাটন + আপডেট নোটিফিকেশন */
(function () {
  'use strict';

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBar(nw);
            }
          });
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          location.reload();
        });
      } catch (err) {
        console.warn('Service Worker রেজিস্টার হয়নি:', err);
      }
    });
  }

  // ---------- Install Button ----------
  let deferredPrompt = null;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function makeBtn() {
    if (document.getElementById('pwa-install-btn') || isStandalone) return null;
    const b = document.createElement('button');
    b.id = 'pwa-install-btn';
    b.type = 'button';
    b.innerHTML = '<i class="fa-solid fa-download"></i> অ্যাপ ইনস্টল করুন';
    b.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));' +
      'z-index:9999;background:#4f46e5;color:#fff;border:0;border-radius:999px;padding:12px 22px;' +
      'font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(79,70,229,.4);cursor:pointer;display:none';
    document.body.appendChild(b);
    return b;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = makeBtn();
    if (!btn) return;
    btn.style.display = 'block';
    btn.onclick = async () => {
      btn.style.display = 'none';
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    };
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
    deferredPrompt = null;
  });

  // ---------- Update Bar ----------
  function showUpdateBar(worker) {
    if (document.getElementById('pwa-update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-update-bar';
    bar.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:10000;' +
      'background:#0f172a;color:#fff;border-radius:14px;padding:12px 16px;display:flex;gap:12px;' +
      'align-items:center;justify-content:space-between;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35)';
    bar.innerHTML =
      '<span>নতুন ভার্সন পাওয়া গেছে</span>' +
      '<button style="background:#6366f1;color:#fff;border:0;border-radius:10px;padding:8px 14px;font-weight:600;cursor:pointer">আপডেট</button>';
    bar.querySelector('button').onclick = () => worker.postMessage('SKIP_WAITING');
    document.body.appendChild(bar);
  }

  // ---------- Persistent storage (ব্রাউজার যেন ডেটা নিজে থেকে না মুছে) ----------
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // ---------- Online / Offline badge ----------
  function updateNet() {
    let b = document.getElementById('net-badge');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'net-badge';
      b.textContent = '● অফলাইন মোড';
      b.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);' +
        'z-index:10001;background:#f59e0b;color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;' +
        'box-shadow:0 4px 12px rgba(0,0,0,.2);pointer-events:none';
      document.body.appendChild(b);
    }
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  document.addEventListener('DOMContentLoaded', updateNet);
})();
