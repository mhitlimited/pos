/* ProPOS: Settings, Barcode scanার, PIN lock, Bluetooth printer */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, money, fmt, toast } = C;
  const $ = id => document.getElementById(id);

  // ================= Barcode scanার (ক্যামেরা) =================
  // cb(code) false Returns দিলে ক্যামেরা খোলা থাকে (যেমন Barcode মেলেনি); অন্যথায় non-continuous মোডে স্ক্যান হওয়ার সাথে সাথে Close হয়।
  const Scanner = window.Scanner = {
    el: null, stream: null, timer: null, last: '', lastT: 0, busy: false, opening: false, tok: 0, msgT: null,
    isOpen() { return !!this.el || this.opening; },
    async open(cb, o) {
      o = o || {};
      if (this.el || this.opening) return;
      if (!('BarcodeDetector' in window)) { toast('⚠️ Camera scan not available in this browser। Use USB/Bluetooth scanner or type.'); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('⚠️ Camera not available (HTTPS required)'); return; }
      let det; try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] }); } catch (_) { try { det = new BarcodeDetector(); } catch (e2) { toast('⚠️ Camera scan not available in this browser'); return; } }
      const tok = ++this.tok; this.opening = true;
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
      catch (e) { this.opening = false; toast(e && e.name === 'NotFoundError' ? '⚠️ No camera found on device' : '⚠️ Camera permission denied'); return; }
      this.opening = false;
      if (tok !== this.tok) { stream.getTracks().forEach(t => t.stop()); return; }   // খোলার মাঝে Back/Close Teaপা হয়েছে
      this.stream = stream;
      const el = document.createElement('div'); el.className = 'scan';
      el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div><div class="bar-top"><b>Barcode scan</b><button type="button" class="btn btn-sm" id="sc-x">Close</button></div><div class="sc-msg hidden" id="sc-msg"></div><div class="bar-bot">${esc(o.hint || 'Hold barcode inside the frame')}</div>`;
      document.body.appendChild(el); this.el = el; this.last = ''; this.lastT = 0; this.busy = false; syncLock();
      const v = el.querySelector('video'); v.srcObject = stream; try { await v.play(); } catch (_) {}
      el.querySelector('#sc-x').onclick = () => this.close();
      this.timer = setInterval(async () => {
        if (!this.el || this.busy || v.readyState < 2) return;
        this.busy = true;
        try {
          const codes = await det.detect(v);
          if (!this.el || tok !== this.tok || !codes.length) return;
          const code = String(codes[0].rawValue || '').trim(); if (!code) return;
          const now = Date.now();
          if (code === this.last && now - this.lastT < 1800) return;
          this.last = code; this.lastT = now; Sound.play('beep'); if (navigator.vibrate) navigator.vibrate(40);
          const keep = cb(code);
          if (!o.continuous && keep !== false) this.close();
        } catch (_) {} finally { this.busy = false; }
      }, 220);
    },
    // ক্যামেরা স্ক্রিনের ওLaterই বার্তা দেখায় (toast ক্যামেরার নিচে ঢাকা পড়ে যেত)
    flash(msg, kind) {
      const m = this.el && this.el.querySelector('#sc-msg'); if (!m) { toast(msg); return; }
      m.textContent = msg; m.className = 'sc-msg ' + (kind || '');
      clearTimeout(this.msgT); this.msgT = setTimeout(() => { if (m) m.classList.add('hidden'); }, 2200);
    },
    close() {
      this.tok++; this.opening = false; clearInterval(this.timer); this.timer = null; clearTimeout(this.msgT);
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (this.el) { const v = this.el.querySelector('video'); if (v) v.srcObject = null; this.el.remove(); this.el = null; }
      this.busy = false; syncLock();
    }
  };
  // অ্যাপ ব্যাকগ্রাউন্ডে গেলে ক্যামেরা ছেড়ে দিন
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Scanner.isOpen()) Scanner.close(); });

  // ================= PIN lock =================
  async function hashPin(pin, salt) {
    const s = salt + ':' + pin;
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    let h1 = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { h1 = (h1 * 33) ^ s.charCodeAt(i); h2 = (h2 * 33) ^ s.charCodeAt(s.length - 1 - i); } return 'x' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  const Lock = window.Lock = {
    hiddenAt: 0, el: null, fails: 0, until: 0,
    has() { return !!DB.settings.pinHash; },
    init(start) { if (this.has()) this.show(start); else start(); },
    lockNow() { if (!this.has()) { toast('Set PIN in Settings first'); return; } this.show(() => {}); },
    onHide() { this.hiddenAt = Date.now(); },
    onResume() { if (this.has() && !this.el && this.hiddenAt && Date.now() - this.hiddenAt > 60000) this.show(() => {}); },
    show(done) {
      if (this.el) return; let pin = '';
      const el = document.createElement('div'); el.className = 'lock';
      el.innerHTML = `<div class="logo" style="width:64px;height:64px;font-size:28px;background:rgba(255,255,255,.2)"><i class="fas fa-lock"></i></div><h2>${esc(DB.settings.shopName)}</h2><p>Unlock with PIN</p><div class="dots" id="lk-dots"><i></i><i></i><i></i><i></i></div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
        <button type="button" id="lk-forgot" style="margin-top:26px;background:none;border:0;color:#fff;opacity:.7;font-size:13px;cursor:pointer;text-decoration:underline">Forgot PIN?</button>`;
      document.body.appendChild(el); this.el = el; syncLock();
      const dots = el.querySelectorAll('#lk-dots i');
      const paint = () => dots.forEach((d, i) => d.classList.toggle('f', i < pin.length));
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
        const k = b.dataset.k; if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k; paint();
        if (pin.length === 4) {
          if (Date.now() < this.until) { toast('⚠️ Too many wrong attempts — ' + Math.ceil((this.until - Date.now()) / 1000) + ' seconds, try later'); pin = ''; paint(); return; }
          const h = await hashPin(pin, DB.settings.pinSalt);
          if (h === DB.settings.pinHash) { this.fails = 0; el.remove(); this.el = null; syncLock(); done && done(); }
          else {
            if (++this.fails >= 5) { this.until = Date.now() + 30000; this.fails = 0; toast('⚠️ Too many wrong attempts — wait 30 seconds'); }
            const d = el.querySelector('#lk-dots'); d.classList.add('shake'); if (navigator.vibrate) navigator.vibrate(120); setTimeout(() => { d.classList.remove('shake'); pin = ''; paint(); }, 450);
          }
        }
      });
      el.querySelector('#lk-forgot').onclick = () => askConfirm('If you forget the PIN, the only way is to wipe all data and start over. Continue?', () => { wipeAllData(); }, { danger: true, yes: 'Wipe & Reset Data', title: 'Reset PIN' });
    },
    setup() {
      const has = this.has();
      const m = Modal.open({ title: has ? 'Change PIN' : 'Set PIN', body: `${has ? '<div class="field"><label class="label">Current PIN</label><input id="pn-old" type="password" inputmode="numeric" maxlength="4" class="input"></div>' : ''}
        <div class="field"><label class="label">New PIN (4 digits)</label><input id="pn-new" type="password" inputmode="numeric" maxlength="4" class="input" ${has ? '' : 'autofocus'}></div>
        <div class="field"><label class="label">Re-enter</label><input id="pn-new2" type="password" inputmode="numeric" maxlength="4" class="input"></div>
        <p class="xs muted">⚠️ If you forget the PIN you must reset data — keep cloud backup enabled.</p>`, foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="pn-ok">Save</button>` });
      m.querySelector('#pn-ok').onclick = async () => {
        if (has && (await hashPin($('pn-old').value, DB.settings.pinSalt)) !== DB.settings.pinHash) { toast('⚠️ Current PIN is wrong'); return; }
        const a = $('pn-new').value, b = $('pn-new2').value; if (!/^\d{4}$/.test(a)) { toast('⚠️ Enter exactly 4 digits'); return; } if (a !== b) { toast('⚠️ PINs do not match'); return; }
        const salt = C.genId(); DB.settings.pinSalt = salt; DB.settings.pinHash = await hashPin(a, salt); C.save('settings'); Modal.close(m); toast('PIN set ✓'); App.refresh();
      };
    },
    remove() {
      const m = Modal.open({ title: 'Disable PIN', body: '<div class="field"><label class="label">Current PIN</label><input id="pn-old" type="password" inputmode="numeric" maxlength="4" class="input" autofocus></div>', foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-bad" id="pn-ok">Disable PIN</button>` });
      m.querySelector('#pn-ok').onclick = async () => { if ((await hashPin($('pn-old').value, DB.settings.pinSalt)) !== DB.settings.pinHash) { toast('⚠️ Wrong PIN'); return; } DB.settings.pinHash = ''; DB.settings.pinSalt = ''; C.save('settings'); Modal.close(m); toast('PIN disabled'); App.refresh(); };
    }
  };

  // ================= Bluetooth printer =================
  const SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000ffb0-0000-1000-8000-00805f9b34fb'];
  const Printer = window.Printer = {
    dev: null, ch: null, name: '',
    isConnected() { return !!(this.ch && this.dev && this.dev.gatt && this.dev.gatt.connected); },
    ui() {
      const ok = this.isConnected(); const s = $('bt-status'); if (s) s.innerHTML = ok ? `<span class="badge b-ok">● Connected: ${esc(this.name)}</span>` : '<span class="badge">● Not connected</span>';
      const c = $('bt-conn'), d = $('bt-disc'); if (c) c.classList.toggle('hidden', ok); if (d) d.classList.toggle('hidden', !ok);
    },
    async connect() {
      if (!navigator.bluetooth) { toast('⚠️ Web Bluetooth not available. Use Android Chrome/Edge.'); return false; }
      try {
        toast('Searching for printer...');
        this.dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
        this.dev.addEventListener('gattserverdisconnected', () => { this.ch = null; this.ui(); toast('Printer disconnected'); });
        const server = await this.dev.gatt.connect(); const services = await server.getPrimaryServices(); let found = null;
        for (const sv of services) { const cs = await sv.getCharacteristics(); for (const c of cs) { if (c.properties.write || c.properties.writeWithoutResponse) { found = c; break; } } if (found) break; }
        if (!found) throw new Error('Printer write channel not available');
        this.ch = found; this.name = this.dev.name || 'Printer'; this.ui(); toast('Printer connected ✓'); return true;
      } catch (e) { console.error(e); toast(e.name === 'NotFoundError' ? 'No device selected' : '⚠️ Connection failed: ' + (e.message || '')); this.ch = null; this.ui(); return false; }
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
      try { toast('Printing...'); const data = DB.settings.btMode === 'text' ? this.textJob(sale) : await this.imageJob(sale); await this.write(data); toast('Print done ✓'); }
      catch (e) { console.error(e); toast('⚠️ Print failed: ' + (e.message || 'Error')); }
    },
    // ---- Image মোড (বাংলা সহ) ----
    lines(s) {
      const sh = DB.settings; const cust = C.findCustomer(s.customerId); const bal = cust ? C.customerBalance(cust.id) : 0; const L = [];
      const MN = { cash: 'Cash', card: 'Card', mobile: 'Mobile', due: 'Due' };
      L.push({ t: sh.shopName || 'ProPOS', a: 'c', b: 1, s: 28 });
      if (sh.shopAddress) L.push({ t: sh.shopAddress, a: 'c', s: 20 }); if (sh.shopPhone) L.push({ t: 'Phone: ' + sh.shopPhone, a: 'c', s: 20 });
      L.push({ hr: 1 }, { t: 'Receipt #', t2: '#' + C.invLabel(s), s: 21 }, { t: 'Date', t2: C.fmtDT(s.date), s: 21 });
      if (cust) L.push({ t: 'Customer', t2: cust.name, s: 21 }); L.push({ t: 'Payment', t2: MN[s.paymentMethod] || '', s: 21 }, { hr: 1 });
      s.items.forEach(i => { L.push({ t: i.name, s: 22, b: 1 }); L.push({ t: i.qty + ' × ' + fmt(i.price), t2: fmt(i.price * i.qty), s: 21 }); });
      L.push({ hr: 1 }, { t: 'Subtotal', t2: fmt(s.subtotal), s: 21 });
      if (s.discount > 0) L.push({ t: 'Discount', t2: '-' + fmt(s.discount), s: 21 }); if (s.tax > 0) L.push({ t: 'Tax', t2: fmt(s.tax), s: 21 });
      L.push({ t: 'Total', t2: '৳' + fmt(s.total), s: 28, b: 1 }, { t: 'Paid', t2: fmt(s.paid), s: 21 });
      if (s.change > 0) L.push({ t: 'Change given', t2: fmt(s.change), s: 21 }); if (s.due > 0) L.push({ t: 'Due on this bill', t2: fmt(s.due), s: 23, b: 1 });
      if (cust && bal > 0) L.push({ t: 'Total Due', t2: fmt(bal), s: 23, b: 1 });
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

  // ================= Settings =================
  App.Views.settings = {
    render() {
      const s = DB.settings; let bytes = 0; try { Object.keys(localStorage).forEach(k => { bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; }); } catch (_) {}
      const kb = Math.round(bytes / 1024); const last = parseInt(localStorage.getItem('propos_last_backup') || '0', 10);
      $('view').innerHTML = `<div class="page-head"><div><h2>Settings</h2><p>Shop, appearance, security, printer & data</p></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-store ptext"></i> Shop info</div>
        <div class="field"><label class="label">Shop name</label><input id="st-name" class="input" value="${esc(s.shopName)}"></div>
        <div class="field"><label class="label">Address</label><input id="st-addr" class="input" value="${esc(s.shopAddress)}"></div>
        <div class="grid2"><div class="field"><label class="label">Phone</label><input id="st-phone" class="input" value="${esc(s.shopPhone)}"></div><div class="field"><label class="label">Default tax (%)</label><input id="st-tax" type="number" step="any" min="0" class="input" value="${s.defaultTax || 0}"></div></div>
        <div class="field"><label class="label">Receipt footer text</label><input id="st-foot" class="input" value="${esc(s.footer)}"></div>
        <div class="grid3"><div class="field"><label class="label">Invoice prefix</label><input id="st-pre" class="input" value="${esc(s.invPrefix)}" placeholder="INV-"></div><div class="field"><label class="label">Paper</label><select id="st-paper" class="input"><option value="58" ${s.paper === '58' ? 'selected' : ''}>58 mm</option><option value="80" ${s.paper === '80' ? 'selected' : ''}>80 mm</option></select></div><div class="field"><label class="label">Low stock (default)</label><input id="st-low" type="number" min="0" class="input" value="${s.lowStockDefault || 5}"></div></div>
        <button class="btn btn-primary btn-block" onclick="Settings.save()"><i class="fas fa-floppy-disk"></i> Save</button></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-palette ptext"></i> Appearance & sound</div>
        <div class="field"><label class="label">Theme</label><select id="theme-select" class="input" onchange="Theme.set(this.value)"><option value="auto">Auto (device setting)</option><option value="light">Light mode</option><option value="dark">Dark mode</option></select></div>
        <label class="switch"><span class="sm fw6"><i class="fas fa-volume-high ptext"></i> Click sound</span><input type="checkbox" ${Sound.isEnabled() ? 'checked' : ''} onchange="Sound.setEnabled(this.checked)"></label></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-lock ptext"></i> Security (PIN lock)</div><p class="muted sm mb3">${Lock.has() ? 'PIN is set. App will ask for PIN on open and after 1+ min in background.' : 'With a PIN, others cannot see your sales and accounts.'}</p>
        <div class="flex gap2"><button class="btn btn-primary" onclick="Lock.setup()">${Lock.has() ? 'Change PIN' : 'Set PIN'}</button>${Lock.has() ? '<button class="btn btn-ghost" onclick="Lock.lockNow()">Lock now</button><button class="btn btn-danger-soft" onclick="Lock.remove()">Close</button>' : ''}</div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fab fa-bluetooth-b ptext"></i> Bluetooth printer</div><div class="mb3" id="bt-status"></div>
        <div class="field"><label class="label">Print mode</label><select class="input" onchange="DB_.btMode(this.value)"><option value="image" ${s.btMode !== 'text' ? 'selected' : ''}>Image mode — supports all languages (recommended)</option><option value="text" ${s.btMode === 'text' ? 'selected' : ''}>Text mode — English only, faster</option></select></div>
        <div class="flex gap2"><button class="btn btn-primary grow" id="bt-conn" onclick="Printer.connect()"><i class="fab fa-bluetooth-b"></i> Connect printer</button><button class="btn btn-danger-soft grow hidden" id="bt-disc" onclick="Printer.disconnect()">Disconnect</button></div>
        <p class="xs muted mt2">Works on Android Chrome/Edge. Pair the printer in phone Bluetooth first.</p></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fab fa-google ptext"></i> Google Drive Cloud Backup</div><div class="js-cloud-body"></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-database ptext"></i> Data management</div>
        <div class="kv"><span class="muted">Storage used</span><b class="${kb > 4000 ? 'bad' : ''}">${kb} KB / ~5000 KB</b></div>
        <p class="xs muted mt2">Data is stored on this device and backed up to Google Drive when signed in. Local file backup has been removed.</p>
        <button class="btn btn-danger-soft btn-block mt2" onclick="wipeAllData()"><i class="fas fa-trash"></i> Delete all data</button></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-scale-balanced ptext"></i> Legal</div>
        <div class="grid2"><a class="btn btn-ghost" href="privacy.html" target="_blank" rel="noopener"><i class="fas fa-user-shield"></i> Privacy Policy</a><a class="btn btn-ghost" href="terms.html" target="_blank" rel="noopener"><i class="fas fa-file-contract"></i> Terms of Service</a></div></div>
      <div class="tc muted xs">ProPOS v8 · Free offline POS · Data stays on your device<br>© MH IT Limited · <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a></div>`;
      Theme.apply(); Printer.ui(); if (window.Cloud) Cloud.renderUI();
    },
    save() {
      const s = DB.settings; s.shopName = $('st-name').value.trim() || 'My Shop'; s.shopAddress = $('st-addr').value.trim(); s.shopPhone = $('st-phone').value.trim();
      s.defaultTax = Math.max(0, num($('st-tax').value)); s.footer = $('st-foot').value.trim(); s.invPrefix = $('st-pre').value.trim(); s.paper = $('st-paper').value; s.lowStockDefault = num($('st-low').value) || 5;
      C.save('settings'); POS.taxInit(); POS.renderCart(); toast('Settings Saved ✓');
    }
  };
  window.Settings = App.Views.settings;
  window.DB_ = { btMode(v) { DB.settings.btMode = v; C.save('settings'); } };
})();
