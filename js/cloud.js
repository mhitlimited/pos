/* ProPOS Cloud — Google সাইন-ইন + Google Drive (গোপন appDataFolder) অটো Backup  & Restore
   • শুধু drive.appdata স্কোপ: অ্যাপ আপনার অন্য কোনো ড্রাইভ ফাইল দেখতে পায় না
   • ব্রাউজারের ডেটা মুছে গেলে & আবার Sign in করলেই All ডেটা ফিরে আসে */
(function () {
  'use strict';
  const C = Core, DB = C.DB, K = C.K, esc = C.esc, toast = C.toast;
  const LS = localStorage;
  const $ = id => document.getElementById(id);

  const KEY = { on: 'propos_g_on', email: 'propos_g_email', name: 'propos_g_name', pic: 'propos_g_pic', rev: 'propos_g_rev', fid: 'propos_g_fid',
    last: 'propos_g_last', snap: 'propos_g_snap', dirty: 'propos_g_dirty', welcomed: 'propos_welcomed', client: 'propos_g_client', tok: 'propos_g_tok' };
  const MAIN = 'propos-data.json', SNAP = 'propos-snap-', KEEP_SNAPS = 14;
  const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  const get = k => { try { return LS.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { LS.setItem(k, v); } catch (_) {} };
  const del = k => { try { LS.removeItem(k); } catch (_) {} };
  const isOn = () => get(KEY.on) === '1';
  const clientId = () => ((window.PROPOS_CONFIG && window.PROPOS_CONFIG.googleClientId) || get(KEY.client) || '').trim();
  const hasLocal = () => !!(DB.products.length || DB.sales.length || DB.customers.length || DB.suppliers.length || DB.expenses.length);
  const mk = (code, status) => { const e = new Error(code); e.code = code; e.status = status; return e; };

  const S = { status: 'off', busy: false, applying: false, timer: null, tok: null, exp: 0, authP: null, lastTry: 0, seq: 0, gis: null };
  try { const t = JSON.parse(sessionStorage.getItem(KEY.tok) || 'null'); if (t && t.exp > Date.now() + 60000) { S.tok = t.t; S.exp = t.exp; } } catch (_) {}
  const validTok = () => !!S.tok && Date.now() < S.exp - 60000;

  // ---------- Google Identity Services ----------
  function loadGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (S.gis) return S.gis;
    S.gis = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { S.gis = null; rej(mk('offline')); };
      document.head.appendChild(s);
    });
    return S.gis;
  }
  function setTok(t, sec) {
    S.tok = t; S.exp = Date.now() + (Number(sec) || 3600) * 1000;
    try { sessionStorage.setItem(KEY.tok, JSON.stringify({ t: S.tok, exp: S.exp })); } catch (_) {}
  }
  // interactive=true হলে পপআপ খোলে (শুধু ইউজারের ট্যাপ from ডাকুন)
  function requestToken(interactive, pick) {
    if (validTok()) return Promise.resolve(S.tok);
    if (!interactive) return Promise.reject(mk('auth'));
    if (S.authP) return S.authP;
    S.lastTry = Date.now();
    S.authP = (async () => {
      if (!clientId()) throw mk('noclient');
      try { await loadGIS(); } catch (_) { throw mk('offline'); }
      return new Promise((resolve, reject) => {
        const cl = google.accounts.oauth2.initTokenClient({
          client_id: clientId(), scope: SCOPE,
          callback: r => { if (r.error) return reject(mk(r.error)); setTok(r.access_token, r.expires_in); resolve(S.tok); },
          error_callback: e => reject(mk((e && e.type) || 'popup_closed'))
        });
        const o = { prompt: pick ? 'select_account' : '' };
        const hint = get(KEY.email); if (hint && !pick) o.hint = hint;
        cl.requestAccessToken(o);
      });
    })();
    S.authP.then(() => { S.authP = null; }, () => { S.authP = null; });
    return S.authP;
  }

  // ---------- Drive API ----------
  async function api(url, opt, noRetry) {
    if (!navigator.onLine) throw mk('offline');
    const t = await requestToken(false);
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + t }, (opt && opt.headers) || {}) }));
    if (r.status === 401 && !noRetry) { S.tok = null; S.exp = 0; try { sessionStorage.removeItem(KEY.tok); } catch (_) {} throw mk('auth', 401); }
    if (!r.ok) throw mk('http', r.status);
    return r;
  }
  async function listFiles(q) {
    const u = DRIVE + '?' + new URLSearchParams({ spaces: 'appDataFolder', pageSize: '100', orderBy: 'modifiedTime desc', fields: 'files(id,name,modifiedTime,size)', q });
    return ((await (await api(u)).json()).files) || [];
  }
  const findMain = async () => (await listFiles("name = '" + MAIN + "' and trashed = false"))[0] || null;
  const getMeta = async id => { const j = await (await api(DRIVE + '/' + id + '?fields=id,modifiedTime')).json(); if (!j || !j.id) throw mk('http', 404); return j; };
  const download = async id => (await api(DRIVE + '/' + id + '?alt=media')).json();
  async function writeMain(fid, text) {
    const b = 'pp' + Date.now().toString(36);
    const meta = fid ? {} : { name: MAIN, parents: ['appDataFolder'] };
    const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + b + '--';
    const r = await api((fid ? UPLOAD + '/' + fid : UPLOAD) + '?uploadType=multipart&fields=id,modifiedTime',
      { method: fid ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    return r.json();
  }
  const copyFile = (id, name) => api(DRIVE + '/' + id + '/copy?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: ['appDataFolder'] }) });

  // দিনে একবার (প্রথম আপলোডের আগে) আগের অবস্থার স্ন্যাপশট — ভুলে ডেটা মুছে গেলে & পুরনো দিনের কপি থাকে
  async function snapshotBefore(f, tag) {
    const day = C.todayKey();
    if (!tag && get(KEY.snap) === day) return;
    try {
      const name = SNAP + (tag || day) + '.json';
      const ex = await listFiles("name = '" + name + "' and trashed = false");
      if (!ex.length) await copyFile(f.id, name);
      if (!tag) set(KEY.snap, day);
      const all = (await listFiles("name contains '" + SNAP + "' and trashed = false")).sort((a, b) => a.name < b.name ? 1 : -1);
      for (const x of all.slice(KEEP_SNAPS)) { try { await api(DRIVE + '/' + x.id, { method: 'DELETE' }); } catch (_) {} }
    } catch (e) { console.warn('[Cloud] snapshot', e); }
  }

  // ---------- ডেটা ----------
  function payload() {
    const out = { app: 'ProPOS', version: 4, exportDate: new Date().toISOString(), device: (navigator.platform || '') };
    Object.keys(K).forEach(k => { if (k !== 'cart') out[k] = k === 'settings' ? DB.settings : DB[k]; });
    return out;
  }
  const sum = d => ({ p: (d.products || []).length, s: (d.sales || []).length, c: (d.customers || []).length });
  function applyRemote(d, f, pushAfter) {
    if (!d || !Array.isArray(d.products)) throw mk('badfile');
    S.applying = true;
    Object.keys(K).forEach(k => {
      if (k === 'settings') DB.settings = Object.assign({}, C.DEFAULTS, d.settings || {});
      else if (k === 'cart') DB.cart = [];
      else DB[k] = Array.isArray(d[k]) ? d[k] : [];
    });
    C.migrate(); C.saveAll();
    set(KEY.rev, f.modifiedTime); set(KEY.fid, f.id); set(KEY.last, String(Date.now()));
    if (pushAfter) set(KEY.dirty, '1'); else del(KEY.dirty);
    del('propos_dirty');
    toast('✓ Data restored from cloud');
    setTimeout(() => location.reload(), 900);
  }

  // ---------- সিঙ্ক ----------
  function markDirty() {
    if (!isOn() || S.applying) return;
    set(KEY.dirty, '1'); S.seq++;
    if (S.status !== 'syncing' && S.status !== 'auth' && S.status !== 'offline') setStatus('pending'); else renderUI();
    clearTimeout(S.timer); S.timer = setTimeout(() => push(), 12000);
  }
  async function push(force) {
    if (!isOn() || S.busy || S.applying || !hasLocal()) return;
    clearTimeout(S.timer);
    if (!validTok()) { setStatus(navigator.onLine ? 'auth' : 'offline'); return; }
    S.busy = true; setStatus('syncing'); const seq = S.seq;
    try {
      let f = null; const cached = get(KEY.fid);
      if (cached) { try { f = await getMeta(cached); } catch (e) { if (e.status !== 404) throw e; } }
      if (!f) f = await findMain();
      if (f && !force && get(KEY.rev) !== f.modifiedTime) { S.busy = false; setStatus('pending'); await conflict(f); return; }
      if (f) await snapshotBefore(f);
      const res = await writeMain(f ? f.id : null, JSON.stringify(payload()));
      set(KEY.fid, res.id); set(KEY.rev, res.modifiedTime); set(KEY.last, String(Date.now()));
      if (S.seq === seq) { del(KEY.dirty); del('propos_dirty'); setStatus('ok'); }
      else { setStatus('pending'); S.timer = setTimeout(() => push(), 3000); }
    } catch (e) { fail(e); }
    finally { S.busy = false; }
  }
  // ইউজারের ট্যাপ from: টোকেন নবায়ন + সিঙ্ক
  async function syncNow() {
    if (!isOn()) return signIn();
    try { setStatus('syncing'); await requestToken(true); } catch (e) { return fail(e, true); }
    await push();
    if (S.status === 'ok') toast('✓ Synced to cloud');
  }

  async function conflict(f) {
    let d;
    try { d = await download(f.id); } catch (e) { return fail(e, true); }
    if (!hasLocal()) return applyRemote(d, f);
    const rs = sum(d), ls = sum({ products: DB.products, sales: DB.sales, customers: DB.customers });
    const m = Modal.open({
      title: 'Which data to keep?', static: true,
      body: `<p class="muted sm mb3">Your Google Drive already has ProPOS data that differs from this device.</p>
        <div class="grid2 mb3">
          <div class="cl-opt"><div class="xs muted mb1"><i class="fas fa-cloud"></i> Cloud data</div><div class="fw7">${rs.p} Product · ${rs.s} Sales</div><div class="xs muted">${rs.c} Customer<br>${d.exportDate ? C.fmtDT(d.exportDate) : C.fmtDT(f.modifiedTime)}</div></div>
          <div class="cl-opt"><div class="xs muted mb1"><i class="fas fa-mobile-screen"></i> This device data</div><div class="fw7">${ls.p} Product · ${ls.s} Sales</div><div class="xs muted">${ls.c} Customer</div></div>
        </div>
        <p class="xs muted">Safety: if you choose cloud data, a backup of this device data will download first. If you keep device data, a copy of the old cloud data will be saved on Drive.</p>`,
      foot: `<button class="btn btn-primary" id="cf-cloud"><i class="fas fa-cloud-arrow-down"></i> Take cloud data</button><button class="btn btn-ghost" id="cf-local"><i class="fas fa-cloud-arrow-up"></i> Keep device data</button>`
    });
    m.querySelector('#cf-cloud').onclick = () => { Modal.close(m); setTimeout(() => applyRemote(d, f), 400); };
    m.querySelector('#cf-local').onclick = async () => {
      Modal.close(m); setStatus('syncing');
      try { await snapshotBefore(f, 'before-overwrite-' + C.todayKey() + '-' + Date.now().toString(36)); } catch (_) {}
      set(KEY.fid, f.id); set(KEY.rev, f.modifiedTime); await push(true);
    };
  }

  // ---------- Sign in / আউট ----------
  async function afterSignIn() {
    const f = await findMain();
    if (!f) {
      if (hasLocal()) await push(true);
      else { setStatus('ok'); toast('✓ Google connected — auto backup when data changes'); }
      return;
    }
    set(KEY.fid, f.id);
    if (hasLocal() && get(KEY.rev) === f.modifiedTime) { if (get(KEY.dirty) === '1') await push(); else setStatus('ok'); return; }
    await conflict(f);
  }
  async function signIn(pick) {
    if (!clientId()) return setup();
    try {
      if (pick) [KEY.rev, KEY.fid, KEY.last, KEY.snap].forEach(del);
      const t = await requestToken(true, pick);
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + t } });
      const u = r.ok ? await r.json() : {};
      set(KEY.email, u.email || ''); set(KEY.name, u.name || ''); set(KEY.pic, u.picture || '');
      set(KEY.on, '1'); set(KEY.welcomed, '1'); closeWelcome(); setStatus('syncing');
      await afterSignIn();
    } catch (e) { fail(e, true); }
  }
  function signOut() {
    askConfirm('Google will be disconnected from this device. Data stays on device and Drive, but auto-backup will stop.', () => {
      try { if (S.tok && window.google && google.accounts) google.accounts.oauth2.revoke(S.tok, () => {}); } catch (_) {}
      S.tok = null; S.exp = 0; try { sessionStorage.removeItem(KEY.tok); } catch (_) {}
      [KEY.on, KEY.email, KEY.name, KEY.pic, KEY.rev, KEY.fid, KEY.last, KEY.snap, KEY.dirty].forEach(del);
      S.status = 'off'; renderUI(); toast('Signed out of Google');
    }, { title: 'Sign out?', yes: 'Sign out', danger: true });
  }
  async function pull() {
    try { await requestToken(true); setStatus('syncing'); const f = await findMain(); if (!f) { setStatus('ok'); return toast('No data in cloud yet'); }
      const d = await download(f.id); setStatus('ok');
      askConfirm('Current device data will be replaced by cloud data.', () => { setTimeout(() => applyRemote(d, f), 400); }, { title: 'Restore from cloud?', yes: 'Yes, restore', danger: true });
    } catch (e) { fail(e, true); }
  }
  async function snapshots() {
    try {
      await requestToken(true); setStatus('syncing');
      const list = (await listFiles("name contains '" + SNAP + "' and trashed = false")).sort((a, b) => a.name < b.name ? 1 : -1);
      setStatus(get(KEY.dirty) === '1' ? 'pending' : 'ok');
      const rows = list.length ? list.map(x => {
        const tag = x.name.slice(SNAP.length, -5); const day = /^\d{4}-\d{2}-\d{2}$/.test(tag) ? C.fmtDate(tag + 'T12:00:00') : 'Copy before overwrite';
        return `<div class="row" style="cursor:default"><div class="grow"><div class="t">${esc(day)}</div><div class="s">${C.fmtDT(x.modifiedTime)} · ${Math.round((x.size || 0) / 1024)} KB</div></div><button class="btn btn-sm btn-primary" data-id="${x.id}">Restore</button></div>`;
      }).join('') : '<div class="empty"><i class="fas fa-clock-rotate-left"></i>No old copies yet</div>';
      const m = Modal.open({ title: 'Old backups (cloud)', body: '<p class="xs muted mb3">A snapshot is kept before the first sync each day (last ' + KEEP_SNAPS + ').</p>' + rows });
      m.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
        try {
          const d = await download(b.dataset.id); const f = await findMain();
          askConfirm('Current device data will be replaced by this old copy, which will also become the main cloud data.', () => { Modal.close(m); setTimeout(() => applyRemote(d, f || { id: '', modifiedTime: '' }, true), 400); }, { title: 'Restore old copy?', yes: 'Yes', danger: true });
        } catch (e) { fail(e, true); }
      });
    } catch (e) { fail(e, true); }
  }

  // ---------- Error / স্ট্যাটাস ----------
  function fail(e, loud) {
    const c = e && (e.code || ''); let st = 'error', msg = '';
    if (c === 'auth' || e.status === 401) st = 'auth';
    else if (c === 'offline' || e instanceof TypeError || !navigator.onLine) st = 'offline';
    else if (/popup|access_denied|interaction|immediate/.test(c)) { st = 'auth'; msg = '⚠️ Sign-in incomplete'; }
    else if (c === 'noclient') { setup(); st = 'off'; }
    else if (c === 'badfile') msg = '⚠️ Cloud file is not valid ProPOS data';
    else if (e.status === 403) msg = '⚠️ Google Drive API not enabled or no permission — view setup guide';
    else if (e.status === 404) msg = '⚠️ Cloud file not found';
    console.warn('[Cloud]', e);
    setStatus(isOn() ? st : 'off');
    if (loud && st === 'offline') msg = '⚠️ No internet connection';
    if (msg || (loud && st === 'error')) toast(msg || '⚠️ Cloud sync failed (' + (c || e.status || 'error') + ')');
  }
  function setStatus(s) { S.status = s; renderUI(); }

  const timeOf = () => { const l = +get(KEY.last); return l ? C.fmtTime(new Date(l).toISOString()) : ''; };
  function lbl() {
    switch (S.status) {
      case 'ok': return { t: 'Secured in cloud', long: 'Synced' + (timeOf() ? ' · ' + timeOf() : ''), c: 'ok', i: 'fa-cloud' };
      case 'pending': return { t: 'Sync pending', long: 'Changes waiting to sync', c: 'pending', i: 'fa-cloud-arrow-up' };
      case 'syncing': return { t: 'Syncing', long: 'Syncing…', c: 'spin', i: 'fa-rotate' };
      case 'auth': return { t: 'Renew', long: 'Reconnect needed — tap here', c: 'pending pulse', i: 'fa-link-slash' };
      case 'offline': return { t: 'Offline', long: 'Offline — will sync when online', c: 'pending', i: 'fa-wifi' };
      case 'error': return { t: 'Sync failed', long: 'Sync failed — try again', c: 'err', i: 'fa-triangle-exclamation' };
      default: return { t: 'Sign in', long: 'Not connected', c: '', i: 'fa-cloud' };
    }
  }
  const avatar = (big) => { const pic = get(KEY.pic), nm = get(KEY.name) || get(KEY.email) || 'G';
    return pic ? `<img class="g-av ${big ? 'big' : ''}" src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : `<div class="g-av ${big ? 'big' : ''}">${esc(nm.trim().charAt(0).toUpperCase())}</div>`; };
  const gIcon = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  function bodyHTML() {
    if (!isOn()) return `<p class="muted sm mb3">Sign in with Google to auto-save all data to a private folder in your Google Drive. Even if browser data is cleared, signing in again restores everything.</p>
      <button class="btn btn-google btn-block" onclick="Cloud.signIn()">${gIcon} Sign in / Sign up with Google</button>
      <div class="consent-note">By signing in you accept our <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a>  & <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> .</div>
      ${clientId() ? '' : '<div class="note-warn mt3"><i class="fas fa-triangle-exclamation"></i> Client ID is not set. <a href="#" onclick="Cloud.setup();return false">View setup guide</a></div>'}`;
    const l = lbl();
    return `<div class="flex items-c gap3 mb3">${avatar(true)}<div class="grow"><div class="fw7 trunc">${esc(get(KEY.name) || 'Google account')}</div><div class="xs muted trunc">${esc(get(KEY.email))}</div></div></div>
      <div class="sync-line ${l.c}"><i class="fas ${l.i}"></i><span>${l.long}</span></div>
      <div class="grid2 mt3"><button class="btn btn-primary" onclick="Cloud.syncNow()"><i class="fas fa-rotate"></i> Sync now</button><button class="btn btn-ghost" onclick="Cloud.pull()"><i class="fas fa-cloud-arrow-down"></i> Pull from cloud</button></div>
      <div class="grid2 mt2"><button class="btn btn-ghost" onclick="Cloud.snapshots()"><i class="fas fa-clock-rotate-left"></i> Old copies</button><button class="btn btn-ghost" onclick="Cloud.signIn(true)"><i class="fas fa-user-group"></i> Other account</button></div>
      <button class="btn btn-danger-soft btn-block mt2" onclick="Cloud.signOut()"><i class="fas fa-right-from-bracket"></i> Sign out</button>
      <p class="xs muted mt3">🔒 Data stays only in your Drive's private app folder — the app cannot see any other files. Data changes auto-sync within a few seconds; Google permission may need renewal every hour.</p>`;
  }
  function renderUI() {
    const l = lbl(), on = isOn();
    document.querySelectorAll('.js-chip').forEach(b => { b.className = 'sync-chip js-chip ' + (on ? l.c : ''); b.innerHTML = `<i class="fas ${on ? l.i : 'fa-cloud'}"></i><span class="lbl">${on ? l.t : 'Sign in'}</span>`; });
    document.querySelectorAll('.js-acct').forEach(el => {
      el.innerHTML = on
        ? `<button class="acct" onclick="Cloud.panel()">${avatar()}<span class="grow"><b class="trunc">${esc(get(KEY.name) || get(KEY.email))}</b><small class="${l.c}"><i class="fas ${l.i}"></i> ${l.long}</small></span><i class="fas fa-chevron-right xs muted"></i></button>`
        : `<button class="acct signin" onclick="Cloud.panel()"><span class="g-av g">${gIcon}</span><span class="grow"><b>Sign in with Google</b><small>Keep data safe on Drive</small></span></button>`;
    });
    document.querySelectorAll('.js-cloud-body').forEach(el => { el.innerHTML = bodyHTML(); });
  }
  function panel() {
    const m = Modal.open({ title: 'Google Drive Cloud Backup', body: '<div class="js-cloud-body"></div>' }); renderUI(); return m;
  }

  // ---------- ওয়েLockাম স্ক্রিন ----------
  function closeWelcome() { const w = $('welcome'); if (w) { w.classList.add('out'); setTimeout(() => w.remove(), 250); } if (window.syncLock) syncLock(); }
  function showWelcome(mode) {
    if ($('welcome')) return;
    const restore = mode === 'restore';
    const el = document.createElement('div'); el.id = 'welcome'; el.className = 'welcome';
    el.innerHTML = `<div class="w-card"><div class="w-logo"><i class="fas fa-cash-register"></i></div>
      <h2>${restore ? 'Restore data' : 'Welcome to ProPOS'}</h2>
      <p>${restore ? 'Your Google account (' + esc(get(KEY.email)) + ') is connected, but this device has no data. Restore all from cloud.' : 'Sign in with Google — even if browser data is cleared, signing in again restores everything.'}</p>
      <ul class="w-list"><li><i class="fas fa-cloud-arrow-up"></i> Auto cloud backup</li><li><i class="fas fa-shield-halved"></i> Data only on your Drive</li><li><i class="fas fa-mobile-screen-button"></i> Same data on any device</li></ul>
      <button class="btn btn-google btn-block" id="w-go">${gIcon} ${restore ? 'Restore from cloud' : 'Sign in / Sign up with Google'}</button>
      <button class="btn btn-ghost btn-block mt2" id="w-skip">${restore ? 'Start fresh' : 'Not now, start offline'}</button>
      <div class="consent-note">By signing in you accept our <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a>  & <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> .</div></div>`;
    document.body.appendChild(el);
    el.querySelector('#w-go').onclick = () => signIn(false);
    el.querySelector('#w-skip').onclick = () => { set(KEY.welcomed, '1'); if (restore) del(KEY.rev); closeWelcome(); };
    if (window.syncLock) syncLock();
  }

  // ---------- সেটআপ গাইড ----------
  function setup() {
    const cur = get(KEY.client) || '';
    const m = Modal.open({ title: 'Google Sign-in setup', body: `
      <p class="sm muted mb3">One-time setup (free). Then put the Client ID in <code>js/config.js</code>- and upload to GitHub/server.</p>
      <ol class="guide sm">
        <li><b>console.cloud.google.com</b>- and create a new project.</li>
        <li><b>APIs &amp; Services → Library</b> from <b>Google Drive API</b> Enable.</li>
        <li><b>OAuth consent screen</b>: User type = External, Enter app name. Scopes: <code>drive.appdata</code>, <code>email</code>, <code>profile</code>, <code>openid</code> Add. Finally <b>Publish app (In production)</b> — these scopes do not require Google verification.</li>
        <li><b>Credentials → Create credentials → OAuth client ID → Web application</b>।</li>
        <li><b>Authorized JavaScript origins</b> — enter your site address (no path, no trailing /):<br><code class="sel">${esc(location.origin)}</code></li>
        <li>The Client ID you get (<code>…apps.googleusercontent.com</code>) put in <code>js/config.js</code>-.</li>
      </ol>
      <div class="field mt3"><label class="label">Quick test — paste Client ID here (saved only in this browser)</label><input id="cl-id" class="input" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cur)}"></div>
      <p class="xs muted">⚠️ For permanent use put it in <code>js/config.js</code>- — otherwise clearing browser data also removes this ID.</p>`,
      foot: '<button class="btn" onclick="Modal.closeFrom(this)">Close</button><button class="btn btn-primary" id="cl-save">Save</button>' });
    m.querySelector('#cl-save').onclick = () => { const v = m.querySelector('#cl-id').value.trim(); if (v) set(KEY.client, v); else del(KEY.client); Modal.close(m); toast('✓ Client ID saved'); renderUI(); if (clientId()) loadGIS().catch(() => {}); };
  }

  // ---------- Resume ----------
  let inited = false;
  function init() {
    if (inited) { renderUI(); return; } inited = true;
    if (isOn()) {
      S.status = get(KEY.dirty) === '1' ? 'pending' : 'ok';
      if (!hasLocal()) { del(KEY.rev); showWelcome('restore'); }
      else if (get(KEY.dirty) === '1') { setStatus(validTok() ? 'pending' : 'auth'); if (validTok()) S.timer = setTimeout(() => push(), 3000); }
    } else if (clientId() && !hasLocal() && !get(KEY.welcomed)) showWelcome('new');
    renderUI();
    if (clientId() && navigator.onLine && (isOn() || !get(KEY.welcomed))) loadGIS().catch(() => {});
    window.addEventListener('online', () => { if (isOn() && get(KEY.dirty) === '1') { if (validTok()) { setStatus('pending'); push(); } else setStatus('auth'); } });
    window.addEventListener('offline', () => { if (isOn()) renderUI(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && isOn() && get(KEY.dirty) === '1' && validTok()) push(); });
    // Sync pending + টোকেন Expiryোত্তীর্ণ হলে পরবর্তী ক্লিক/ট্যাপেই (ব্রাউজার পপআপ অনুমতি দেয়) নবায়নের চেষ্টা — সর্বোচ্চ ১০ মিনিটে একবার
    // Token renewal only on explicit Sync now / Sign in — never on random page clicks
    // (old global click→syncNow opened Google OAuth popup unexpectedly)
  }

  window.Cloud = { init, markDirty, signIn, signOut, syncNow, pull, snapshots, panel, setup, renderUI, isOn };
})();
