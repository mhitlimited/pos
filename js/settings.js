/* ProPOS: সেটিংস, বারকোড স্ক্যানার, PIN লক, ব্লুটুথ প্রিন্টার */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, money, fmt, toast } = C;
  const $ = id => document.getElementById(id);

  // ================= বারকোড স্ক্যানার (ক্যামেরা) =================
  const Scanner = window.Scanner = {
    el: null, stream: null, timer: null, last: '', lastT: 0,
    isOpen() { return !!this.el; },
    async open(cb, o) {
      o = o || {};
      if (!('BarcodeDetector' in window)) { toast('⚠️ এই ব্রাউজারে ক্যামেরা স্ক্যান নেই। USB/ব্লুটুথ স্ক্যানার বা টাইপ করুন।'); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('⚠️ ক্যামেরা পাওয়া যায়নি (HTTPS দরকার)'); return; }
      let det; try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] }); } catch (_) { det = new BarcodeDetector(); }
      try { this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
      catch (e) { toast('⚠️ ক্যামেরার অনুমতি দেওয়া হয়নি'); return; }
      const el = document.createElement('div'); el.className = 'scan';
      el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div><div class="bar-top"><b>বারকোড স্ক্যান</b><button class="btn btn-sm" id="sc-x">বন্ধ করুন</button></div><div class="bar-bot">${esc(o.hint || 'বারকোড ফ্রেমের ভেতরে ধরুন')}</div>`;
      document.body.appendChild(el); this.el = el; syncLock();
      const v = el.querySelector('video'); v.srcObject = this.stream; try { await v.play(); } catch (_) {}
      el.querySelector('#sc-x').onclick = () => this.close();
      this.timer = setInterval(async () => {
        if (!this.el || v.readyState < 2) return;
        try {
          const codes = await det.detect(v); if (!codes.length) return;
          const code = codes[0].rawValue; const now = Date.now();
          if (code === this.last && now - this.lastT < 1800) return;
          this.last = code; this.lastT = now; Sound.play('beep'); if (navigator.vibrate) navigator.vibrate(40);
          cb(code); if (!o.continuous) this.close();
        } catch (_) {}
      }, 220);
    },
    close() {
      clearInterval(this.timer); this.timer = null;
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.el) { this.el.remove(); this.el = null; } syncLock();
    }
  };

  // ================= PIN লক =================
  async function hashPin(pin, salt) {
    const s = salt + ':' + pin;
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h1 = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { h1 = (h1 * 33) ^ s.charCodeAt(i); h2 = (h2 * 33) ^ s.charCodeAt(s.length - 1 - i); } return 'x' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  const Lock = window.Lock = {
    hiddenAt: 0, el: null,
    has() { return !!DB.settings.pinHash; },
    init(start) { if (this.has()) this.show(start); else start(); },
    lockNow() { if (!this.has()) { toast('আগে সেটিংসে PIN সেট করুন'); return; } this.show(() => {}); },
    onHide() { this.hiddenAt = Date.now(); },
    onResume() { if (this.has() && !this.el && this.hiddenAt && Date.now() - this.hiddenAt > 60000) this.show(() => {}); },
    show(done) {
      if (this.el) return; let pin = '';
      const el = document.createElement('div'); el.className = 'lock';
      el.innerHTML = `<div class="logo" style="width:64px;height:64px;font-size:28px;background:rgba(255,255,255,.2)"><i class="fas fa-lock"></i></div><h2>${esc(DB.settings.shopName)}</h2><p>PIN দিয়ে আনলক করুন</p><div class="dots" id="lk-dots"><i></i><i></i><i></i><i></i></div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
        <button type="button" id="lk-forgot" style="margin-top:26px;background:none;border:0;color:#fff;opacity:.7;font-size:13px;cursor:pointer;text-decoration:underline">PIN ভুলে গেছেন?</button>`;
      document.body.appendChild(el); this.el = el; syncLock();
      const dots = el.querySelectorAll('#lk-dots i');
      const paint = () => dots.forEach((d, i) => d.classList.toggle('f', i < pin.length));
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
        const k = b.dataset.k; if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k; paint();
        if (pin.length === 4) {
          const h = await hashPin(pin, DB.settings.pinSalt);
          if (h === DB.settings.pinHash) { el.remove(); this.el = null; syncLock(); done && done(); }
          else { const d = el.querySelector('#lk-dots'); d.classList.add('shake'); if (navigator.vibrate) navigator.vibrate(120); setTimeout(() => { d.classList.remove('shake'); pin = ''; paint(); }, 450); }
        }
      });
      el.querySelector('#lk-forgot').onclick = () => askConfirm('PIN ভুলে গেলে একমাত্র উপায় সব ডেটা মুছে নতুন করে শুরু করা (মুছার আগে ব্যাকআপ ফাইল ডাউনলোড হবে, পরে রিস্টোর করা যাবে)। করবেন?', () => { DB.settings.pinHash = ''; DB.settings.pinSalt = ''; C.save('settings'); wipeAllData(); }, { danger: true, yes: 'ডেটা মুছে রিসেট', title: 'PIN রিসেট' });
    },
    setup() {
      const has = this.has();
      const m = Modal.open({ title: has ? 'PIN পরিবর্তন' : 'PIN সেট করুন', body: `${has ? '<div class="field"><label class="label">বর্তমান PIN</label><input id="pn-old" type="password" inputmode="numeric" maxlength="4" class="input"></div>' : ''}
        <div class="field"><label class="label">নতুন PIN (৪ সংখ্যা)</label><input id="pn-new" type="password" inputmode="numeric" maxlength="4" class="input" ${has ? '' : 'autofocus'}></div>
        <div class="field"><label class="label">আবার লিখুন</label><input id="pn-new2" type="password" inputmode="numeric" maxlength="4" class="input"></div>
        <p class="xs muted">⚠️ PIN ভুলে গেলে ডেটা রিসেট করতে হবে — তাই নিয়মিত ব্যাকআপ রাখুন।</p>`, foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-primary" id="pn-ok">সংরক্ষণ</button>` });
      m.querySelector('#pn-ok').onclick = async () => {
        if (has && (await hashPin($('pn-old').value, DB.settings.pinSalt)) !== DB.settings.pinHash) { toast('⚠️ বর্তমান PIN ভুল'); return; }
        const a = $('pn-new').value, b = $('pn-new2').value; if (!/^\d{4}$/.test(a)) { toast('⚠️ ঠিক ৪টি সংখ্যা দিন'); return; } if (a !== b) { toast('⚠️ দুটি PIN মেলেনি'); return; }
        const salt = C.genId(); DB.settings.pinSalt = salt; DB.settings.pinHash = await hashPin(a, salt); C.save('settings'); Modal.close(m); toast('PIN সেট হয়েছে ✓'); App.refresh();
      };
    },
    remove() {
      const m = Modal.open({ title: 'PIN বন্ধ করুন', body: '<div class="field"><label class="label">বর্তমান PIN</label><input id="pn-old" type="password" inputmode="numeric" maxlength="4" class="input" autofocus></div>', foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-bad" id="pn-ok">PIN বন্ধ করুন</button>` });
      m.querySelector('#pn-ok').onclick = async () => { if ((await hashPin($('pn-old').value, DB.settings.pinSalt)) !== DB.settings.pinHash) { toast('⚠️ PIN ভুল'); return; } DB.settings.pinHash = ''; DB.settings.pinSalt = ''; C.save('settings'); Modal.close(m); toast('PIN বন্ধ করা হয়েছে'); App.refresh(); };
    }
  };

  // ================= ব্লুটুথ প্রিন্টার =================
  const SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000ffb0-0000-1000-8000-00805f9b34fb'];
  const Printer = window.Printer = {
    dev: null, ch: null, name: '',
    isConnected() { return !!(this.ch && this.dev && this.dev.gatt && this.dev.gatt.connected); },
    ui() {
      const ok = this.isConnected(); const s = $('bt-status'); if (s) s.innerHTML = ok ? `<span class="badge b-ok">● সংযুক্ত: ${esc(this.name)}</span>` : '<span class="badge">● সংযুক্ত নয়</span>';
      const c = $('bt-conn'), d = $('bt-disc'); if (c) c.classList.toggle('hidden', ok); if (d) d.classList.toggle('hidden', !ok);
    },
    async connect() {
      if (!navigator.bluetooth) { toast('⚠️ Web Bluetooth নেই। Android Chrome/Edge ব্যবহার করুন।'); return false; }
      try {
        toast('প্রিন্টার খোঁজা হচ্ছে...');
        this.dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
        this.dev.addEventListener('gattserverdisconnected', () => { this.ch = null; this.ui(); toast('প্রিন্টার বিচ্ছিন্ন হয়েছে'); });
        const server = await this.dev.gatt.connect(); const services = await server.getPrimaryServices(); let found = null;
        for (const sv of services) { const cs = await sv.getCharacteristics(); for (const c of cs) { if (c.properties.write || c.properties.writeWithoutResponse) { found = c; break; } } if (found) break; }
        if (!found) throw new Error('প্রিন্টারে লেখার চ্যানেল পাওয়া যায়নি');
        this.ch = found; this.name = this.dev.name || 'প্রিন্টার'; this.ui(); toast('প্রিন্টার সংযুক্ত ✓'); return true;
      } catch (e) { console.error(e); toast(e.name === 'NotFoundError' ? 'কোনো ডিভাইস বাছাই করা হয়নি' : '⚠️ সংযোগ ব্যর্থ: ' + (e.message || '')); this.ch = null; this.ui(); return false; }
    },
    disconnect() { try { if (this.dev && this.dev.gatt.connected) this.dev.gatt.disconnect(); } catch (_) {} this.ch = null; this.ui(); },
    async write(bytes) {
      const size = 100;
      for (let i = 0; i < bytes.length; i += size) {
        const chunk = bytes.slice(i, i + size);
        if (this.ch.properties.writeWithoutResponse) await this.ch.writeValueWithoutResponse(chunk); else await this.ch.writeValue(chunk);
        await new Promise(r => setTimeout(r, 18));
      }
    },
    async print(sale) {
      if (!sale) return;
      if (!this.isConnected()) { const ok = await this.connect(); if (!ok) return; }
      try { toast('প্রিন্ট হচ্ছে...'); const data = DB.settings.btMode === 'text' ? this.textJob(sale) : await this.imageJob(sale); await this.write(data); toast('প্রিন্ট সম্পন্ন ✓'); }
      catch (e) { console.error(e); toast('⚠️ প্রিন্ট ব্যর্থ: ' + (e.message || 'ত্রুটি')); }
    },
    // ---- ছবি মোড (বাংলা সহ) ----
    lines(s) {
      const sh = DB.settings; const cust = C.findCustomer(s.customerId); const bal = cust ? C.customerBalance(cust.id) : 0; const L = [];
      const MN = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল', due: 'বাকি' };
      L.push({ t: sh.shopName || 'ProPOS', a: 'c', b: 1, s: 28 });
      if (sh.shopAddress) L.push({ t: sh.shopAddress, a: 'c', s: 20 }); if (sh.shopPhone) L.push({ t: 'ফোন: ' + sh.shopPhone, a: 'c', s: 20 });
      L.push({ hr: 1 }, { t: 'রসিদ নং', t2: '#' + C.invLabel(s), s: 21 }, { t: 'তারিখ', t2: C.fmtDT(s.date), s: 21 });
      if (cust) L.push({ t: 'ক্রেতা', t2: cust.name, s: 21 }); L.push({ t: 'পেমেন্ট', t2: MN[s.paymentMethod] || '', s: 21 }, { hr: 1 });
      s.items.forEach(i => { L.push({ t: i.name, s: 22, b: 1 }); L.push({ t: i.qty + ' × ' + fmt(i.price), t2: fmt(i.price * i.qty), s: 21 }); });
      L.push({ hr: 1 }, { t: 'সাবটোটাল', t2: fmt(s.subtotal), s: 21 });
      if (s.discount > 0) L.push({ t: 'ডিসকাউন্ট', t2: '-' + fmt(s.discount), s: 21 }); if (s.tax > 0) L.push({ t: 'ট্যাক্স', t2: fmt(s.tax), s: 21 });
      L.push({ t: 'মোট', t2: '৳' + fmt(s.total), s: 28, b: 1 }, { t: 'জমা', t2: fmt(s.paid), s: 21 });
      if (s.change > 0) L.push({ t: 'ফেরত দেওয়া', t2: fmt(s.change), s: 21 }); if (s.due > 0) L.push({ t: 'এই বিলে বাকি', t2: fmt(s.due), s: 23, b: 1 });
      if (cust && bal > 0) L.push({ t: 'মোট বাকি', t2: fmt(bal), s: 23, b: 1 });
      L.push({ hr: 1 }, { t: sh.footer || '', a: 'c', s: 20 }, { gap: 40 });
      return L;
    },
    async imageJob(sale) {
      const W = DB.settings.paper === '80' ? 576 : 384; const pad = 6;
      try { await document.fonts.load('20px "Noto Sans Bengali"'); } catch (_) {}
      const cv = document.createElement('canvas'); cv.width = W; let ctx = cv.getContext('2d');
      const font = (s, b) => `${b ? '700 ' : ''}${s}px "Noto Sans Bengali", sans-serif`;
      const wrap = (txt, maxW, f) => { ctx.font = f; const out = []; let line = ''; String(txt).split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; };
      const layout = []; let y = 4;
      this.lines(sale).forEach(l => {
        if (l.hr) { layout.push({ hr: 1, y: y + 6 }); y += 14; return; } if (l.gap) { y += l.gap; return; }
        const f = font(l.s, l.b); const lh = Math.round(l.s * 1.45);
        if (l.t2 !== undefined) { ctx.font = f; const rw = ctx.measureText(l.t2).width; const lines = wrap(l.t, W - rw - pad * 3, f); lines.forEach((ln, k) => { layout.push({ f, x: pad, y: y + lh * (k + 1) - 6, t: ln }); }); layout.push({ f, right: 1, y: y + lh - 6, t: l.t2 }); y += lh * Math.max(1, lines.length); }
        else { wrap(l.t, W - pad * 2, f).forEach(ln => { layout.push({ f, c: l.a === 'c', y: y + lh - 6, t: ln, x: pad }); y += lh; }); }
      });
      cv.height = y + 10; ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, cv.height); ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
      layout.forEach(it => { if (it.hr) { for (let x = 0; x < W; x += 8) ctx.fillRect(x, it.y, 4, 2); return; } ctx.font = it.f; const w = ctx.measureText(it.t).width; ctx.fillText(it.t, it.right ? W - pad - w : it.c ? (W - w) / 2 : it.x, it.y); });
      const img = ctx.getImageData(0, 0, W, cv.height).data; const bpr = W / 8; const out = [0x1B, 0x40, 0x1B, 0x61, 0x00];
      for (let y0 = 0; y0 < cv.height; y0 += 96) {
        const h = Math.min(96, cv.height - y0); out.push(0x1D, 0x76, 0x30, 0x00, bpr & 255, bpr >> 8, h & 255, h >> 8);
        for (let yy = 0; yy < h; yy++) for (let bx = 0; bx < bpr; bx++) { let byte = 0; for (let bit = 0; bit < 8; bit++) { const i = ((y0 + yy) * W + bx * 8 + bit) * 4; const lum = img[i] * .3 + img[i + 1] * .59 + img[i + 2] * .11; if (lum < 150 && img[i + 3] > 20) byte |= 0x80 >> bit; } out.push(byte); }
      }
      out.push(0x1B, 0x64, 0x04, 0x1D, 0x56, 0x01); return new Uint8Array(out);
    },
    // ---- টেক্সট মোড (শুধু ইংরেজি/সংখ্যা) ----
    textJob(s) {
      const sh = DB.settings; const w = sh.paper === '80' ? 48 : 32; const asc = t => String(t || '').replace(/[^\x20-\x7E]/g, '?');
      const lr = (a, b) => { a = asc(a); b = asc(b); return a.slice(0, Math.max(1, w - b.length - 1)).padEnd(w - b.length) + b + '\n'; };
      const e = new TextEncoder(); const o = []; const t = x => e.encode(x).forEach(c => o.push(c));
      o.push(0x1B, 0x40, 0x1B, 0x61, 0x01, 0x1B, 0x21, 0x30); t(asc(sh.shopName || 'ProPOS') + '\n'); o.push(0x1B, 0x21, 0x00); if (sh.shopPhone) t('Tel: ' + asc(sh.shopPhone) + '\n'); t('-'.repeat(w) + '\n'); o.push(0x1B, 0x61, 0x00);
      t(lr('No', '#' + C.invLabel(s))); t(lr('Date', C.dkey(s.date))); t('-'.repeat(w) + '\n');
      s.items.forEach(i => { t(asc(i.name) + '\n'); t(lr('  ' + i.qty + ' x ' + i.price.toFixed(2), (i.price * i.qty).toFixed(2))); });
      t('-'.repeat(w) + '\n'); t(lr('Subtotal', s.subtotal.toFixed(2))); if (s.discount > 0) t(lr('Discount', '-' + s.discount.toFixed(2))); if (s.tax > 0) t(lr('Tax', s.tax.toFixed(2)));
      o.push(0x1B, 0x21, 0x08); t(lr('TOTAL', s.total.toFixed(2))); o.push(0x1B, 0x21, 0x00); t(lr('Paid', s.paid.toFixed(2))); if (s.due > 0) t(lr('DUE', s.due.toFixed(2)));
      o.push(0x1B, 0x61, 0x01); t('\nThank You!\n\n\n\n'); o.push(0x1D, 0x56, 0x01); return new Uint8Array(o);
    }
  };

  // ================= সেটিংস =================
  App.Views.settings = {
    render() {
      const s = DB.settings; let bytes = 0; try { Object.keys(localStorage).forEach(k => { bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; }); } catch (_) {}
      const kb = Math.round(bytes / 1024); const last = parseInt(localStorage.getItem('propos_last_backup') || '0', 10);
      $('view').innerHTML = `<div class="page-head"><div><h2>সেটিংস</h2><p>দোকান, চেহারা, নিরাপত্তা, প্রিন্টার ও ডেটা</p></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-store ptext"></i> দোকানের তথ্য</div>
        <div class="field"><label class="label">দোকানের নাম</label><input id="st-name" class="input" value="${esc(s.shopName)}"></div>
        <div class="field"><label class="label">ঠিকানা</label><input id="st-addr" class="input" value="${esc(s.shopAddress)}"></div>
        <div class="grid2"><div class="field"><label class="label">ফোন</label><input id="st-phone" class="input" value="${esc(s.shopPhone)}"></div><div class="field"><label class="label">ডিফল্ট ট্যাক্স (%)</label><input id="st-tax" type="number" step="any" min="0" class="input" value="${s.defaultTax || 0}"></div></div>
        <div class="field"><label class="label">রসিদের নিচের লেখা</label><input id="st-foot" class="input" value="${esc(s.footer)}"></div>
        <div class="grid3"><div class="field"><label class="label">রসিদ নম্বরের আগে</label><input id="st-pre" class="input" value="${esc(s.invPrefix)}" placeholder="INV-"></div><div class="field"><label class="label">কাগজ</label><select id="st-paper" class="input"><option value="58" ${s.paper === '58' ? 'selected' : ''}>৫৮ মিমি</option><option value="80" ${s.paper === '80' ? 'selected' : ''}>৮০ মিমি</option></select></div><div class="field"><label class="label">কম স্টক (ডিফল্ট)</label><input id="st-low" type="number" min="0" class="input" value="${s.lowStockDefault || 5}"></div></div>
        <button class="btn btn-primary btn-block" onclick="Settings.save()"><i class="fas fa-floppy-disk"></i> সংরক্ষণ</button></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-palette ptext"></i> চেহারা ও সাউন্ড</div>
        <div class="field"><label class="label">থিম</label><select id="theme-select" class="input" onchange="Theme.set(this.value)"><option value="auto">স্বয়ংক্রিয় (ফোনের সেটিং)</option><option value="light">লাইট মোড</option><option value="dark">ডার্ক মোড</option></select></div>
        <label class="switch"><span class="sm fw6"><i class="fas fa-volume-high ptext"></i> ক্লিক সাউন্ড</span><input type="checkbox" ${Sound.isEnabled() ? 'checked' : ''} onchange="Sound.setEnabled(this.checked)"></label></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-lock ptext"></i> নিরাপত্তা (PIN লক)</div><p class="muted sm mb3">${Lock.has() ? 'PIN চালু আছে। অ্যাপ খুললে ও ১ মিনিটের বেশি ব্যাকগ্রাউন্ডে থাকলে PIN চাইবে।' : 'PIN দিলে অন্য কেউ আপনার বিক্রয় ও হিসাব দেখতে পারবে না।'}</p>
        <div class="flex gap2"><button class="btn btn-primary" onclick="Lock.setup()">${Lock.has() ? 'PIN পরিবর্তন' : 'PIN সেট করুন'}</button>${Lock.has() ? '<button class="btn btn-ghost" onclick="Lock.lockNow()">এখনই লক</button><button class="btn btn-danger-soft" onclick="Lock.remove()">বন্ধ করুন</button>' : ''}</div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fab fa-bluetooth-b ptext"></i> ব্লুটুথ প্রিন্টার</div><div class="mb3" id="bt-status"></div>
        <div class="field"><label class="label">প্রিন্ট মোড</label><select class="input" onchange="DB_.btMode(this.value)"><option value="image" ${s.btMode !== 'text' ? 'selected' : ''}>ছবি মোড — বাংলা সহ (প্রস্তাবিত)</option><option value="text" ${s.btMode === 'text' ? 'selected' : ''}>টেক্সট মোড — শুধু ইংরেজি, দ্রুত</option></select></div>
        <div class="flex gap2"><button class="btn btn-primary grow" id="bt-conn" onclick="Printer.connect()"><i class="fab fa-bluetooth-b"></i> প্রিন্টার সংযুক্ত করুন</button><button class="btn btn-danger-soft grow hidden" id="bt-disc" onclick="Printer.disconnect()">বিচ্ছিন্ন করুন</button></div>
        <p class="xs muted mt2">Android Chrome/Edge-এ কাজ করে। প্রিন্টারটি আগে ফোনের ব্লুটুথে পেয়ার করা থাকলে ভালো।</p></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fab fa-google ptext"></i> Google Drive ক্লাউড ব্যাকআপ</div><div class="js-cloud-body"></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-database ptext"></i> ডেটা ব্যবস্থাপনা</div>
        <div class="kv"><span class="muted">শেষ ব্যাকআপ</span><b>${last ? C.fmtDT(new Date(last).toISOString()) : 'কখনো নেওয়া হয়নি'}</b></div><div class="kv"><span class="muted">ব্যবহৃত স্টোরেজ</span><b class="${kb > 4000 ? 'bad' : ''}">${kb} KB / প্রায় ৫০০০ KB</b></div>
        <div class="grid2 mt3"><button class="btn btn-primary" onclick="exportData()"><i class="fas fa-cloud-arrow-down"></i> ব্যাকআপ</button><label class="btn btn-ghost" style="cursor:pointer"><i class="fas fa-file-import"></i> রিস্টোর<input type="file" accept="application/json,.json" class="hidden" onchange="importData(this)"></label></div>
        <button class="btn btn-danger-soft btn-block mt2" onclick="wipeAllData()"><i class="fas fa-trash"></i> সব ডেটা মুছুন</button></div>
      <div class="tc muted xs">ProPOS v7 · ফ্রি অফলাইন POS · ডেটা আপনার ডিভাইসেই থাকে</div>`;
      Theme.apply(); Printer.ui(); if (window.Cloud) Cloud.renderUI();
    },
    save() {
      const s = DB.settings; s.shopName = $('st-name').value.trim() || 'আমার দোকান'; s.shopAddress = $('st-addr').value.trim(); s.shopPhone = $('st-phone').value.trim();
      s.defaultTax = num($('st-tax').value); s.footer = $('st-foot').value.trim(); s.invPrefix = $('st-pre').value.trim(); s.paper = $('st-paper').value; s.lowStockDefault = num($('st-low').value) || 5;
      C.save('settings'); POS.taxInit(); POS.renderCart(); toast('সেটিংস সংরক্ষিত ✓');
    }
  };
  window.Settings = App.Views.settings;
  window.DB_ = { btMode(v) { DB.settings.btMode = v; C.save('settings'); } };
})();
