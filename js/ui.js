/* ProPOS UI: সাউন্ড, ডায়ালগ, মডাল, Theme, Backup, Share/Print হেল্পার */
(function () {
  'use strict';
  const { DB, esc, toast, saveAll, load, K } = Core;

  // ================= সাউন্ড =================
  const Sound = (function () {
    let ctx = null, last = 0;
    let enabled = true; try { enabled = localStorage.getItem('propos_sound') !== '0'; } catch (_) {}
    function ensure() {
      if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, at, dur, vol) {
      const t0 = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.03);
    }
    function play(kind) {
      if (!enabled || !kind) return;
      const now = Date.now(); if (kind === 'click' && now - last < 40) return; last = now;
      if (!ensure()) return;
      try {
        if (kind === 'click') { tone(1568, 0, 0.14, 0.045); tone(2349, 0.03, 0.12, 0.022); }
        else if (kind === 'success') [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.08, 0.28, 0.05));
        else if (kind === 'warn') { tone(659, 0, 0.18, 0.05); tone(523, 0.12, 0.22, 0.05); }
        else if (kind === 'beep') tone(1800, 0, 0.12, 0.08);
      } catch (e) {}
    }
    return { play, isEnabled: () => enabled, setEnabled(v) { enabled = !!v; try { localStorage.setItem('propos_sound', enabled ? '1' : '0'); } catch (_) {} if (enabled) play('click'); } };
  })();
  window.Sound = Sound;
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('button, a, label, select, summary, [onclick], .pcard, .nav-link, .row, input[type=checkbox], input[type=radio]');
    if (t && !t.disabled) Sound.play('click');
  }, true);

  // ================= কনফার্মেশন =================
  let confirmEl = null;
  function closeConfirm() { if (confirmEl) { confirmEl.remove(); confirmEl = null; } }
  window.askConfirm = function (message, onYes, o) {
    o = o || {}; closeConfirm();
    const el = document.createElement('div'); el.className = 'ui-confirm-backdrop';
    el.innerHTML = '<div class="ui-confirm" role="dialog" aria-modal="true"><div class="ui-confirm-icon ' + (o.danger ? 'danger' : '') + '"><i class="fas ' + (o.icon || (o.danger ? 'fa-triangle-exclamation' : 'fa-circle-question')) + '"></i></div><h3></h3><p></p><div class="ui-confirm-actions"><button type="button" class="btn n"></button><button type="button" class="btn y ' + (o.danger ? 'btn-bad' : 'btn-primary') + '"></button></div></div>';
    el.querySelector('h3').textContent = o.title || 'Confirm';
    el.querySelector('p').textContent = message;
    el.querySelector('.n').textContent = o.no || 'Cancel'; el.querySelector('.y').textContent = o.yes || 'Yes';
    el.querySelector('.n').onclick = () => { closeConfirm(); o.onCancel && o.onCancel(); };
    el.querySelector('.y').onclick = () => { closeConfirm(); onYes && onYes(); };
    el.addEventListener('click', e => { if (e.target === el) closeConfirm(); });
    document.body.appendChild(el); confirmEl = el;
  };
  window.hasConfirm = () => !!confirmEl; window.closeConfirm = closeConfirm;

  // ================= মডাল =================
  const Modal = {
    stack: [],
    open(o) {
      const el = document.createElement('div'); el.className = 'modal-back';
      el.innerHTML = '<div class="modal-sheet ' + (o.size || '') + '"><div class="modal-head"><h3>' + esc(o.title || '') + '</h3><button type="button" class="icon-btn" data-x><i class="fas fa-xmark"></i></button></div><div class="modal-body">' + (o.body || '') + '</div>' + (o.foot ? '<div class="modal-foot">' + o.foot + '</div>' : '') + '</div>';
      el.querySelector('[data-x]').onclick = () => Modal.close(el);
      if (!o.static) el.addEventListener('mousedown', e => { if (e.target === el) Modal.close(el); });
      el._onClose = o.onClose;
      document.body.appendChild(el); Modal.stack.push(el); syncLock();
      const f = el.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60);
      return el;
    },
    close(el) {
      el = el || Modal.stack[Modal.stack.length - 1]; if (!el) return;
      const i = Modal.stack.indexOf(el); if (i >= 0) Modal.stack.splice(i, 1);
      el.remove(); syncLock(); el._onClose && el._onClose();
    },
    closeFrom(node) { const el = node.closest('.modal-back'); if (el) Modal.close(el); },
    closeAll() { while (Modal.stack.length) Modal.close(); },
    top() { return Modal.stack[Modal.stack.length - 1]; }
  };
  window.Modal = Modal;
  function syncLock() {
    const drawerOpen = !!document.querySelector('.drawer.open');
    document.body.classList.toggle('no-scroll', Modal.stack.length > 0 || drawerOpen || !!document.querySelector('.scan,.lock'));
  }
  window.syncLock = syncLock;

  // ================= Theme (লাইট/ডার্ক/অটো) =================
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const Theme = {
    mode: (function () { try { return localStorage.getItem('propos_theme') || 'auto'; } catch (_) { return 'auto'; } })(),
    isDark() { return this.mode === 'dark' || (this.mode === 'auto' && mq && mq.matches); },
    apply() {
      document.documentElement.classList.toggle('dark', this.isDark());
      const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = this.isDark() ? '#0a1020' : '#4f46e5';
      document.querySelectorAll('.theme-ico').forEach(i => { i.className = 'theme-ico fas ' + (this.isDark() ? 'fa-sun' : 'fa-moon'); });
      const s = document.getElementById('theme-select'); if (s) s.value = this.mode;
    },
    set(mode) { this.mode = mode; try { localStorage.setItem('propos_theme', mode); } catch (_) {} this.apply(); },
    toggle() { this.set(this.isDark() ? 'light' : 'dark'); }
  };
  window.Theme = Theme;
  if (mq && mq.addEventListener) mq.addEventListener('change', () => Theme.mode === 'auto' && Theme.apply());
  document.addEventListener('DOMContentLoaded', () => Theme.apply());
  Theme.apply();

  // ================= Backup / Restore =================
  let lastExport = 0;
  window.exportData = function (silent, force) {
    // Local file backup removed — shop data is backed up via Google Drive only.
    // silent/force kept for API compatibility; does not download a file.
    if (silent && !force) return;
    if (!force) return;
    // force=true still allows emergency wipe path to snapshot nothing extra
    try { localStorage.setItem('propos_last_backup', String(Date.now())); localStorage.removeItem('propos_dirty'); } catch (_) {}
  };
  window.importData = function (input) {
    const file = input.files && input.files[0]; input.value = ''; if (!file) return;
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        if (!d || !Array.isArray(d.products)) throw new Error('bad');
        askConfirm(`Backup has ${d.products.length} products, ${(d.sales || []).length} sales, ${(d.customers || []).length} customers. Current data will be replaced.`, () => {
          Object.keys(K).forEach(k => { if (k === 'settings') DB.settings = Object.assign({}, Core.DEFAULTS, d.settings || {}); else if (k === 'cart') DB.cart = []; else DB[k] = Array.isArray(d[k]) ? d[k] : []; });
          Core.migrate(); saveAll(); toast('Restore successful ✓'); setTimeout(() => location.reload(), 700);
        }, { title: 'Restore backup?', yes: 'Yes, restore', danger: true });
      } catch (err) { toast('⚠️ Not a valid ProPOS backup file'); }
    };
    rd.onerror = () => toast('Could not read file'); rd.readAsText(file);
  };
  window.wipeAllData = function () {
    askConfirm('All data (products, sales, customers, expenses...) will be permanently deleted.', () => {
      askConfirm('Really delete all data? This cannot be undone!', () => {
        exportData(true, true);
        setTimeout(() => { Object.values(K).forEach(k => localStorage.removeItem(k)); ['propos_last_backup', 'propos_dirty'].forEach(k => localStorage.removeItem(k)); location.reload(); }, 900);
      }, { title: 'Final confirmation', yes: 'Yes, delete all', danger: true });
    }, { title: 'Delete all data?', yes: 'Continue', danger: true });
  };

  // Local file backup removed — cloud backup only (Google Drive)
  window.checkPendingBackup = function () {};

  // ================= Share / Print হেল্পার =================
  window.phoneIntl = function (p) {
    let d = String(p || '').replace(/\D/g, ''); if (!d) return '';
    if (d.startsWith('880')) return d; if (d.startsWith('0')) return '88' + d; return '880' + d;
  };
  window.shareWA = function (phone, text) { const n = phoneIntl(phone); window.open('https://wa.me/' + (n || '') + '?text=' + encodeURIComponent(text), '_blank', 'noopener'); };
  window.shareSMS = function (phone, text) { location.href = 'sms:' + (phone || '') + '?body=' + encodeURIComponent(text); };
  window.printHTML = function (html) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Could not print'); } setTimeout(() => f.remove(), 2000); }, 400);
  };
})();
