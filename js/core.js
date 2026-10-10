/* ProPOS core: ডেটা, হিসাব, হেল্পার — DOM-এর উপর নির্ভর করে না (শুধু toast ছাড়া) */
(function (root) {
  'use strict';

  const K = {
    products: 'propos_products', sales: 'propos_sales', customers: 'propos_customers',
    payments: 'propos_payments', suppliers: 'propos_suppliers', purchases: 'propos_purchases',
    spayments: 'propos_spayments', expenses: 'propos_expenses', returns: 'propos_returns',
    hold: 'propos_hold', cart: 'propos_cart', settings: 'propos_settings'
  };
  const DEFAULTS = {
    shopName: 'My Shop', shopAddress: '', shopPhone: '', defaultTax: 0,
    footer: 'Thank you! Come again', paper: '58', btMode: 'image',
    invPrefix: '', nextInvoice: 1, pinHash: '', pinSalt: '', lowStockDefault: 5
  };
  const DB = { products: [], sales: [], customers: [], payments: [], suppliers: [], purchases: [],
               spayments: [], expenses: [], returns: [], hold: [], cart: [], settings: Object.assign({}, DEFAULTS) };

  // ---------- স্টোরেজ ----------
  function safeLoad(key, fallback) {
    try {
      const raw = root.localStorage.getItem(key);
      if (raw === null) return fallback;
      const val = JSON.parse(raw);
      if (val === null || Array.isArray(val) !== Array.isArray(fallback) || typeof val !== typeof fallback) return fallback;
      return val;
    } catch (e) {
      console.error('Could not read data:', key, e);
      try { root.localStorage.setItem(key + '_corrupt_' + Date.now(), root.localStorage.getItem(key)); } catch (_) {}
      return fallback;
    }
  }
  function safeSave(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      if (key !== K.cart) { root.localStorage.setItem('propos_dirty', '1'); if (root.Cloud) root.Cloud.markDirty(); }
      return true;
    } catch (e) {
      console.error('Save failed:', key, e);
      toast('⚠️ Data not saved! Storage full — free space or reduce old data/images');
      return false;
    }
  }
  function save(name) { return safeSave(K[name], name === 'settings' ? DB.settings : DB[name]); }
  function saveAll() { Object.keys(K).forEach(save); }

  function load() {
    Object.keys(K).forEach(name => {
      if (name === 'settings') DB.settings = Object.assign({}, DEFAULTS, safeLoad(K.settings, {}));
      else DB[name] = safeLoad(K[name], []);
    });
    migrate();
  }

  // পুরনো ভার্সনের ডেটা নতুন কাঠামোয় আনা
  function migrate() {
    let changed = false;
    DB.products.forEach(p => {
      if (p.track === undefined) { p.track = true; changed = true; }
      if (p.expiry === undefined) { p.expiry = ''; changed = true; }
    });
    // Allচেয়ে পুরনো Salesের নম্বর আগে (sales নতুন→পুরনো ক্রমে থাকে)
    const need = DB.sales.some(s => s.no === undefined);
    if (need) {
      const old = DB.sales.filter(s => s.no !== undefined).map(s => s.no);
      let n = old.length ? Math.max.apply(null, old) : 0;
      DB.sales.slice().reverse().forEach(s => { if (s.no === undefined) { s.no = ++n; } });
      DB.settings.nextInvoice = Math.max(DB.settings.nextInvoice || 1, n + 1);
      changed = true;
    }
    DB.sales.forEach(s => {
      if (s.paid === undefined) { s.paid = s.total; s.due = 0; changed = true; }
      if (s.customerId === undefined) { s.customerId = null; changed = true; }
      (s.items || []).forEach(it => {
        if (it.cost === undefined) { const p = DB.products.find(x => x.id === it.id); it.cost = p ? (p.cost || 0) : 0; changed = true; }
      });
    });
    if (changed) { save('products'); save('sales'); save('settings'); }
  }

  // ---------- হেল্পার ----------
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = n => Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 });
  const money = n => '৳' + fmt(n);
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const z2 = x => String(x).padStart(2, '0');
  const dkey = d => { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()); };
  const todayKey = () => dkey(new Date());
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d + n); return dkey(t); };
  const monthStart = () => { const t = new Date(); return t.getFullYear() + '-' + z2(t.getMonth() + 1) + '-01'; };
  const fmtDate = iso => new Date(iso).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = iso => new Date(iso).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
  const fmtDT = iso => fmtDate(iso) + ' · ' + fmtTime(iso);
  const invLabel = s => (DB.settings.invPrefix || '') + String(s.no || 0).padStart(4, '0');

  let toastTimer = null;
  function toast(msg) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.remove('hidden');
    if (root.Sound) root.Sound.play(/✓/.test(msg) ? 'success' : /⚠/.test(msg) ? 'warn' : null);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  // ---------- হিসাব ----------
  const findProduct = id => DB.products.find(p => p.id === id);
  const findCustomer = id => DB.customers.find(c => c.id === id);
  const findSupplier = id => DB.suppliers.find(c => c.id === id);
  const findSale = id => DB.sales.find(s => s.id === id);

  function customerBalance(id) {
    const c = findCustomer(id); if (!c) return 0;
    let b = num(c.openingDue);
    DB.sales.forEach(s => { if (s.customerId === id) b += num(s.due); });
    DB.payments.forEach(p => { if (p.customerId === id) b -= num(p.amount); });
    DB.returns.forEach(r => { if (r.customerId === id && r.refundType === 'due') b -= num(r.amount); });
    return r2(b);
  }
  function supplierBalance(id) {
    const c = findSupplier(id); if (!c) return 0;
    let b = num(c.openingDue);
    DB.purchases.forEach(p => { if (p.supplierId === id) b += num(p.due); });
    DB.spayments.forEach(p => { if (p.supplierId === id) b -= num(p.amount); });
    return r2(b);
  }
  const totalCustomerDue = () => r2(DB.customers.reduce((s, c) => s + Math.max(0, customerBalance(c.id)), 0));
  const totalSupplierDue = () => r2(DB.suppliers.reduce((s, c) => s + Math.max(0, supplierBalance(c.id)), 0));

  function returnedQty(saleId, itemId) {
    let q = 0;
    DB.returns.forEach(r => { if (r.saleId === saleId) r.items.forEach(i => { if (i.id === itemId) q += i.qty; }); });
    return q;
  }
  const returnedAmount = saleId => r2(DB.returns.filter(r => r.saleId === saleId).reduce((s, r) => s + num(r.amount), 0));

  // Customerর Ledger (লেজার)
  function customerLedger(id) {
    const c = findCustomer(id); const rows = [];
    if (!c) return rows;
    if (num(c.openingDue)) rows.push({ date: c.created || '1970-01-01T00:00:00.000Z', type: 'opening', desc: 'Opening due', debit: num(c.openingDue), credit: 0 });
    DB.sales.forEach(s => { if (s.customerId === id) rows.push({ date: s.date, type: 'sale', desc: 'Sales #' + invLabel(s) + ' (Total ' + money(s.total) + ', Paid ' + money(s.paid) + ')', debit: num(s.due), credit: 0, ref: s.id }); });
    DB.payments.forEach(p => { if (p.customerId === id) rows.push({ date: p.date, type: 'payment', desc: 'Due Collected' + (p.note ? ' — ' + p.note : ''), debit: 0, credit: num(p.amount), ref: p.id }); });
    DB.returns.forEach(r => { if (r.customerId === id && r.refundType === 'due') rows.push({ date: r.date, type: 'return', desc: 'Returns (deducted from due)', debit: 0, credit: num(r.amount), ref: r.id }); });
    rows.sort((a, b) => a.date < b.date ? -1 : 1);
    let bal = 0; rows.forEach(r => { bal = r2(bal + r.debit - r.credit); r.balance = bal; });
    return rows;
  }
  function supplierLedger(id) {
    const c = findSupplier(id); const rows = [];
    if (!c) return rows;
    if (num(c.openingDue)) rows.push({ date: c.created || '1970-01-01T00:00:00.000Z', type: 'opening', desc: 'Opening payable', debit: num(c.openingDue), credit: 0 });
    DB.purchases.forEach(p => { if (p.supplierId === id) rows.push({ date: p.date, type: 'purchase', desc: 'Purchases #' + p.no + ' (Total ' + money(p.total) + ', Payment ' + money(p.paid) + ')', debit: num(p.due), credit: 0 }); });
    DB.spayments.forEach(p => { if (p.supplierId === id) rows.push({ date: p.date, type: 'payment', desc: 'Payment' + (p.note ? ' — ' + p.note : ''), debit: 0, credit: num(p.amount) }); });
    rows.sort((a, b) => a.date < b.date ? -1 : 1);
    let bal = 0; rows.forEach(r => { bal = r2(bal + r.debit - r.credit); r.balance = bal; });
    return rows;
  }

  // Reports
  function inRange(iso, from, to) { const k = dkey(iso); return (!from || k >= from) && (!to || k <= to); }
  function buildReport(from, to) {
    const S = DB.sales.filter(s => inRange(s.date, from, to));
    const R = DB.returns.filter(r => inRange(r.date, from, to));
    const E = DB.expenses.filter(e => inRange(e.date, from, to));
    const P = DB.payments.filter(p => inRange(p.date, from, to));
    const PU = DB.purchases.filter(p => inRange(p.date, from, to));
    const SP = DB.spayments.filter(p => inRange(p.date, from, to));
    const sum = (arr, f) => r2(arr.reduce((t, x) => t + num(f(x)), 0));
    const grossSales = sum(S, s => s.total);
    const returnsTotal = sum(R, r => r.amount);
    const cogs = sum(S, s => s.items.reduce((t, i) => t + num(i.cost) * i.qty, 0));
    const retCogs = sum(R, r => r.cogs);
    const salesRevenue = sum(S, s => num(s.subtotal) - num(s.discount));
    const retRevenue = sum(R, r => r.revenue);
    const grossProfit = r2(salesRevenue - cogs - (retRevenue - retCogs));
    const expenses = sum(E, e => e.amount);
    const byMethod = { cash: 0, card: 0, mobile: 0 };
    S.forEach(s => { const m = byMethod[s.paymentMethod] !== undefined ? s.paymentMethod : 'cash'; byMethod[m] += num(s.paid); });
    // paid = Salesে প্রযোজ্য টাকা (Returns বাদে)
    const collected = {};
    ['cash', 'card', 'mobile'].forEach(m => { collected[m] = r2(byMethod[m] + sum(P.filter(p => (p.method || 'cash') === m), p => p.amount)); });
    const prod = {}; const cat = {};
    S.forEach(s => s.items.forEach(i => {
      const t = prod[i.id] = prod[i.id] || { name: i.name, qty: 0, amount: 0, profit: 0 };
      t.qty += i.qty; t.amount = r2(t.amount + i.price * i.qty); t.profit = r2(t.profit + (i.price - num(i.cost)) * i.qty);
      const p = findProduct(i.id); const cn = (p && p.category) || 'Other';
      cat[cn] = r2((cat[cn] || 0) + i.price * i.qty);
    }));
    return {
      from, to, count: S.length, grossSales, returnsTotal, netSales: r2(grossSales - returnsTotal),
      discount: sum(S, s => s.discount), tax: sum(S, s => s.tax), cogs: r2(cogs - retCogs), grossProfit,
      expenses, netProfit: r2(grossProfit - expenses), newDue: sum(S, s => s.due),
      dueCollected: sum(P, p => p.amount), supplierPaid: sum(SP, p => p.amount) + sum(PU, p => p.paid),
      purchases: sum(PU, p => p.total), cashRefund: sum(R.filter(r => r.refundType === 'cash'), r => r.amount),
      collected, topProducts: Object.values(prod).sort((a, b) => b.amount - a.amount).slice(0, 10),
      categories: Object.entries(cat).sort((a, b) => b[1] - a[1]), S, R, E, P, PU
    };
  }
  const stockValue = () => r2(DB.products.reduce((s, p) => s + (p.track === false ? 0 : num(p.stock) * num(p.cost)), 0));

  // CSV
  function toCSV(rows) {
    return '\ufeff' + rows.map(r => r.map(c => { c = c == null ? '' : String(c); return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n');
  }
  function parseCSV(text) {
    text = text.replace(/^\ufeff/, ''); const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const api = { K, DEFAULTS, DB, safeLoad, safeSave, save, saveAll, load, migrate, esc, num, r2, fmt, money, genId, z2, dkey, todayKey, addDays, monthStart,
    fmtDate, fmtTime, fmtDT, invLabel, toast, findProduct, findCustomer, findSupplier, findSale, customerBalance, supplierBalance, totalCustomerDue,
    totalSupplierDue, returnedQty, returnedAmount, customerLedger, supplierLedger, buildReport, stockValue, toCSV, parseCSV, download, inRange };
  root.Core = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
