/* ProPOS Cloud — Google সাইন-ইন + Google Drive (গোপন appDataFolder) অটো ব্যাকআপ ও রিস্টোর
   • শুধু drive.appdata স্কোপ: অ্যাপ আপনার অন্য কোনো ড্রাইভ ফাইল দেখতে পায় না
   • ব্রাউজারের ডেটা মুছে গেলেও আবার সাইন ইন করলেই সব ডেটা ফিরে আসে */
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
  // interactive=true হলে পপআপ খোলে (শুধু ইউজারের ট্যাপ থেকে ডাকুন)
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

  // দিনে একবার (প্রথম আপলোডের আগে) আগের অবস্থার স্ন্যাপশট — ভুলে ডেটা মুছে গেলেও পুরনো দিনের কপি থাকে
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
    toast('✓ ক্লাউড থেকে ডেটা ফিরে এসেছে');
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
  // ইউজারের ট্যাপ থেকে: টোকেন নবায়ন + সিঙ্ক
  async function syncNow() {
    if (!isOn()) return signIn();
    try { setStatus('syncing'); await requestToken(true); } catch (e) { return fail(e, true); }
    await push();
    if (S.status === 'ok') toast('✓ ক্লাউডে সিঙ্ক হয়েছে');
  }

  async function conflict(f) {
    let d;
    try { d = await download(f.id); } catch (e) { return fail(e, true); }
    if (!hasLocal()) return applyRemote(d, f);
    const rs = sum(d), ls = sum({ products: DB.products, sales: DB.sales, customers: DB.customers });
    const m = Modal.open({
      title: 'কোন ডেটা রাখবেন?', static: true,
      body: `<p class="muted sm mb3">আপনার Google Drive-এ আগে থেকেই ProPOS-এর ডেটা আছে, যা এই ডিভাইসের ডেটা থেকে আলাদা।</p>
        <div class="grid2 mb3">
          <div class="cl-opt"><div class="xs muted mb1"><i class="fas fa-cloud"></i> ক্লাউডের ডেটা</div><div class="fw7">${rs.p} পণ্য · ${rs.s} বিক্রয়</div><div class="xs muted">${rs.c} ক্রেতা<br>${d.exportDate ? C.fmtDT(d.exportDate) : C.fmtDT(f.modifiedTime)}</div></div>
          <div class="cl-opt"><div class="xs muted mb1"><i class="fas fa-mobile-screen"></i> এই ডিভাইসের ডেটা</div><div class="fw7">${ls.p} পণ্য · ${ls.s} বিক্রয়</div><div class="xs muted">${ls.c} ক্রেতা</div></div>
        </div>
        <p class="xs muted">নিরাপত্তা: ক্লাউডের ডেটা বেছে নিলে এই ডিভাইসের ডেটার একটি ব্যাকআপ ফাইল আগে ডাউনলোড হবে। ডিভাইসের ডেটা বেছে নিলে ক্লাউডের পুরনো ডেটার একটি কপি Drive-এ রাখা হবে।</p>`,
      foot: `<button class="btn btn-primary" id="cf-cloud"><i class="fas fa-cloud-arrow-down"></i> ক্লাউডের ডেটা নিন</button><button class="btn btn-ghost" id="cf-local"><i class="fas fa-cloud-arrow-up"></i> ডিভাইসের ডেটা রাখুন</button>`
    });
    m.querySelector('#cf-cloud').onclick = () => { Modal.close(m); try { window.exportData(true); } catch (_) {} setTimeout(() => applyRemote(d, f), 400); };
    m.querySelector('#cf-local').onclick = async () => {
      Modal.close(m); setStatus('syncing');
      try { await snapshotBefore(f, 'before-overwrite-' + C.todayKey() + '-' + Date.now().toString(36)); } catch (_) {}
      set(KEY.fid, f.id); set(KEY.rev, f.modifiedTime); await push(true);
    };
  }

  // ---------- সাইন ইন / আউট ----------
  async function afterSignIn() {
    const f = await findMain();
    if (!f) {
      if (hasLocal()) await push(true);
      else { setStatus('ok'); toast('✓ Google সংযুক্ত হয়েছে — ডেটা যোগ করলেই স্বয়ংক্রিয় ব্যাকআপ হবে'); }
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
    askConfirm('এই ডিভাইস থেকে Google সংযোগ বিচ্ছিন্ন হবে। আপনার ডেটা ডিভাইসে ও Drive-এ থেকে যাবে, তবে আর অটো-ব্যাকআপ হবে না।', () => {
      try { if (S.tok && window.google && google.accounts) google.accounts.oauth2.revoke(S.tok, () => {}); } catch (_) {}
      S.tok = null; S.exp = 0; try { sessionStorage.removeItem(KEY.tok); } catch (_) {}
      [KEY.on, KEY.email, KEY.name, KEY.pic, KEY.rev, KEY.fid, KEY.last, KEY.snap, KEY.dirty].forEach(del);
      S.status = 'off'; renderUI(); toast('Google থেকে সাইন আউট হয়েছে');
    }, { title: 'সাইন আউট করবেন?', yes: 'সাইন আউট', danger: true });
  }
  async function pull() {
    try { await requestToken(true); setStatus('syncing'); const f = await findMain(); if (!f) { setStatus('ok'); return toast('ক্লাউডে এখনো কোনো ডেটা নেই'); }
      const d = await download(f.id); setStatus('ok');
      askConfirm('এই ডিভাইসের বর্তমান ডেটা মুছে ক্লাউডের ডেটা বসবে (আগে একটি ব্যাকআপ ফাইল ডাউনলোড হবে)।', () => { try { window.exportData(true); } catch (_) {} setTimeout(() => applyRemote(d, f), 400); }, { title: 'ক্লাউড থেকে ফিরিয়ে আনবেন?', yes: 'হ্যাঁ, ফিরিয়ে আনুন', danger: true });
    } catch (e) { fail(e, true); }
  }
  async function snapshots() {
    try {
      await requestToken(true); setStatus('syncing');
      const list = (await listFiles("name contains '" + SNAP + "' and trashed = false")).sort((a, b) => a.name < b.name ? 1 : -1);
      setStatus(get(KEY.dirty) === '1' ? 'pending' : 'ok');
      const rows = list.length ? list.map(x => {
        const tag = x.name.slice(SNAP.length, -5); const day = /^\d{4}-\d{2}-\d{2}$/.test(tag) ? C.fmtDate(tag + 'T12:00:00') : 'ওভাররাইটের আগের কপি';
        return `<div class="row" style="cursor:default"><div class="grow"><div class="t">${esc(day)}</div><div class="s">${C.fmtDT(x.modifiedTime)} · ${Math.round((x.size || 0) / 1024)} KB</div></div><button class="btn btn-sm btn-primary" data-id="${x.id}">ফিরিয়ে আনুন</button></div>`;
      }).join('') : '<div class="empty"><i class="fas fa-clock-rotate-left"></i>এখনো কোনো পুরনো কপি নেই</div>';
      const m = Modal.open({ title: 'পুরনো ব্যাকআপ (ক্লাউড)', body: '<p class="xs muted mb3">প্রতিদিন প্রথম সিঙ্কের আগে আগের অবস্থার একটি কপি রাখা হয় (সর্বশেষ ' + KEEP_SNAPS + 'টি)।</p>' + rows });
      m.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
        try {
          const d = await download(b.dataset.id); const f = await findMain();
          askConfirm('এই ডিভাইসের বর্তমান ডেটা মুছে এই পুরনো কপি বসবে এবং ক্লাউডেও এটিই মূল ডেটা হবে।', () => { try { window.exportData(true); } catch (_) {} Modal.close(m); setTimeout(() => applyRemote(d, f || { id: '', modifiedTime: '' }, true), 400); }, { title: 'পুরনো কপি ফেরাবেন?', yes: 'হ্যাঁ', danger: true });
        } catch (e) { fail(e, true); }
      });
    } catch (e) { fail(e, true); }
  }

  // ---------- ত্রুটি / স্ট্যাটাস ----------
  function fail(e, loud) {
    const c = e && (e.code || ''); let st = 'error', msg = '';
    if (c === 'auth' || e.status === 401) st = 'auth';
    else if (c === 'offline' || e instanceof TypeError || !navigator.onLine) st = 'offline';
    else if (/popup|access_denied|interaction|immediate/.test(c)) { st = 'auth'; msg = '⚠️ সাইন ইন সম্পূর্ণ হয়নি'; }
    else if (c === 'noclient') { setup(); st = 'off'; }
    else if (c === 'badfile') msg = '⚠️ ক্লাউডের ফাইলটি সঠিক ProPOS ডেটা নয়';
    else if (e.status === 403) msg = '⚠️ Google Drive API চালু নেই বা অনুমতি নেই — সেটআপ গাইড দেখুন';
    else if (e.status === 404) msg = '⚠️ ক্লাউড ফাইল পাওয়া যায়নি';
    console.warn('[Cloud]', e);
    setStatus(isOn() ? st : 'off');
    if (loud && st === 'offline') msg = '⚠️ ইন্টারনেট সংযোগ নেই';
    if (msg || (loud && st === 'error')) toast(msg || '⚠️ ক্লাউড সিঙ্ক ব্যর্থ (' + (c || e.status || 'error') + ')');
  }
  function setStatus(s) { S.status = s; renderUI(); }

  const timeOf = () => { const l = +get(KEY.last); return l ? C.fmtTime(new Date(l).toISOString()) : ''; };
  function lbl() {
    switch (S.status) {
      case 'ok': return { t: 'ক্লাউডে সুরক্ষিত', long: 'সিঙ্ক হয়েছে' + (timeOf() ? ' · ' + timeOf() : ''), c: 'ok', i: 'fa-cloud' };
      case 'pending': return { t: 'সিঙ্ক বাকি', long: 'পরিবর্তন সিঙ্কের অপেক্ষায়', c: 'pending', i: 'fa-cloud-arrow-up' };
      case 'syncing': return { t: 'সিঙ্ক হচ্ছে', long: 'সিঙ্ক হচ্ছে…', c: 'spin', i: 'fa-rotate' };
      case 'auth': return { t: 'নবায়ন করুন', long: 'সংযোগ নবায়ন দরকার — ট্যাপ করুন', c: 'pending pulse', i: 'fa-link-slash' };
      case 'offline': return { t: 'অফলাইন', long: 'অফলাইন — ইন্টারনেট এলে সিঙ্ক হবে', c: 'pending', i: 'fa-wifi' };
      case 'error': return { t: 'সিঙ্ক ব্যর্থ', long: 'সিঙ্ক ব্যর্থ — আবার চেষ্টা করুন', c: 'err', i: 'fa-triangle-exclamation' };
      default: return { t: 'সাইন ইন', long: 'সংযুক্ত নয়', c: '', i: 'fa-cloud' };
    }
  }
  const avatar = (big) => { const pic = get(KEY.pic), nm = get(KEY.name) || get(KEY.email) || 'G';
    return pic ? `<img class="g-av ${big ? 'big' : ''}" src="${esc(pic)}" alt="" referrerpolicy="no-referrer">` : `<div class="g-av ${big ? 'big' : ''}">${esc(nm.trim().charAt(0).toUpperCase())}</div>`; };
  const gIcon = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  function bodyHTML() {
    if (!isOn()) return `<p class="muted sm mb3">Google দিয়ে সাইন ইন করলে আপনার সব ডেটা আপনার নিজের Google Drive-এ (গোপন অ্যাপ-ফোল্ডারে) স্বয়ংক্রিয়ভাবে সেভ হবে। ব্রাউজারের ডেটা মুছে গেলেও আবার সাইন ইন করলেই সব ফিরে আসবে।</p>
      <button class="btn btn-google btn-block" onclick="Cloud.signIn()">${gIcon} Google দিয়ে সাইন ইন / সাইন আপ</button>
      ${clientId() ? '' : '<div class="note-warn mt3"><i class="fas fa-triangle-exclamation"></i> Client ID সেট করা নেই। <a href="#" onclick="Cloud.setup();return false">সেটআপ গাইড দেখুন</a></div>'}`;
    const l = lbl();
    return `<div class="flex items-c gap3 mb3">${avatar(true)}<div class="grow"><div class="fw7 trunc">${esc(get(KEY.name) || 'Google অ্যাকাউন্ট')}</div><div class="xs muted trunc">${esc(get(KEY.email))}</div></div></div>
      <div class="sync-line ${l.c}"><i class="fas ${l.i}"></i><span>${l.long}</span></div>
      <div class="grid2 mt3"><button class="btn btn-primary" onclick="Cloud.syncNow()"><i class="fas fa-rotate"></i> এখনই সিঙ্ক</button><button class="btn btn-ghost" onclick="Cloud.pull()"><i class="fas fa-cloud-arrow-down"></i> ক্লাউড থেকে আনুন</button></div>
      <div class="grid2 mt2"><button class="btn btn-ghost" onclick="Cloud.snapshots()"><i class="fas fa-clock-rotate-left"></i> পুরনো কপি</button><button class="btn btn-ghost" onclick="Cloud.signIn(true)"><i class="fas fa-user-group"></i> অন্য অ্যাকাউন্ট</button></div>
      <button class="btn btn-danger-soft btn-block mt2" onclick="Cloud.signOut()"><i class="fas fa-right-from-bracket"></i> সাইন আউট</button>
      <p class="xs muted mt3">🔒 ডেটা শুধু আপনার Drive-এর গোপন ফোল্ডারে থাকে — অ্যাপ আপনার অন্য কোনো ফাইল দেখতে পায় না। ডেটা বদলালে কয়েক সেকেন্ডের মধ্যে অটো-সিঙ্ক হয়; নিরাপত্তার জন্য গুগলের অনুমতি প্রতি ঘণ্টায় নবায়ন করতে হতে পারে।</p>`;
  }
  function renderUI() {
    const l = lbl(), on = isOn();
    document.querySelectorAll('.js-chip').forEach(b => { b.className = 'sync-chip js-chip ' + (on ? l.c : ''); b.innerHTML = `<i class="fas ${on ? l.i : 'fa-cloud'}"></i><span class="lbl">${on ? l.t : 'সাইন ইন'}</span>`; });
    document.querySelectorAll('.js-acct').forEach(el => {
      el.innerHTML = on
        ? `<button class="acct" onclick="Cloud.panel()">${avatar()}<span class="grow"><b class="trunc">${esc(get(KEY.name) || get(KEY.email))}</b><small class="${l.c}"><i class="fas ${l.i}"></i> ${l.long}</small></span><i class="fas fa-chevron-right xs muted"></i></button>`
        : `<button class="acct signin" onclick="Cloud.panel()"><span class="g-av g">${gIcon}</span><span class="grow"><b>Google দিয়ে সাইন ইন</b><small>ডেটা Drive-এ সুরক্ষিত রাখুন</small></span></button>`;
    });
    document.querySelectorAll('.js-cloud-body').forEach(el => { el.innerHTML = bodyHTML(); });
  }
  function panel() {
    const m = Modal.open({ title: 'Google Drive ক্লাউড ব্যাকআপ', body: '<div class="js-cloud-body"></div>' }); renderUI(); return m;
  }

  // ---------- ওয়েলকাম স্ক্রিন ----------
  function closeWelcome() { const w = $('welcome'); if (w) { w.classList.add('out'); setTimeout(() => w.remove(), 250); } if (window.syncLock) syncLock(); }
  function showWelcome(mode) {
    if ($('welcome')) return;
    const restore = mode === 'restore';
    const el = document.createElement('div'); el.id = 'welcome'; el.className = 'welcome';
    el.innerHTML = `<div class="w-card"><div class="w-logo"><i class="fas fa-cash-register"></i></div>
      <h2>${restore ? 'ডেটা ফিরিয়ে আনুন' : 'ProPOS-এ স্বাগতম'}</h2>
      <p>${restore ? 'আপনার Google অ্যাকাউন্ট (' + esc(get(KEY.email)) + ') সংযুক্ত আছে, কিন্তু এই ডিভাইসে কোনো ডেটা নেই। ক্লাউড থেকে সব ফিরিয়ে আনুন।' : 'Google দিয়ে সাইন ইন করুন — ব্রাউজারের ডেটা মুছে গেলেও আবার সাইন ইন করলেই সব ডেটা ফিরে আসবে।'}</p>
      <ul class="w-list"><li><i class="fas fa-cloud-arrow-up"></i> অটো ক্লাউড ব্যাকআপ</li><li><i class="fas fa-shield-halved"></i> ডেটা শুধু আপনার Drive-এ</li><li><i class="fas fa-mobile-screen-button"></i> যেকোনো ডিভাইসে একই ডেটা</li></ul>
      <button class="btn btn-google btn-block" id="w-go">${gIcon} ${restore ? 'ক্লাউড থেকে ফিরিয়ে আনুন' : 'Google দিয়ে সাইন ইন / সাইন আপ'}</button>
      <button class="btn btn-ghost btn-block mt2" id="w-skip">${restore ? 'নতুন করে শুরু করুন' : 'এখন নয়, অফলাইনে শুরু করুন'}</button></div>`;
    document.body.appendChild(el);
    el.querySelector('#w-go').onclick = () => signIn(false);
    el.querySelector('#w-skip').onclick = () => { set(KEY.welcomed, '1'); if (restore) del(KEY.rev); closeWelcome(); };
    if (window.syncLock) syncLock();
  }

  // ---------- সেটআপ গাইড ----------
  function setup() {
    const cur = get(KEY.client) || '';
    const m = Modal.open({ title: 'Google সাইন-ইন সেটআপ', body: `
      <p class="sm muted mb3">একবারই করতে হবে (বিনামূল্যে)। এরপর Client ID <code>js/config.js</code>-এ বসিয়ে GitHub/সার্ভারে আপলোড করুন।</p>
      <ol class="guide sm">
        <li><b>console.cloud.google.com</b>-এ গিয়ে নতুন প্রজেক্ট খুলুন।</li>
        <li><b>APIs &amp; Services → Library</b> থেকে <b>Google Drive API</b> Enable করুন।</li>
        <li><b>OAuth consent screen</b>: User type = External, অ্যাপের নাম দিন। Scopes-এ <code>drive.appdata</code>, <code>email</code>, <code>profile</code>, <code>openid</code> যোগ করুন। শেষে <b>Publish app (In production)</b> করুন — এই স্কোপগুলোর জন্য গুগলের ভেরিফিকেশন লাগে না।</li>
        <li><b>Credentials → Create credentials → OAuth client ID → Web application</b>।</li>
        <li><b>Authorized JavaScript origins</b>-এ আপনার সাইটের ঠিকানা দিন (পাথ ছাড়া, শেষে / ছাড়া):<br><code class="sel">${esc(location.origin)}</code></li>
        <li>যে Client ID পাবেন (<code>…apps.googleusercontent.com</code>) তা <code>js/config.js</code>-এ বসান।</li>
      </ol>
      <div class="field mt3"><label class="label">দ্রুত টেস্টের জন্য — Client ID এখানে বসান (শুধু এই ব্রাউজারে সেভ হবে)</label><input id="cl-id" class="input" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cur)}"></div>
      <p class="xs muted">⚠️ স্থায়ীভাবে কাজ করতে <code>js/config.js</code>-এ দিন — নাহলে ব্রাউজারের ডেটা মুছলে এই ID-ও মুছে যাবে।</p>`,
      foot: '<button class="btn" onclick="Modal.closeFrom(this)">বন্ধ</button><button class="btn btn-primary" id="cl-save">সংরক্ষণ</button>' });
    m.querySelector('#cl-save').onclick = () => { const v = m.querySelector('#cl-id').value.trim(); if (v) set(KEY.client, v); else del(KEY.client); Modal.close(m); toast('✓ Client ID সংরক্ষিত'); renderUI(); if (clientId()) loadGIS().catch(() => {}); };
  }

  // ---------- চালু ----------
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
    window.addEventListener('online', () => { if (isOn() && get(KEY.dirty) === '1') { setStatus(validTok() ? 'pending' : 'auth'); push(); } });
    window.addEventListener('offline', () => { if (isOn()) renderUI(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && isOn() && get(KEY.dirty) === '1') push(); });
    // সিঙ্ক বাকি + টোকেন মেয়াদোত্তীর্ণ হলে পরবর্তী ক্লিক/ট্যাপেই (ব্রাউজার পপআপ অনুমতি দেয়) নবায়নের চেষ্টা — সর্বোচ্চ ১০ মিনিটে একবার
    document.addEventListener('click', () => {
      if (isOn() && get(KEY.dirty) === '1' && !validTok() && !S.authP && !S.busy && navigator.onLine && Date.now() - S.lastTry > 10 * 60 * 1000 && !document.querySelector('.modal-back,.ui-confirm-backdrop,.lock')) syncNow();
    }, true);
  }

  window.Cloud = { init, markDirty, signIn, signOut, syncNow, pull, snapshots, panel, setup, renderUI, isOn };
})();
