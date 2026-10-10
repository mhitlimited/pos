/* ProPOS App: রাউটার, ব্যাক-বাটন, Sales Counter (POS), Product */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, r2, fmt, money, genId, toast, findProduct, findCustomer } = C;
  const $ = id => document.getElementById(id);

  // ================= রাউটার =================
  const NAV = [
    { id: 'pos', label: 'Sales Counter', icon: 'fa-store' },
    { id: 'customers', label: 'Customers & Due', icon: 'fa-user-group' },
    { id: 'products', label: 'Products & Stock', icon: 'fa-box-open' },
    { id: 'purchases', label: 'Purchases & Suppliers', icon: 'fa-truck' },
    { id: 'expenses', label: 'Expenses', icon: 'fa-money-bill-wave' },
    { id: 'history', label: 'Sales History', icon: 'fa-file-invoice' },
    { id: 'reports', label: 'Reports', icon: 'fa-chart-column' },
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
    { id: 'settings', label: 'Settings', icon: 'fa-sliders' }
  ];
  const Views = {};
  const App = window.App = {
    view: 'pos', Views,
    go(v) {
      if (!Views[v]) v = 'pos';
      Modal.closeAll(); App.closeDrawers(); App.view = v; document.body.dataset.view = v;
      document.querySelectorAll('.nav-link[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === v));
      Views[v].render(); window.scrollTo(0, 0);
    },
    refresh() { Views[App.view] && Views[App.view].render(); },
    toggleNav() { const d = $('mobile-nav'); const o = d.classList.contains('open'); App.closeDrawers(); if (!o) { d.classList.add('open'); $('scrim').classList.remove('hidden'); } syncLock(); },
    toggleCart() { const d = $('mobile-cart'); const o = d.classList.contains('open'); App.closeDrawers(); if (!o) { d.classList.add('open'); $('scrim').classList.remove('hidden'); } syncLock(); },
    closeDrawers() { document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open')); $('scrim').classList.add('hidden'); syncLock(); },
    drawerOpen() { return !!document.querySelector('.drawer.open'); }
  };

  function buildNav() {
    const html = NAV.map(n => `<button type="button" class="nav-link" data-v="${n.id}" onclick="App.go('${n.id}')"><i class="fas ${n.icon}"></i> ${n.label}</button>`).join('');
    $('nav-desk').innerHTML = html; $('nav-mob').innerHTML = html;
  }

  // ================= ব্যাক বাটন =================
  let exitArmed = false;
  function pushGuard() { try { history.pushState({ g: 1 }, ''); } catch (_) {} }
  function handleBack() {
    if (window.hasConfirm && hasConfirm()) { closeConfirm(); return true; }
    if (document.querySelector('.lock,.welcome')) return true;
    if (window.Scanner && Scanner.isOpen()) { Scanner.close(); return true; }
    if (Modal.stack.length) { Modal.close(); return true; }
    if (App.drawerOpen()) { App.closeDrawers(); return true; }
    if (App.view !== 'pos') { App.go('pos'); return true; }
    return false;
  }
  try { history.replaceState({ root: 1 }, ''); pushGuard(); } catch (_) {}
  window.addEventListener('popstate', () => {
    if (handleBack()) { pushGuard(); return; }
    if (exitArmed) return;                       // দ্বিতীয় Back — সিস্টেম অ্যাপ Close করবে
    exitArmed = true; toast('Press Back again to exit');
    setTimeout(() => { if (exitArmed) { exitArmed = false; pushGuard(); } }, 2500);
  });

  // ================= অ্যানিমেশন: Product Cartে উড়ে যায় =================
  const Fx = window.Fx = {
    reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; },
    cartTarget() {
      const d = $('cart-desk');
      if (d && d.getClientRects().length) return d.querySelector('.cart-ico');
      const b = $('cart-bar');
      if (b && b.getClientRects().length) return b.querySelector('.cb-ico');
      return document.querySelector('#cart-bar');
    },
    added(id, quiet) {
      const card = document.querySelector('#pgrid .pcard[data-id="' + id + '"]');
      if (card) {
        card.classList.remove('added'); void card.offsetWidth; card.classList.add('added');
        const q = card.querySelector('.pqty'); if (q) { q.classList.remove('pop'); void q.offsetWidth; q.classList.add('pop'); }
      }
      const src = !quiet && card ? card.querySelector('.pimg') : null;
      const tgt = this.cartTarget();
      if (!src || !tgt || this.reduced()) { this.landed(); return; }
      const s = src.getBoundingClientRect(), t = tgt.getBoundingClientRect();
      if (!s.width || !t.width) { this.landed(); return; }
      const size = Math.min(s.width, s.height, 76);
      const sx = s.left + s.width / 2, sy = s.top + s.height / 2, tx = t.left + t.width / 2, ty = t.top + t.height / 2;
      const g = src.cloneNode(true); g.className = 'fly-ghost';
      g.style.cssText = 'left:' + (sx - size / 2) + 'px;top:' + (sy - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px';
      document.body.appendChild(g);
      const dx = tx - sx, dy = ty - sy, lift = Math.min(130, Math.max(60, Math.abs(dy) * 0.3));
      const a = g.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
        { transform: 'translate(' + dx * 0.4 + 'px,' + (dy * 0.4 - lift) + 'px) scale(.82) rotate(-10deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2) rotate(14deg)', opacity: 0.55, offset: 1 }
      ], { duration: 720, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' });
      const done = () => { g.remove(); this.landed(); };
      a.onfinish = done; a.oncancel = () => g.remove();
    },
    landed() {
      const tgt = this.cartTarget();
      document.querySelectorAll('#cart-badge,.cb-count,.cart-bar .cb-ico,#cart-desk .cart-ico').forEach(e => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); });
      if (tgt && !this.reduced()) {
        const r = tgt.getBoundingClientRect();
        if (r.width) { const ring = document.createElement('div'); ring.className = 'fly-ring'; ring.style.left = (r.left + r.width / 2) + 'px'; ring.style.top = (r.top + r.height / 2) + 'px'; document.body.appendChild(ring); setTimeout(() => ring.remove(), 700); }
      }
    }
  };

  // ================= Sales Counter =================
  const POS = window.POS = {
    cat: 'all', q: '', limit: 120, disc: 0, discType: 'percent', tax: 0, customerId: null, note: '', payMethod: 'cash',
    taxInit() { this.tax = num(DB.settings.defaultTax); },
    totals() {
      const subtotal = r2(DB.cart.reduce((s, c) => s + c.price * c.qty, 0));
      let discount = this.discType === 'percent' ? subtotal * Math.max(0, num(this.disc)) / 100 : Math.max(0, num(this.disc));
      discount = r2(Math.min(Math.max(discount, 0), subtotal));
      const tax = r2((subtotal - discount) * Math.max(0, num(this.tax)) / 100);
      return { subtotal, discount, tax, total: r2(subtotal - discount + tax) };
    },
    render() {
      $('view').innerHTML = `
      <div class="pos-grid"><div>
        <div class="card search-wrap">
          <div class="flex gap2 mb2">
            <div class="relative grow"><i class="fas fa-magnifying-glass search-ico"></i>
              <input id="pos-search" class="input has-ico" placeholder="Search or scan barcode..." value="${esc(this.q)}" oninput="POS.search(this.value)" onkeydown="if(event.key==='Enter')POS.enter()" autocomplete="off"></div>
            <button class="btn btn-soft" onclick="POS.scan()" title="Camera scan"><i class="fas fa-barcode"></i></button>
            <button class="btn btn-soft" onclick="POS.showHold()" title="Held Bills"><i class="fas fa-pause"></i><span id="hold-count"></span></button>
            <span class="scan-ready only-desk" title="USB/Bluetooth barcode scanner ready"><i class="fas fa-plug"></i> Scanner</span>
          </div>
          <div class="chips" id="pos-cats"></div>
        </div>
        <div class="pgrid" id="pgrid"></div>
        <div class="tc mt3"><button class="btn btn-ghost hidden" id="pos-more" onclick="POS.more()">Show more</button></div>
      </div>
      <div class="cart-desk card pad" id="cart-desk"></div></div>`;
      this.renderCats(); this.renderGrid(); this.renderCart();
    },
    renderCats() {
      const cats = [...new Set(DB.products.map(p => p.category).filter(Boolean))].sort();
      const el = $('pos-cats'); if (!el) return;
      el.innerHTML = ['all', ...cats].map(c => `<button class="chip ${this.cat === c ? 'on' : ''}" onclick="POS.setCat(this.dataset.c)" data-c="${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('');
    },
    filtered() {
      const q = this.q.trim().toLowerCase();
      return DB.products.filter(p => (this.cat === 'all' || p.category === this.cat) &&
        (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name, 'bn'));
    },
    renderGrid() {
      const g = $('pgrid'); if (!g) return;
      const list = this.filtered(); const shown = list.slice(0, this.limit);
      if (!DB.products.length) g.innerHTML = '<div class="empty card" style="grid-column:1/-1"><i class="fas fa-box-open"></i>No products yet.<br><button class="btn btn-primary mt3" onclick="Products.edit()">+ Add first product</button></div>';
      else if (!list.length) g.innerHTML = '<div class="empty" style="grid-column:1/-1"><i class="fas fa-magnifying-glass"></i>No products found</div>';
      else g.innerHTML = shown.map(p => {
        const low = p.track !== false && p.stock <= (p.minStock || 0);
        const exp = p.expiry && p.expiry < C.todayKey();
        return `<div class="pcard" data-id="${p.id}" onclick="POS.add('${p.id}')">
          <span class="pqty"></span><span class="added-fx"></span>
          <div class="pimg">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<i class="fas fa-box"></i>'}</div>
          ${exp ? '<span class="ptag">Expired</span>' : (p.track !== false && p.stock <= 0 ? '<span class="ptag">Out of stock</span>' : (low ? '<span class="ptag" style="background:#d97706">Low Stock</span>' : ''))}
          <div class="pname">${esc(p.name)}</div>
          <div class="pmeta"><span class="pprice">${money(p.price)}</span><span class="${low ? 'bad fw6' : 'muted'}">${p.track === false ? '∞' : p.stock + ' ' + esc(C.unitLabel ? C.unitLabel(p.unit) : (p.unit || ''))}</span></div></div>`;
      }).join('');
      const more = $('pos-more'); if (more) more.classList.toggle('hidden', list.length <= this.limit);
      const hc = $('hold-count'); if (hc) hc.textContent = DB.hold.length ? ' ' + DB.hold.length : '';
      this.markCards();
    },
    markCards() {
      const m = {}; DB.cart.forEach(c => { m[c.id] = c.qty; });
      document.querySelectorAll('#pgrid .pcard').forEach(el => { const q = m[el.dataset.id]; el.classList.toggle('sel', !!q); const b = el.querySelector('.pqty'); if (b) b.textContent = q ? '×' + q : ''; });
    },
    search(v) { this.q = v; this.limit = 120; this.renderGrid(); },
    setCat(c) { this.cat = c; this.limit = 120; this.renderCats(); this.renderGrid(); },
    more() { this.limit += 120; this.renderGrid(); },
    // Barcode মেলানো: স্পেস বাদ, আর UPC-A (১২ সংখ্যা)  & EAN-13 (শুরুতে 0) সমান ধরা হয়
    findByBarcode(code) {
      const key = x => { x = String(x == null ? '' : x).trim(); return /^\d{12,13}$/.test(x) ? x.padStart(13, '0') : x; };
      const k = key(code); if (!k) return null;
      return DB.products.find(p => p.barcode && key(p.barcode) === k) || null;
    },
    enter() {
      const q = this.q.trim(); if (!q) return;
      const exact = this.findByBarcode(q);
      const list = this.filtered();
      const p = exact || (list.length === 1 ? list[0] : null);
      if (p) { this.add(p.id); this.q = ''; const s = $('pos-search'); if (s) { s.value = ''; s.focus(); } this.renderGrid(); }
      else toast('Multiple or no match');
    },
    scan() {
      if (!window.Scanner || Scanner.isOpen()) return;
      Scanner.open(code => {
        const p = this.findByBarcode(code);
        if (!p) { Scanner.flash('⚠️ Barcode not found: ' + code, 'bad'); return false; }   // ক্যামেরা খোলা থাকে, আবার চেষ্টা করা যায়
        Scanner.close();                                         // Product মিলেছে → ক্যামেরা সাথে সাথে Close
        this.add(p.id, true, { picked: true });                  // Cartে সিলেক্ট + "Product selected" বার্তা
      }, { hint: 'Hold product barcode in frame' });
    },
    add(id, quiet, opt) {
      opt = opt || {};
      const p = findProduct(id); if (!p) return;
      const go = () => {
        const ex = DB.cart.find(c => c.id === id);
        if (p.track !== false) {
          if (p.stock <= 0) { toast('⚠️ Out of stock!'); return; }
          if (ex && ex.qty >= p.stock) { toast('⚠️ Insufficient stock!'); return; }
        }
        if (ex) ex.qty++; else DB.cart.push({ id: p.id, name: p.name, price: p.price, cost: p.cost || 0, qty: 1, unit: p.unit });
        C.save('cart'); this.lastAdded = { id: p.id, isNew: !ex }; this.renderCart(); Fx.added(p.id, quiet);
        if (opt.picked) toast('✓ Product selected: ' + p.name);
        else if (quiet) { try { window.Sound && window.Sound.play && window.Sound.play('beep'); } catch (_) {} }
      };
      if (p.expiry && p.expiry < C.todayKey()) askConfirm(`"${p.name}"  has expired. Sell anyway?`, go, { title: 'Expired product', danger: true, yes: 'Yes, add' });
      else go();
    },
    qty(id, d) {
      const it = DB.cart.find(c => c.id === id); if (!it) return;
      const p = findProduct(id); const n = it.qty + d;
      if (n <= 0) DB.cart = DB.cart.filter(c => c.id !== id);
      else if (p && p.track !== false && n > p.stock) { toast('⚠️ Insufficient stock!'); return; }
      else it.qty = n;
      C.save('cart'); this.renderCart();
    },
    remove(id) { DB.cart = DB.cart.filter(c => c.id !== id); C.save('cart'); this.renderCart(); },
    editItem(id) {
      const it = DB.cart.find(c => c.id === id); if (!it) return;
      const m = Modal.open({ title: it.name, body: `<div class="grid2"><div class="field"><label class="label">Unit price</label><input id="ei-price" type="number" step="any" class="input" value="${it.price}"></div>
        <div class="field"><label class="label">Qty</label><input id="ei-qty" type="number" step="any" class="input" value="${it.qty}"></div></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="ei-ok">Save</button>` });
      m.querySelector('#ei-ok').onclick = () => {
        const pr = num($('ei-price').value), q = num($('ei-qty').value); const p = findProduct(id);
        if (pr < 0 || q <= 0) { toast('⚠️ Enter a valid value'); return; }
        if (p && p.track !== false && q > p.stock) { toast('⚠️ Stock only ' + p.stock); return; }
        it.price = pr; it.qty = q; C.save('cart'); Modal.close(m); this.renderCart();
      };
    },
    clear() {
      if (!DB.cart.length) return;
      askConfirm('Clear all items from cart?', () => { DB.cart = []; this.resetBill(); C.save('cart'); this.renderCart(); toast('Cart cleared'); }, { title: 'Clear cart?', yes: 'Yes, clear', danger: true });
    },
    resetBill() { this.disc = 0; this.discType = 'percent'; this.customerId = null; this.note = ''; this.taxInit(); },
    cartHTML() {
      const t = this.totals(); const cust = this.customerId ? findCustomer(this.customerId) : null;
      const la = this.lastAdded;
      const items = DB.cart.length ? DB.cart.map(c => `<div class="cart-item${la && la.id === c.id ? (la.isNew ? ' new' : ' bumped') : ''}" data-id="${c.id}">
          <div class="grow" onclick="POS.editItem('${c.id}')"><div class="fw6 sm trunc">${esc(c.name)}</div><div class="xs muted">${money(c.price)} × ${c.qty} <i class="fas fa-pen" style="font-size:9px;opacity:.5"></i></div></div>
          <div class="qty"><button onclick="POS.qty('${c.id}',-1)">−</button><span>${c.qty}</span><button onclick="POS.qty('${c.id}',1)">+</button></div>
          <div class="fw7 ptext sm" style="min-width:56px;text-align:right">${money(c.price * c.qty)}</div>
          <button class="icon-btn" style="width:28px;height:28px" onclick="POS.remove('${c.id}')"><i class="fas fa-xmark"></i></button></div>`).join('')
        : '<div class="empty"><i class="fas fa-bag-shopping"></i>Cart empty</div>';
      return `<div class="flex between items-c mb3"><div class="sec-title" style="margin:0"><i class="fas fa-bag-shopping ptext cart-ico"></i> Cart <span class="badge b-p">${DB.cart.reduce((s, c) => s + c.qty, 0)}</span></div>
          <div class="flex gap1"><button class="btn btn-sm btn-ghost" onclick="POS.hold()"><i class="fas fa-pause"></i> Hold</button><button class="btn btn-sm btn-danger-soft" onclick="POS.clear()"><i class="fas fa-trash"></i></button></div></div>
        <div style="max-height:38vh;overflow-y:auto;margin-bottom:10px">${items}</div>
        <button class="btn btn-ghost btn-block mb3" onclick="POS.pickCust()"><i class="fas fa-user"></i> ${cust ? esc(cust.name) + (C.customerBalance(cust.id) > 0 ? ' · Due ' + money(C.customerBalance(cust.id)) : '') : 'Customer: Walk-in (select for due)'}</button>
        <div class="grid2 mb2"><div><label class="label">Discount</label><div class="flex gap1"><input type="number" min="0" step="any" class="input" value="${this.disc || ''}" placeholder="0" oninput="POS.setDisc(this.value)"><select class="input" style="width:70px" onchange="POS.setDiscType(this.value)"><option value="percent" ${this.discType === 'percent' ? 'selected' : ''}>%</option><option value="amount" ${this.discType === 'amount' ? 'selected' : ''}>৳</option></select></div></div>
          <div><label class="label">Tax (%)</label><input type="number" min="0" step="any" class="input" value="${this.tax || ''}" placeholder="0" oninput="POS.setTax(this.value)"></div></div>
        <div class="sumrow muted"><span>Subtotal</span><span class="js-sub">${money(t.subtotal)}</span></div>
        <div class="sumrow muted"><span>Discount</span><span class="js-disc bad">-${money(t.discount)}</span></div>
        <div class="sumrow muted"><span>Tax</span><span class="js-tax">${money(t.tax)}</span></div>
        <div class="sumrow big"><span>Total</span><span class="ptext js-total">${money(t.total)}</span></div>
        <button class="btn btn-primary btn-block mt3" style="padding:14px;font-size:15px" ${DB.cart.length ? '' : 'disabled'} onclick="POS.checkout()"><i class="fas fa-circle-check"></i> Checkout</button>`;
    },
    renderCart() {
      const h = this.cartHTML(); ['cart-desk', 'cart-mobile'].forEach(id => { const e = $(id); if (e) e.innerHTML = h; });
      this.lastAdded = null;
      const n = DB.cart.reduce((s, c) => s + c.qty, 0); const b = $('cart-badge');
      if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
      const bar = $('cart-bar');
      if (bar) {
        const t = this.totals(); bar.classList.toggle('empty', !n);
        bar.innerHTML = n
          ? `<span class="cb-ico"><i class="fas fa-bag-shopping"></i><b class="cb-count">${n}</b></span><span class="cb-mid"><b>${n} items</b><small>Tap to view cart</small></span><span class="cb-total">${money(t.total)}</span><i class="fas fa-chevron-up cb-arrow"></i>`
          : `<span class="cb-ico"><i class="fas fa-bag-shopping"></i></span><span class="cb-mid"><b>Cart empty</b><small>Tap a product to add</small></span>`;
      }
      this.markCards();
    },
    updTotals() { const t = this.totals(); const set = (c, v) => document.querySelectorAll(c).forEach(e => e.textContent = v); set('.js-sub', money(t.subtotal)); set('.js-disc', '-' + money(t.discount)); set('.js-tax', money(t.tax)); set('.js-total', money(t.total)); set('.cb-total', money(t.total)); },
    setDisc(v) { this.disc = num(v); this.updTotals(); },
    setDiscType(v) { this.discType = v; this.updTotals(); },
    setTax(v) { this.tax = num(v); this.updTotals(); },
    pickCust() { People.pick(id => { this.customerId = id; this.renderCart(); }, true); },

    // ---- Hold ----
    hold() {
      if (!DB.cart.length) { toast('Cart empty'); return; }
      const c = findCustomer(this.customerId);
      DB.hold.unshift({ id: genId(), date: new Date().toISOString(), items: DB.cart, customerId: this.customerId, disc: this.disc, discType: this.discType, tax: this.tax, label: c ? c.name : '' });
      C.save('hold'); DB.cart = []; this.resetBill(); C.save('cart'); this.renderCart(); this.renderGrid(); toast('Bill held ✓');
    },
    showHold() {
      if (!DB.hold.length) { toast('No held bills'); return; }
      const m = Modal.open({ title: 'Held Bills', body: DB.hold.map(h => `<div class="row" style="cursor:default"><div class="grow"><div class="t">${esc(h.label || 'Walk-in')} · ${money(h.items.reduce((s, c) => s + c.price * c.qty, 0))}</div><div class="s">${C.fmtDT(h.date)} · ${h.items.length} items</div></div>
        <button class="btn btn-sm btn-primary" onclick="POS.restore('${h.id}',this)">Resume</button><button class="btn btn-sm btn-danger-soft" onclick="POS.dropHold('${h.id}',this)"><i class="fas fa-trash"></i></button></div>`).join('') });
      m._hold = true;
    },
    restore(id, btn) {
      const h = DB.hold.find(x => x.id === id); if (!h) return;
      const run = () => {
        DB.cart = h.items; this.customerId = h.customerId; this.disc = h.disc; this.discType = h.discType; this.tax = h.tax;
        DB.hold = DB.hold.filter(x => x.id !== id); C.save('hold'); C.save('cart'); Modal.closeAll(); this.renderCart(); this.renderGrid(); toast('Bill resumed ✓');
      };
      if (DB.cart.length) askConfirm('Current cart items will be replaced. Continue?', run, { yes: 'Yes' }); else run();
    },
    dropHold(id, btn) { askConfirm('Delete this held bill?', () => { DB.hold = DB.hold.filter(x => x.id !== id); C.save('hold'); Modal.closeAll(); this.renderGrid(); toast('Deleted'); }, { danger: true, yes: 'Delete' }); },

    // ---- Checkout ----
    checkout() {
      if (!DB.cart.length) return;
      App.closeDrawers(); this.payMethod = 'cash';
      const t = this.totals();
      const m = Modal.open({ title: 'Checkout', body: `
        <div class="tc mb3"><div class="muted xs">Payable</div><div class="xxl fw7 ptext" id="co-total">${money(t.total)}</div></div>
        <div class="pay-opts mb3" id="co-methods">
          <button class="pay-opt on" data-m="cash" onclick="POS.setMethod('cash')"><i class="fas fa-money-bill-wave"></i>Cash</button>
          <button class="pay-opt" data-m="card" onclick="POS.setMethod('card')"><i class="fas fa-credit-card"></i>Card</button>
          <button class="pay-opt" data-m="mobile" onclick="POS.setMethod('mobile')"><i class="fas fa-mobile-screen"></i>Mobile</button>
          <button class="pay-opt" data-m="due" onclick="POS.setMethod('due')"><i class="fas fa-clock"></i>Due</button>
        </div>
        <div class="field"><label class="label" id="co-paid-label">Amount received</label><input id="co-paid" type="number" step="any" min="0" class="input" style="font-size:18px;font-weight:700" oninput="POS.coCalc()"></div>
        <div class="chips mb3" id="co-quick"></div>
        <div class="card pad-s mb3" id="co-info"></div>
        <button class="btn btn-ghost btn-block mb3" id="co-cust" onclick="POS.coPick()"></button>
        <div class="field"><label class="label">Note (optional)</label><input id="co-note" class="input" value="${esc(this.note)}" placeholder="e.g. pay tomorrow"></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="co-ok" onclick="POS.complete()"><i class="fas fa-check"></i> Complete sale</button>` });
      this.setMethod('cash'); this.coCust();
    },
    coCust() {
      const b = $('co-cust'); if (!b) return; const c = findCustomer(this.customerId);
      b.innerHTML = c ? `<i class="fas fa-user"></i> ${esc(c.name)} · Current due ${money(Math.max(0, C.customerBalance(c.id)))}` : '<i class="fas fa-user-plus"></i> Select customer (required for due)';
    },
    coPick() { People.pick(id => { this.customerId = id; this.coCust(); this.renderCart(); this.coCalc(); }, true); },
    setMethod(m) {
      this.payMethod = m; const t = this.totals();
      document.querySelectorAll('#co-methods .pay-opt').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      $('co-paid-label').textContent = m === 'due' ? 'Advance (Optional)' : (m === 'cash' ? 'Amount received' : 'Payment');
      $('co-paid').value = m === 'due' ? '' : t.total;
      const q = $('co-quick'); const opts = new Set([t.total]);
      if (m === 'cash') { [10, 50, 100, 500, 1000].forEach(s => { const v = Math.ceil(t.total / s) * s; if (v >= t.total) opts.add(v); }); }
      q.innerHTML = m === 'due' ? '' : [...opts].slice(0, 5).map(v => `<button class="chip" onclick="document.getElementById('co-paid').value=${v};POS.coCalc()">${v === t.total ? 'Exact ' : ''}৳${fmt(v)}</button>`).join('');
      this.coCalc();
    },
    coCalc() {
      const t = this.totals(); const raw = Math.max(0, num($('co-paid').value)); let paid = raw, change = 0;
      if (this.payMethod === 'cash') { if (raw > t.total) { change = r2(raw - t.total); paid = t.total; } }
      else if (raw > t.total) paid = t.total;
      const due = r2(Math.max(0, t.total - paid));
      $('co-info').innerHTML = `<div class="sumrow" style="margin:2px 0"><span class="muted">Paying</span><b>${money(paid)}</b></div>` +
        (change > 0 ? `<div class="sumrow" style="margin:2px 0"><span class="muted">Change</span><b class="ok">${money(change)}</b></div>` : '') +
        (due > 0 ? `<div class="sumrow" style="margin:2px 0"><span class="muted">Due remaining</span><b class="bad">${money(due)}</b></div>` : '');
      return { paid, change, due };
    },
    complete() {
      if (this._busy) return; this._busy = true;
      const t = this.totals(); const { paid, change, due } = this.coCalc();
      if (!DB.cart.length) { this._busy = false; return; }
      if (due > 0 && !this.customerId) { this._busy = false; toast('⚠️ Select a customer for due'); this.coPick(); return; }
      for (const it of DB.cart) { const p = findProduct(it.id); if (p && p.track !== false && p.stock < it.qty) { this._busy = false; toast('⚠️ ' + it.name + ' has insufficient stock!'); return; } }
      const cust = findCustomer(this.customerId);
      const proceed = () => {
        DB.cart.forEach(it => { const p = findProduct(it.id); if (p && p.track !== false) p.stock = r2(p.stock - it.qty); });
        const sale = {
          id: genId(), no: DB.settings.nextInvoice++, date: new Date().toISOString(), customerId: this.customerId || null,
          items: DB.cart.map(c => ({ id: c.id, name: c.name, price: c.price, cost: (findProduct(c.id) || {}).cost || c.cost || 0, qty: c.qty, unit: c.unit })),
          subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, paid, due, change,
          paymentMethod: this.payMethod === 'due' ? (paid > 0 ? 'cash' : 'due') : this.payMethod,
          note: ($('co-note') ? $('co-note').value.trim() : '')
        };
        DB.sales.unshift(sale); DB.cart = [];
        C.save('products'); C.save('sales'); C.save('cart'); C.save('settings');
        this.resetBill(); Modal.closeAll(); this.renderCart(); this.renderGrid();
        Receipt.show(sale, { fresh: true }); toast('Sale completed! ✓'); this._busy = false; const _s=$('pos-search'); if(_s) setTimeout(()=>_s.focus(), 300);
      };
      if (cust && due > 0) {
        const lim = num(cust.creditLimit); const after = C.customerBalance(cust.id) + due;
        if (lim > 0 && after > lim) { this._busy = false; askConfirm(`${cust.name} — due limit is ${money(lim)}. After this sale due will be ${money(after)}. Continue anyway?`, () => { this._busy = true; proceed(); }, { title: 'Exceeds due limit', danger: true, yes: 'Yes, continue' }); return; }
      }
      proceed();
    }
  };
  Views.pos = POS;

  // ================= Products & Stock =================
  const UNITS = ['Pcs', 'Kg', 'g', 'L', 'Packet', 'Bottle', 'Cup', 'Dozen', 'm', 'Box', 'Pair'];
  const Products = window.Products = {
    q: '', filter: 'all', img: null,
    render() {
      const low = DB.products.filter(p => p.track !== false && p.stock <= (p.minStock || 0)).length;
      $('view').innerHTML = `
      <div class="page-head"><div><h2>Products & Stock</h2><p>Add products, edit & control stock</p></div>
        <div class="flex gap2"><button class="btn btn-ghost" onclick="Products.csvMenu()"><i class="fas fa-file-csv"></i> CSV</button><button class="btn btn-primary" onclick="Products.edit()"><i class="fas fa-plus"></i> New Product</button></div></div>
      <div class="stats"><div class="stat"><div class="k">Total Product</div><div class="v">${DB.products.length}</div></div>
        <div class="stat"><div class="k">Stock value (at cost)</div><div class="v">${money(C.stockValue())}</div></div>
        <div class="stat"><div class="k">Low Stock</div><div class="v ${low ? 'bad' : ''}">${low}</div></div>
        <div class="stat"><div class="k">Expiry issue</div><div class="v ${this.expiring().length ? 'warn' : ''}">${this.expiring().length}</div></div></div>
      <div class="card pad-s mb3"><div class="relative mb2"><i class="fas fa-magnifying-glass search-ico"></i><input class="input has-ico" id="prod-q" placeholder="Name, barcode or category..." value="${esc(this.q)}" oninput="Products.setQ(this.value)"></div>
        <div class="chips">${[['all', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock'], ['exp', 'Expiry issue']].map(f => `<button class="chip ${this.filter === f[0] ? 'on' : ''}" onclick="Products.setF('${f[0]}')">${f[1]}</button>`).join('')}</div></div>
      <div class="card" id="prod-list"></div>`;
      this.list();
    },
    expiring() { const soon = C.addDays(C.todayKey(), 30); return DB.products.filter(p => p.expiry && p.expiry <= soon); },
    setQ(v) { this.q = v; this.list(); }, setF(f) { this.filter = f; this.render(); },
    list() {
      const q = this.q.trim().toLowerCase(); const soon = C.addDays(C.todayKey(), 30);
      let arr = DB.products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
      if (this.filter === 'low') arr = arr.filter(p => p.track !== false && p.stock <= (p.minStock || 0));
      if (this.filter === 'out') arr = arr.filter(p => p.track !== false && p.stock <= 0);
      if (this.filter === 'exp') arr = arr.filter(p => p.expiry && p.expiry <= soon);
      arr.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
      const el = $('prod-list'); if (!el) return;
      if (!arr.length) { el.innerHTML = '<div class="empty"><i class="fas fa-box-open"></i>No products</div>'; return; }
      el.innerHTML = arr.slice(0, 300).map(p => {
        const low = p.track !== false && p.stock <= (p.minStock || 0);
        const exp = p.expiry ? (p.expiry < C.todayKey() ? '<span class="badge b-bad">Expired</span>' : (p.expiry <= soon ? '<span class="badge b-warn">Expiry ' + p.expiry + '</span>' : '')) : '';
        return `<div class="row" onclick="Products.edit('${p.id}')">
          <div class="avatar" style="overflow:hidden">${p.image ? `<img src="${esc(p.image)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box"></i>'}</div>
          <div class="grow"><div class="t">${esc(p.name)} ${exp}</div><div class="s">${esc(p.category || 'No category')}${p.barcode ? ' · ' + esc(p.barcode) : ''} · Purchases ${money(p.cost || 0)}</div></div>
          <div class="tr"><div class="fw7 ptext">${money(p.price)}</div><div class="xs ${low ? 'bad fw6' : 'muted'}">${p.track === false ? 'Not tracked' : p.stock + ' ' + esc(p.unit || '')}</div></div>
          <button class="icon-btn" onclick="event.stopPropagation();Products.del('${p.id}')"><i class="fas fa-trash bad"></i></button></div>`;
      }).join('') + (arr.length > 300 ? `<div class="empty">Search to see remaining products (${arr.length - 300} more)</div>` : '');
    },
    edit(id) {
      const p = id ? findProduct(id) : null; this.img = p ? (p.image || null) : null;
      const cats = [...new Set(DB.products.map(x => x.category).filter(Boolean))];
      const m = Modal.open({ title: p ? 'Edit Product' : 'New Product', body: `
        <div class="flex gap3 mb3 items-c"><label style="cursor:pointer"><div class="avatar" id="pf-img" style="width:64px;height:64px;overflow:hidden">${this.img ? `<img src="${esc(this.img)}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-camera"></i>'}</div><input type="file" accept="image/*" class="hidden" onchange="Products.pickImg(this)"></label>
          <div class="grow"><label class="label">Product name *</label><input id="pf-name" class="input" autofocus value="${esc(p ? p.name : '')}"></div></div>
        <div class="field"><label class="label">Barcode</label><div class="flex gap2"><input id="pf-bc" class="input" value="${esc(p ? p.barcode : '')}" placeholder="Scan or type"><button class="btn btn-soft" onclick="Products.scanBC()"><i class="fas fa-barcode"></i></button></div></div>
        <div class="grid2"><div class="field"><label class="label">Category</label><input id="pf-cat" class="input" list="pf-cats" value="${esc(p ? p.category : '')}"><datalist id="pf-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label class="label">Unit</label><input id="pf-unit" class="input" list="pf-units" value="${esc(p ? p.unit : 'Pcs')}"><datalist id="pf-units">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist></div></div>
        <div class="grid2"><div class="field"><label class="label">Cost price</label><input id="pf-cost" type="number" step="any" min="0" class="input" value="${p ? p.cost || '' : ''}"></div>
          <div class="field"><label class="label">Sell price *</label><input id="pf-price" type="number" step="any" min="0" class="input" value="${p ? p.price : ''}"></div></div>
        <div class="grid2"><div class="field"><label class="label">Current stock</label><input id="pf-stock" type="number" step="any" class="input" value="${p ? p.stock : 0}"></div>
          <div class="field"><label class="label">Low stock limit</label><input id="pf-min" type="number" step="any" min="0" class="input" value="${p ? (p.minStock === undefined ? 5 : p.minStock) : (DB.settings.lowStockDefault || 5)}"></div></div>
        <div class="field"><label class="label">Expiry date (optional)</label><input id="pf-exp" type="date" class="input" value="${esc(p ? p.expiry : '')}"></div>
        <label class="switch"><span class="sm fw6">Track stock <span class="muted xs">(off for service/unlimited)</span></span><input type="checkbox" id="pf-track" ${!p || p.track !== false ? 'checked' : ''}></label>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" onclick="Products.save('${id || ''}',this)">Save</button>` });
    },
    pickImg(input) {
      const f = input.files && input.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = e => { const im = new Image(); im.onload = () => { const r = Math.min(1, 400 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * r); c.height = Math.round(im.height * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); this.img = c.toDataURL('image/jpeg', .75); $('pf-img').innerHTML = `<img src="${this.img}" style="width:100%;height:100%;object-fit:cover">`; }; im.src = e.target.result; };
      rd.readAsDataURL(f);
    },
    scanBC() { Scanner.open(code => { const f = $('pf-bc'); if (f) { f.value = code; toast('✓ Barcode captured'); } }, { hint: 'Hold product barcode' }); },
    save(id, btn) {
      const name = $('pf-name').value.trim(); const price = parseFloat($('pf-price').value);
      if (!name) { toast('⚠️ Enter product name'); return; } if (!isFinite(price) || price < 0) { toast('⚠️ Enter a valid sell price'); return; }
      const bc = $('pf-bc').value.trim();
      if (bc && DB.products.some(x => x.barcode === bc && x.id !== id)) { toast('⚠️ This barcode is used by another product'); return; }
      const old = id ? findProduct(id) : null;
      const obj = { id: id || genId(), name, barcode: bc, category: $('pf-cat').value.trim(), unit: $('pf-unit').value.trim() || 'Pcs', cost: Math.max(0, num($('pf-cost').value)), price,
        stock: Math.max(0, num($('pf-stock').value)), minStock: Math.max(0, num($('pf-min').value)), expiry: $('pf-exp').value, track: $('pf-track').checked, image: this.img || null };
      if (old) Object.assign(old, obj); else DB.products.push(obj);
      C.save('products'); Modal.closeFrom(btn); toast(old ? 'Product updated ✓' : 'New product added ✓'); App.refresh();
    },
    del(id) {
      const p = findProduct(id); if (!p) return;
      askConfirm(`"${p.name}" Delete? Sales history stays, but the product is removed from the list.`, () => {
        DB.products = DB.products.filter(x => x.id !== id); DB.cart = DB.cart.filter(c => c.id !== id); C.save('products'); C.save('cart'); toast('Product Deleted'); App.refresh();
      }, { title: 'Delete product?', yes: 'Yes, Delete', danger: true });
    },
    // ---- CSV ----
    csvMenu() {
      Modal.open({ title: 'Product CSV', body: `<p class="muted sm mb3">Import many products from Excel/Google Sheet. Columns: Name, Barcode, Category, Cost, Sell price, Stock, Unit, Low stock limit, Expiry</p>
        <button class="btn btn-ghost btn-block mb2" onclick="Products.csvOut()"><i class="fas fa-file-export"></i> All Product Export (CSV)</button>
        <button class="btn btn-ghost btn-block mb2" onclick="Products.csvTemplate()"><i class="fas fa-file-lines"></i> Download empty template</button>
        <label class="btn btn-primary btn-block" style="cursor:pointer"><i class="fas fa-file-import"></i> CSV Import<input type="file" accept=".csv,text/csv" class="hidden" onchange="Products.csvIn(this)"></label>` });
    },
    head: ['Name', 'Barcode', 'Category', 'Cost', 'Sell price', 'Stock', 'Unit', 'Low stock limit', 'Expiry'],
    csvOut() { C.download('propos-products.csv', C.toCSV([this.head, ...DB.products.map(p => [p.name, p.barcode, p.category, p.cost, p.price, p.stock, p.unit, p.minStock, p.expiry])]), 'text/csv'); },
    csvTemplate() { C.download('propos-products-template.csv', C.toCSV([this.head, ['Tea', '8901001', 'Beverages', 5, 10, 100, 'Cup', 20, '']]), 'text/csv'); },
    csvIn(input) {
      const f = input.files && input.files[0]; input.value = ''; if (!f) return; const rd = new FileReader();
      rd.onload = e => {
        let rows = C.parseCSV(e.target.result); if (!rows.length) { toast('⚠️ File is empty'); return; }
        if (/^\s*(Name|name)\s*$/i.test(rows[0][0] || '')) rows = rows.slice(1);
        let add = 0, upd = 0, bad = 0;
        rows.forEach(r => {
          const name = (r[0] || '').trim(); const price = parseFloat(r[4]); if (!name || !isFinite(price)) { bad++; return; }
          const bc = (r[1] || '').trim(); let p = (bc && DB.products.find(x => x.barcode === bc)) || DB.products.find(x => x.name === name);
          const data = { name, barcode: bc, category: (r[2] || '').trim(), cost: num(r[3]), price, stock: num(r[5]), unit: (r[6] || '').trim() || 'Pcs', minStock: r[7] === undefined || r[7] === '' ? 5 : num(r[7]), expiry: (r[8] || '').trim() };
          if (p) { Object.assign(p, data); upd++; } else { DB.products.push(Object.assign({ id: genId(), track: true, image: null }, data)); add++; }
        });
        C.save('products'); Modal.closeAll(); toast(`✓ ${add} new, ${upd} updated${bad ? ', ' + bad + ' excluded' : ''}`); App.refresh();
      };
      rd.readAsText(f);
    }
  };
  Views.products = Products;

  // ================= Resume =================
  document.addEventListener('DOMContentLoaded', () => {
    C.load(); POS.taxInit(); buildNav();
    const start = () => { App.go('pos'); checkPendingBackup(); POS.renderCart(); if (window.Cloud) Cloud.init(); };
    if (window.Lock) Lock.init(start); else start();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && window.Lock) Lock.onResume(); else if (window.Lock) Lock.onHide(); });
  });


  // ================= Desktop keyboard shortcuts =================
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = ((document.activeElement && document.activeElement.tagName) || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement && document.activeElement.isContentEditable);
    if (document.querySelector('.modal-back,.ui-confirm-backdrop,.lock,.scan')) {
      if (e.key === 'Escape') { try { Modal.closeAll(); } catch (_) {} }
      return;
    }
    if (e.key === 'Escape') { App.closeDrawers(); return; }
    if (e.key === 'F2') {
      e.preventDefault();
      if (App.view !== 'pos') App.go('pos');
      setTimeout(() => { const s = document.getElementById('pos-search'); if (s) s.focus(); }, 50);
      return;
    }
    if (e.key === 'F4' && App.view === 'pos' && !typing) {
      e.preventDefault();
      if (DB.cart.length) POS.checkout();
      return;
    }
  });

  // ================= Hardware barcode scanner (USB/Bluetooth keyboard wedge) =================
  (function setupWedgeScanner() {
    let buf = '', last = 0, timer = null;
    const GAP = 80, MIN_LEN = 4, RESET = 120;

    function isTypingTarget(el) {
      if (!el) return false;
      const t = (el.tagName || '').toLowerCase();
      if (t === 'textarea' || t === 'select') return true;
      if (t === 'input') {
        const ty = (el.type || '').toLowerCase();
        if (el.id === 'pos-search') return false;
        return ty !== 'button' && ty !== 'checkbox' && ty !== 'radio' && ty !== 'submit';
      }
      if (el.isContentEditable) return true;
      return false;
    }

    function flush() {
      const code = buf.trim(); buf = '';
      if (timer) { clearTimeout(timer); timer = null; }
      if (code.length < MIN_LEN) return;
      if (App.view !== 'pos') return;
      if (window.Scanner && Scanner.isOpen && Scanner.isOpen()) return;
      if (document.querySelector('.modal-back, .ui-confirm-backdrop, .scan')) return;
      const p = POS.findByBarcode(code);
      if (p) {
        POS.add(p.id, true, { picked: true });
        POS.q = '';
        const s = document.getElementById('pos-search');
        if (s) s.value = '';
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
        try { window.Sound && window.Sound.play && window.Sound.play('ok'); } catch (_) {}
      } else {
        toast('⚠️ Barcode not found: ' + code);
        try { window.Sound && window.Sound.play && window.Sound.play('err'); } catch (_) {}
      }
    }

    document.addEventListener('keydown', e => {
      if (App.view !== 'pos') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement) && document.activeElement && document.activeElement.id !== 'pos-search') return;
      if (document.querySelector('.modal-back, .ui-confirm-backdrop, .scan')) return;

      const now = Date.now();
      if (now - last > GAP) buf = '';
      last = now;

      if (e.key === 'Enter') {
        if (buf.length >= MIN_LEN) {
          e.preventDefault();
          e.stopPropagation();
          flush();
        }
        return;
      }
      if (e.key.length === 1) {
        buf += e.key;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { buf = ''; }, RESET * 3);
      }
    }, true);
  })();

})();
