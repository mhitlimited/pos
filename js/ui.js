/* ProPOS UI: সাউন্ড, কনফার্মেশন ডায়ালগ, ব্যাক-বাটন গার্ড, Exit, অটো-ব্যাকআপ */
(function () {
  'use strict';

  // =====================================================
  //  1) মিষ্টি ক্লিক সাউন্ড (WebAudio — কোনো ফাইল লাগে না)
  // =====================================================
  const Sound = (function () {
    let ctx = null, last = 0;
    let enabled = localStorage.getItem('propos_sound') !== '0';

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, at, dur, vol) {
      const t0 = ctx.currentTime + at;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }
    function play(kind) {
      if (!enabled || !kind) return;
      const now = Date.now();
      if (kind === 'click' && now - last < 40) return;
      last = now;
      if (!ensure()) return;
      try {
        if (kind === 'click') {            // নরম "টুং"
          tone(1568, 0, 0.14, 0.045);       // G6
          tone(2349, 0.03, 0.12, 0.022);    // D7 (হালকা ঝংকার)
        } else if (kind === 'success') {   // মিষ্টি ৪-নোটের চাইম
          [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.08, 0.28, 0.05));
        } else if (kind === 'warn') {      // নরম সতর্কতা
          tone(659, 0, 0.18, 0.05); tone(523, 0.12, 0.22, 0.05);
        }
      } catch (e) { /* সাউন্ড ব্যর্থ হলে অ্যাপ চলবে */ }
    }
    function setEnabled(v) {
      enabled = !!v;
      localStorage.setItem('propos_sound', enabled ? '1' : '0');
      if (enabled) play('click');
    }
    function isEnabled() { return enabled; }
    return { play, setEnabled, isEnabled };
  })();
  window.Sound = Sound;

  const CLICKABLE = 'button, a, label, select, summary, [onclick], .product-card, .sidebar-link, input[type=checkbox], input[type=radio]';
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest(CLICKABLE);
    if (t && !t.disabled) Sound.play('click');
  }, true);

  // =====================================================
  //  2) কনফার্মেশন ডায়ালগ
  // =====================================================
  let confirmEl = null;
  function closeConfirm() { if (confirmEl) { confirmEl.remove(); confirmEl = null; } }

  window.askConfirm = function (message, onYes, opts) {
    opts = opts || {};
    closeConfirm();
    const el = document.createElement('div');
    el.className = 'ui-confirm-backdrop';
    el.innerHTML =
      '<div class="ui-confirm" role="dialog" aria-modal="true">' +
        '<div class="ui-confirm-icon ' + (opts.danger ? 'danger' : '') + '"><i class="fas ' + (opts.icon || (opts.danger ? 'fa-triangle-exclamation' : 'fa-circle-question')) + '"></i></div>' +
        '<h3></h3><p></p>' +
        '<div class="ui-confirm-actions">' +
          '<button type="button" class="ui-btn-cancel"></button>' +
          '<button type="button" class="ui-btn-yes ' + (opts.danger ? 'danger' : '') + '"></button>' +
        '</div>' +
      '</div>';
    el.querySelector('h3').textContent = opts.title || 'নিশ্চিত করুন';
    el.querySelector('p').textContent = message;
    el.querySelector('.ui-btn-cancel').textContent = opts.no || 'বাতিল';
    el.querySelector('.ui-btn-yes').textContent = opts.yes || 'হ্যাঁ';
    el.querySelector('.ui-btn-cancel').onclick = () => { closeConfirm(); if (opts.onCancel) opts.onCancel(); };
    el.querySelector('.ui-btn-yes').onclick = () => { closeConfirm(); if (onYes) onYes(); };
    el.addEventListener('click', (e) => { if (e.target === el) closeConfirm(); });
    document.body.appendChild(el);
    confirmEl = el;
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeConfirm(); });

  // =====================================================
  //  3) ব্যাক বাটন গার্ড + Exit
  // =====================================================
  let allowExit = false;
  const vis = (id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); };

  function handleBack() {
    if (confirmEl) return closeConfirm();
    if (vis('receipt-modal')) return window.closeReceipt();
    if (vis('checkout-modal')) return window.closeCheckout();
    if (vis('product-modal')) return window.closeProductModal();
    const cart = document.getElementById('mobile-cart');
    if (cart && cart.classList.contains('open')) return window.closeMobileCart();
    const nav = document.getElementById('mobile-nav');
    if (nav && nav.classList.contains('open')) return window.toggleMobileNav();
    if (document.body.dataset.view && document.body.dataset.view !== 'pos') return window.showView('pos');
    window.toast('বের হতে হলে Exit বাটনে ক্লিক করুন');
  }

  try {
    history.replaceState({ propos: 'root' }, '');
    history.pushState({ propos: 'guard' }, '');
  } catch (_) {}
  window.addEventListener('popstate', () => {
    if (allowExit) return;
    try { history.pushState({ propos: 'guard' }, ''); } catch (_) {}
    handleBack();
  });

  let exitScreen = null;
  function showExitScreen(msg, canCancel) {
    if (!exitScreen) {
      exitScreen = document.createElement('div');
      exitScreen.className = 'ui-exit-screen';
      document.body.appendChild(exitScreen);
    }
    exitScreen.innerHTML =
      '<div class="ui-exit-box"><div class="ui-exit-check"><i class="fas fa-check"></i></div>' +
      '<h2>ব্যাকআপ সম্পন্ন</h2><p></p>' +
      (canCancel ? '<button type="button" class="ui-btn-yes">অ্যাপে ফিরে যান</button>' : '') + '</div>';
    exitScreen.querySelector('p').textContent = msg;
    const b = exitScreen.querySelector('button');
    if (b) b.onclick = cancelExit;
  }
  function cancelExit() {
    allowExit = false;
    try { history.pushState({ propos: 'guard' }, ''); } catch (_) {}
    if (exitScreen) { exitScreen.remove(); exitScreen = null; }
  }

  function exitApp() {
    window.askConfirm(
      'সফটওয়্যার থেকে বের হবেন? বের হওয়ার সময় সব ডেটার ব্যাকআপ ফাইল স্বয়ংক্রিয়ভাবে ডাউনলোড হবে।',
      () => {
        try { window.exportData(true); } catch (e) { console.error(e); }
        allowExit = true;
        showExitScreen('ব্যাকআপ ফাইল ডাউনলোড হয়েছে। অ্যাপ বন্ধ হচ্ছে...', false);
        setTimeout(() => {
          try { window.close(); } catch (_) {}
          setTimeout(() => {
            // window.close() কাজ না করলে — গার্ড সরিয়ে ব্যাক চাপলেই বের হওয়া যাবে
            showExitScreen('ব্যাকআপ হয়ে গেছে। এখন ফোনের Back বা Home চাপলে অ্যাপ বন্ধ হবে।', true);
            try { history.back(); } catch (_) {}
          }, 600);
        }, 800);
      },
      { title: 'Exit', yes: 'ব্যাকআপ নিয়ে বের হোন', icon: 'fa-power-off', danger: true }
    );
  }

  // =====================================================
  //  4) অটো ব্যাকআপ (অ্যাপ বন্ধ / লুকানো হলে) + বাকি ব্যাকআপ রিমাইন্ডার
  // =====================================================
  function hasData() { return (typeof products !== 'undefined' && products.length) || (typeof sales !== 'undefined' && sales.length); }
  function autoBackup() {
    try {
      if (allowExit) return;
      if (localStorage.getItem('propos_dirty') !== '1' || !hasData()) return;
      const lastAuto = parseInt(localStorage.getItem('propos_auto_at') || '0', 10);
      if (Date.now() - lastAuto < 5 * 60 * 1000) return;
      localStorage.setItem('propos_auto_at', String(Date.now()));
      window.exportData(true);
    } catch (e) { console.error(e); }
  }
  window.addEventListener('pagehide', autoBackup);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoBackup(); });

  function checkPendingBackup() {
    if (localStorage.getItem('propos_dirty') !== '1' || !hasData()) return;
    setTimeout(() => {
      if (document.getElementById('ui-backup-bar')) return;
      const bar = document.createElement('div');
      bar.id = 'ui-backup-bar';
      bar.className = 'ui-backup-bar';
      bar.innerHTML = '<span>💾 শেষ ব্যাকআপের পর ডেটা বদলেছে</span><div><button type="button" class="b-now">এখনই ব্যাকআপ</button><button type="button" class="b-later">পরে</button></div>';
      bar.querySelector('.b-now').onclick = () => { window.exportData(); bar.remove(); };
      bar.querySelector('.b-later').onclick = () => bar.remove();
      document.body.appendChild(bar);
    }, 1500);
  }

  // =====================================================
  //  5) মডাল খোলা থাকলে পেছনের স্ক্রল বন্ধ
  // =====================================================
  function syncScrollLock() {
    const open = ['receipt-modal', 'checkout-modal', 'product-modal'].some(vis) ||
      ['mobile-cart', 'mobile-nav'].some((id) => { const e = document.getElementById(id); return e && e.classList.contains('open'); });
    document.body.classList.toggle('no-scroll', open);
  }
  document.addEventListener('DOMContentLoaded', () => {
    const obs = new MutationObserver(syncScrollLock);
    ['receipt-modal', 'checkout-modal', 'product-modal', 'mobile-cart', 'mobile-nav'].forEach((id) => {
      const e = document.getElementById(id);
      if (e) obs.observe(e, { attributes: true, attributeFilter: ['class'] });
    });
    const t = document.getElementById('sound-toggle');
    if (t) t.checked = Sound.isEnabled();
  });

  window.UI = { exitApp, checkPendingBackup };
})();
