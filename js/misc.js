/* ProPOS: Receipt, Returns, ইতিহাস, Expenses, Reports, Dashboard */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, r2, fmt, money, genId, toast, findProduct, findCustomer } = C;
  const $ = id => document.getElementById(id);
  const MN = { cash: 'Cash', card: 'Card', mobile: 'Mobile banking', due: 'Due' };

  // ================= Receipt =================
  const RC_CSS = `body{font-family:'Noto Sans Bengali','Courier New',monospace;font-size:12px;margin:0;padding:6px;color:#000}
  .rc-c{text-align:center}.rc-b{font-weight:700}.rc-hr{border-top:1px dashed #000;margin:6px 0}.rc-row{display:flex;justify-content:space-between;gap:6px}
  .rc-s{font-size:10.5px}.rc-big{font-size:14px;font-weight:700}@page{margin:2mm}`;
  const Receipt = window.Receipt = {
    cur: null,
    inner(s) {
      const sh = DB.settings; const cust = findCustomer(s.customerId); const ret = C.returnedAmount(s.id);
      const bal = cust ? C.customerBalance(cust.id) : 0;
      return `<div class="rc-c rc-b" style="font-size:15px">${esc(sh.shopName || 'ProPOS')}</div>
        ${sh.shopAddress ? `<div class="rc-c rc-s">${esc(sh.shopAddress)}</div>` : ''}${sh.shopPhone ? `<div class="rc-c rc-s">Phone: ${esc(sh.shopPhone)}</div>` : ''}
        <div class="rc-hr"></div>
        <div class="rc-row rc-s"><span>Receipt #</span><b>#${C.invLabel(s)}</b></div>
        <div class="rc-row rc-s"><span>Date</span><span>${C.fmtDT(s.date)}</span></div>
        ${cust ? `<div class="rc-row rc-s"><span>Customer</span><span>${esc(cust.name)}${cust.phone ? ' · ' + esc(cust.phone) : ''}</span></div>` : ''}
        <div class="rc-row rc-s"><span>Payment</span><span>${MN[s.paymentMethod] || ''}</span></div>
        <div class="rc-hr"></div>
        ${s.items.map(i => `<div class="rc-row"><span>${esc(i.name)}<br><span class="rc-s">${i.qty} × ${money(i.price)}</span></span><b>${money(i.price * i.qty)}</b></div>`).join('')}
        <div class="rc-hr"></div>
        <div class="rc-row"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
        ${s.discount > 0 ? `<div class="rc-row"><span>Discount</span><span>-${money(s.discount)}</span></div>` : ''}
        ${s.tax > 0 ? `<div class="rc-row"><span>Tax</span><span>${money(s.tax)}</span></div>` : ''}
        <div class="rc-row rc-big"><span>Total</span><span>${money(s.total)}</span></div>
        <div class="rc-row"><span>Paid</span><span>${money(s.paid)}</span></div>
        ${s.change > 0 ? `<div class="rc-row"><span>Change given</span><span>${money(s.change)}</span></div>` : ''}
        ${s.due > 0 ? `<div class="rc-row rc-b"><span>Due on this bill</span><span>${money(s.due)}</span></div>` : ''}
        ${ret > 0 ? `<div class="rc-row"><span>Product Return</span><span>-${money(ret)}</span></div>` : ''}
        ${cust && bal > 0 ? `<div class="rc-row rc-b"><span>Total due (all)</span><span>${money(bal)}</span></div>` : ''}
        ${s.note ? `<div class="rc-hr"></div><div class="rc-s">Note: ${esc(s.note)}</div>` : ''}
        <div class="rc-hr"></div><div class="rc-c rc-s">${esc(sh.footer || '')}</div>`;
    },
    text(s) {
      const sh = DB.settings; const cust = findCustomer(s.customerId);
      let t = `*${sh.shopName}*\n` + (sh.shopPhone ? 'Phone: ' + sh.shopPhone + '\n' : '') + `Receipt #${C.invLabel(s)} · ${C.fmtDT(s.date)}\n` + (cust ? 'Customer: ' + cust.name + '\n' : '') + '------------------\n';
      s.items.forEach(i => { t += `${i.name} ${i.qty}×${fmt(i.price)} = ${fmt(i.price * i.qty)}\n`; });
      t += '------------------\n';
      if (s.discount > 0) t += `Discount: -${fmt(s.discount)}\n`; if (s.tax > 0) t += `Tax: ${fmt(s.tax)}\n`;
      t += `*Total: ${money(s.total)}*\nPaid: ${money(s.paid)}\n`; if (s.due > 0) t += `*Due: ${money(s.due)}*\n`;
      return t + (sh.footer || '');
    },
    showId(id) { const s = C.findSale(id); if (s) Receipt.show(s); },
    show(s, opt) {
      opt = opt || {}; this.cur = s;
      const btOk = window.Printer && Printer.isConnected();
      Modal.open({ title: 'Receipt #' + C.invLabel(s), size: 'full', body: `
        <div class="receipt" id="rc-paper">${this.inner(s)}</div>
        <div style="max-width:380px;margin:14px auto 0">
          <div class="grid2 mb2"><button class="btn btn-primary" onclick="Receipt.print()"><i class="fas fa-print"></i> Print</button><button class="btn btn-soft" onclick="Receipt.bt()"><i class="fab fa-bluetooth-b"></i> ${btOk ? 'Bluetooth print' : 'Bluetooth connect'}</button></div>
          <div class="grid2 mb2"><button class="btn btn-ghost" onclick="Receipt.share('wa')"><i class="fab fa-whatsapp ok"></i> WhatsApp</button><button class="btn btn-ghost" onclick="Receipt.share('sms')"><i class="fas fa-message"></i> SMS</button></div>
          <div class="grid2">${s.due > 0 && s.customerId ? `<button class="btn btn-ok" onclick="People.collect('${s.customerId}')"><i class="fas fa-hand-holding-dollar"></i> Due Collected</button>` : '<span></span>'}
          <button class="btn btn-danger-soft" onclick="Receipt.ret('${s.id}')"><i class="fas fa-rotate-left"></i> Product Return</button></div></div>`,
        foot: `<button class="btn btn-primary" onclick="Modal.closeFrom(this)">${opt.fresh ? 'New sale' : 'Close'}</button>` });
    },
    print() {
      const w = DB.settings.paper === '80' ? '72mm' : '48mm';
      printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title><style>${RC_CSS}body{width:${w}}</style></head><body>${this.inner(this.cur)}</body></html>`);
    },
    bt() { Printer.print(this.cur); },
    share(kind) { const s = this.cur; const c = findCustomer(s.customerId); const ph = c ? c.phone : ''; if (kind === 'wa') shareWA(ph, this.text(s)); else shareSMS(ph, this.text(s)); },

    // ---- Returns ----
    ret(saleId) {
      const s = C.findSale(saleId); if (!s) return;
      const rows = s.items.map(i => ({ ...i, left: r2(i.qty - C.returnedQty(s.id, i.id)) })).filter(i => i.left > 0);
      if (!rows.length) { toast('All products on this bill have already been returned'); return; }
      const canDue = !!s.customerId;
      const m = Modal.open({ title: 'Product Return — #' + C.invLabel(s), body: `
        ${rows.map((i, k) => `<div class="flex items-c gap3 mb2"><div class="grow"><div class="fw6 sm">${esc(i.name)}</div><div class="xs muted">${money(i.price)} · Returnable ${i.left}</div></div><input type="number" min="0" max="${i.left}" step="any" class="input rt-q" data-k="${k}" style="width:90px" value="0" oninput="Receipt.retCalc()"></div>`).join('')}
        <div class="field mt3"><label class="label">Refund type</label><select id="rt-type" class="input" onchange="Receipt.retCalc()"><option value="cash">Cash Change</option>${canDue ? '<option value="due" ' + (s.due > 0 ? 'selected' : '') + '>Deduct from customer due</option>' : ''}</select></div>
        <div class="field"><label class="label">Reason (optional)</label><input id="rt-note" class="input"></div>
        <div class="card pad-s sumrow big" style="margin:0"><span>Return value</span><span class="ptext" id="rt-amt">৳0</span></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-bad" id="rt-ok">Returns Confirm</button>` });
      m._rows = rows; m._sale = s; this._rm = m; this.retCalc();
      m.querySelector('#rt-ok').onclick = () => {
        const calc = Receipt.retCalc(); if (!calc.items.length) { toast('⚠️ Enter return qty'); return; }
        askConfirm(`${money(calc.amount)} Confirm return? Products will return to stock.`, () => {
          calc.items.forEach(i => { const p = findProduct(i.id); if (p && p.track !== false) p.stock = r2(num(p.stock) + i.qty); });
          DB.returns.push({ id: genId(), date: new Date().toISOString(), saleId: s.id, customerId: s.customerId || null, items: calc.items, amount: calc.amount, revenue: calc.revenue, cogs: calc.cogs, refundType: $('rt-type').value, note: $('rt-note').value.trim() });
          C.save('products'); C.save('returns'); Modal.closeAll(); toast('Returns Saved ✓'); App.refresh();
        }, { yes: 'Yes, take return', icon: 'fa-rotate-left' });
      };
    },
    retCalc() {
      const m = this._rm; const s = m._sale; const items = [];
      m.querySelectorAll('.rt-q').forEach(inp => { const r = m._rows[+inp.dataset.k]; let q = num(inp.value); if (q > r.left) { q = r.left; inp.value = q; } if (q > 0) items.push({ id: r.id, name: r.name, price: r.price, cost: r.cost || 0, qty: q }); });
      const gross = items.reduce((t, i) => t + i.price * i.qty, 0);
      const amount = r2(gross * (s.subtotal ? s.total / s.subtotal : 1)); const revenue = r2(gross * (s.subtotal ? (s.subtotal - s.discount) / s.subtotal : 1));
      const cogs = r2(items.reduce((t, i) => t + i.cost * i.qty, 0)); $('rt-amt').textContent = money(amount);
      return { items, amount, revenue, cogs };
    }
  };

  // ================= Sales History =================
  const Hist = window.Hist = {
    preset: 'today', from: '', to: '', q: '', st: 'all',
    range() { const t = C.todayKey(); return { today: [t, t], week: [C.addDays(t, -6), t], month: [C.monthStart(), t], all: ['', ''], custom: [this.from, this.to] }[this.preset]; },
    render() {
      const [f, t] = this.range();
      $('view').innerHTML = `<div class="page-head"><div><h2>Sales History</h2><p>View receipts, take returns, collect dues</p></div><button class="btn btn-ghost" onclick="Hist.csv()"><i class="fas fa-file-csv"></i> CSV</button></div>
      <div class="card pad-s mb3"><div class="chips mb2">${[['today', 'Today'], ['week', '7 Days'], ['month', 'This Month'], ['all', 'All'], ['custom', 'Custom']].map(p => `<button class="chip ${this.preset === p[0] ? 'on' : ''}" onclick="Hist.setP('${p[0]}')">${p[1]}</button>`).join('')}</div>
        ${this.preset === 'custom' ? `<div class="grid2 mb2"><input type="date" class="input" value="${this.from}" onchange="Hist.from=this.value;Hist.list()"><input type="date" class="input" value="${this.to}" onchange="Hist.to=this.value;Hist.list()"></div>` : ''}
        <div class="relative mb2"><i class="fas fa-magnifying-glass search-ico"></i><input class="input has-ico" placeholder="Receipt #, customer or product..." value="${esc(this.q)}" oninput="Hist.q=this.value;Hist.list()"></div>
        <div class="chips">${[['all', 'All'], ['due', 'Due'], ['ret', 'Has returns']].map(p => `<button class="chip ${this.st === p[0] ? 'on' : ''}" onclick="Hist.st='${p[0]}';Hist.render()">${p[1]}</button>`).join('')}</div></div>
      <div class="stats" id="h-stats"></div><div class="card" id="h-list"></div>`;
      this.list();
    },
    setP(p) { this.preset = p; this.render(); },
    rows() {
      const [f, t] = this.range(); const q = this.q.trim().toLowerCase();
      return DB.sales.filter(s => C.inRange(s.date, f, t)).filter(s => {
        if (this.st === 'due' && !(s.due > 0)) return false; if (this.st === 'ret' && !C.returnedAmount(s.id)) return false;
        if (!q) return true; const c = findCustomer(s.customerId);
        return C.invLabel(s).toLowerCase().includes(q) || (c && (c.name.toLowerCase().includes(q) || (c.phone || '').includes(q))) || s.items.some(i => i.name.toLowerCase().includes(q));
      });
    },
    list() {
      const arr = this.rows(); const tot = r2(arr.reduce((s, x) => s + x.total, 0)); const due = r2(arr.reduce((s, x) => s + num(x.due), 0));
      $('h-stats').innerHTML = `<div class="stat"><div class="k">Bill</div><div class="v">${arr.length}</div></div><div class="stat"><div class="k">Gross Sales</div><div class="v">${money(tot)}</div></div><div class="stat"><div class="k">Due reduced</div><div class="v bad">${money(due)}</div></div>`;
      $('h-list').innerHTML = arr.length ? arr.slice(0, 200).map(s => { const c = findCustomer(s.customerId); const ret = C.returnedAmount(s.id); return `<div class="row" onclick="Receipt.showId('${s.id}')"><div class="avatar"><i class="fas fa-receipt"></i></div>
        <div class="grow"><div class="t">#${C.invLabel(s)} · ${esc(c ? c.name : 'Walk-in')}</div><div class="s">${C.fmtDT(s.date)} · ${esc(s.items.map(i => i.name + '×' + i.qty).join(', '))}</div></div>
        <div class="tr"><div class="fw7 ptext">${money(s.total)}</div><div class="flex gap1" style="justify-content:flex-end">${s.due > 0 ? `<span class="badge b-bad">Due ${money(s.due)}</span>` : `<span class="badge b-ok">${MN[s.paymentMethod] || 'Cash'}</span>`}${ret ? '<span class="badge b-warn">Returns</span>' : ''}</div></div></div>`; }).join('') : '<div class="empty"><i class="fas fa-receipt"></i>No sales</div>';
    },
    csv() { const arr = this.rows(); C.download('propos-sales.csv', C.toCSV([['Receipt', 'Date', 'Customer', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Due', 'Payment', 'Product'], ...arr.map(s => { const c = findCustomer(s.customerId); return [C.invLabel(s), C.dkey(s.date), c ? c.name : '', s.subtotal, s.discount, s.tax, s.total, s.paid, s.due, MN[s.paymentMethod], s.items.map(i => i.name + '×' + i.qty).join('; ')]; })]), 'text/csv'); }
  };
  App.Views.history = Hist;

  // ================= Expenses =================
  const CATS = ['Rent', 'Utilities', 'Salary', 'Transport', 'Mobile/Internet', 'Repair', 'Snacks/tea', 'Other'];
  const Exp = window.Exp = {
    from: '', to: '',
    get F() { return this.from || C.monthStart(); }, get T() { return this.to || C.todayKey(); },
    render() {
      $('view').innerHTML = `<div class="page-head"><div><h2>Expenses</h2><p>Daily and monthly expense tracking</p></div><button class="btn btn-primary" onclick="Exp.add()"><i class="fas fa-plus"></i> New expense</button></div>
      <div class="card pad-s mb3"><div class="grid2"><div><label class="label">from</label><input type="date" class="input" value="${this.F}" onchange="Exp.from=this.value;Exp.list()"></div><div><label class="label">to</label><input type="date" class="input" value="${this.T}" onchange="Exp.to=this.value;Exp.list()"></div></div></div>
      <div id="ex-sum"></div><div class="card" id="ex-list"></div>`;
      this.list();
    },
    list() {
      const arr = DB.expenses.filter(e => C.inRange(e.date, this.F, this.T)).sort((a, b) => a.date < b.date ? 1 : -1);
      const tot = r2(arr.reduce((s, e) => s + num(e.amount), 0)); const by = {};
      arr.forEach(e => by[e.category] = r2((by[e.category] || 0) + num(e.amount)));
      $('ex-sum').innerHTML = `<div class="stats"><div class="stat hl"><div class="k">Total Expenses</div><div class="v">${money(tot)}</div></div><div class="stat"><div class="k">Entry</div><div class="v">${arr.length}</div></div></div>` +
        (Object.keys(by).length ? `<div class="chips mb3">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="badge b-p" style="padding:6px 12px;font-size:12px">${esc(k)}: ${money(v)}</span>`).join('')}</div>` : '');
      $('ex-list').innerHTML = arr.length ? arr.map(e => `<div class="row" style="cursor:default"><div class="avatar"><i class="fas fa-wallet"></i></div><div class="grow"><div class="t">${esc(e.category)}</div><div class="s">${C.fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div><div class="fw7 bad">${money(e.amount)}</div><button class="icon-btn" onclick="Exp.del('${e.id}')"><i class="fas fa-trash bad"></i></button></div>`).join('') : '<div class="empty"><i class="fas fa-wallet"></i>No expenses</div>';
    },
    add() {
      const cats = [...new Set([...CATS, ...DB.expenses.map(e => e.category)])];
      const m = Modal.open({ title: 'New expense', body: `<div class="field"><label class="label">Category *</label><input id="ex-cat" class="input" list="ex-cats" placeholder="e.g. rent" autofocus><datalist id="ex-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="grid2"><div class="field"><label class="label">Amount *</label><input id="ex-amt" type="number" step="any" min="0" class="input"></div><div class="field"><label class="label">Date</label><input id="ex-date" type="date" class="input" value="${C.todayKey()}"></div></div>
        <div class="field"><label class="label">Note</label><input id="ex-note" class="input"></div>`, foot: `<button class="btn" onclick="Modal.closeFrom(this)">Cancel</button><button class="btn btn-primary" id="ex-ok">Save</button>` });
      m.querySelector('#ex-ok').onclick = () => {
        const cat = $('ex-cat').value.trim(), amt = num($('ex-amt').value); if (!cat || amt <= 0) { toast('⚠️ Enter category & amount'); return; }
        const d = $('ex-date').value || C.todayKey(); const now = new Date(); const iso = new Date(d + 'T' + C.z2(now.getHours()) + ':' + C.z2(now.getMinutes()) + ':00').toISOString();
        DB.expenses.push({ id: genId(), date: iso, category: cat, amount: r2(amt), note: $('ex-note').value.trim() }); C.save('expenses'); Modal.close(m); toast('Expense saved ✓'); this.list();
      };
    },
    del(id) { askConfirm('Delete this expense?', () => { DB.expenses = DB.expenses.filter(e => e.id !== id); C.save('expenses'); toast('Deleted'); this.list(); }, { danger: true, yes: 'Delete' }); }
  };
  App.Views.expenses = Exp;

  // ================= Reports =================
  const Rep = window.Rep = {
    preset: 'today', from: '', to: '',
    range() { const t = C.todayKey(); return { today: [t, t], yday: [C.addDays(t, -1), C.addDays(t, -1)], week: [C.addDays(t, -6), t], month: [C.monthStart(), t], all: ['', ''], custom: [this.from, this.to] }[this.preset]; },
    render() {
      $('view').innerHTML = `<div class="page-head"><div><h2>Reports</h2><p>Sales, profit/loss & collections</p></div><div class="flex gap2"><button class="btn btn-ghost" onclick="Rep.csv()"><i class="fas fa-file-csv"></i></button><button class="btn btn-ghost" onclick="Rep.print()"><i class="fas fa-print"></i></button></div></div>
      <div class="card pad-s mb3"><div class="chips">${[['today', 'Today'], ['yday', 'Yesterday'], ['week', '7 Days'], ['month', 'This Month'], ['all', 'All'], ['custom', 'Custom']].map(p => `<button class="chip ${this.preset === p[0] ? 'on' : ''}" onclick="Rep.setP('${p[0]}')">${p[1]}</button>`).join('')}</div>
        ${this.preset === 'custom' ? `<div class="grid2 mt2"><input type="date" class="input" value="${this.from}" onchange="Rep.from=this.value;Rep.body()"><input type="date" class="input" value="${this.to}" onchange="Rep.to=this.value;Rep.body()"></div>` : ''}</div><div id="rep-body"></div>`;
      this.body();
    },
    setP(p) { this.preset = p; this.render(); },
    data() { const [f, t] = this.range(); return C.buildReport(f, t); },
    body() {
      const r = this.data();
      $('rep-body').innerHTML = `
      <div class="stats"><div class="stat hl"><div class="k">Net profit (after expenses)</div><div class="v">${money(r.netProfit)}</div></div><div class="stat"><div class="k">Net Sales</div><div class="v">${money(r.netSales)}</div></div>
        <div class="stat"><div class="k">Gross Profit</div><div class="v ok">${money(r.grossProfit)}</div></div><div class="stat"><div class="k">Expenses</div><div class="v bad">${money(r.expenses)}</div></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-cash-register ptext"></i> Sales breakdown</div>
        ${[['Invoices', r.count], ['Gross Sales', money(r.grossSales)], ['Product Return', '-' + money(r.returnsTotal)], ['Discount applied', money(r.discount)], ['Tax Collected', money(r.tax)], ['COGS of sold products', money(r.cogs)]].map(x => `<div class="kv"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-hand-holding-dollar ptext"></i> Collections & dues</div>
        ${[['New Due reduced', `<span class="bad">${money(r.newDue)}</span>`], ['Due collected', `<span class="ok">${money(r.dueCollected)}</span>`], ['Cash collected (sales+due)', money(r.collected.cash)], ['Card collected', money(r.collected.card)], ['Mobile banking collected', money(r.collected.mobile)], ['Purchases (stock)', money(r.purchases)], ['Paid to suppliers', money(r.supplierPaid)], ['Cash refunds', money(r.cashRefund)]].map(x => `<div class="kv"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('')}
        <div class="kv"><span class="muted">Current total payable</span><b class="bad">${money(C.totalCustomerDue())}</b></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-trophy ptext"></i> Top selling products</div>${r.topProducts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="r">Qty</th><th class="r">Sales</th><th class="r">Profit</th></tr></thead><tbody>${r.topProducts.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${p.qty}</td><td class="r">${money(p.amount)}</td><td class="r ok">${money(p.profit)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No data</div>'}</div>
      <div class="card pad"><div class="sec-title"><i class="fas fa-tags ptext"></i> Sales by category</div>${r.categories.length ? r.categories.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join('') : '<div class="empty">No data</div>'}</div>`;
    },
    label() { const [f, t] = this.range(); return f || t ? `${f || '…'} from ${t || '…'}` : 'All Time'; },
    csv() {
      const r = this.data();
      C.download('propos-report.csv', C.toCSV([['ProPOS Report', this.label()], [], ['Invoices', r.count], ['Gross Sales', r.grossSales], ['Returns', r.returnsTotal], ['Net Sales', r.netSales], ['COGS', r.cogs], ['Gross Profit', r.grossProfit], ['Expenses', r.expenses], ['Net Profit', r.netProfit], ['New Due', r.newDue], ['Due Collected', r.dueCollected], [], ['Product', 'Qty', 'Sales', 'Profit'], ...r.topProducts.map(p => [p.name, p.qty, p.amount, p.profit])]), 'text/csv');
    },
    print() {
      const r = this.data(); const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right"><b>${b}</b></td></tr>`;
      printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reports</title><style>body{font-family:'Noto Sans Bengali',sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:7px 4px;border-bottom:1px solid #ddd;font-size:14px}h2{margin:0}</style></head><body><h2>${esc(DB.settings.shopName)} — Reports</h2><p>${esc(this.label())}</p><table>${row('Invoices', r.count)}${row('Gross Sales', money(r.grossSales))}${row('Returns', money(r.returnsTotal))}${row('Net Sales', money(r.netSales))}${row('COGS', money(r.cogs))}${row('Gross Profit', money(r.grossProfit))}${row('Expenses', money(r.expenses))}${row('Net Profit', money(r.netProfit))}${row('New Due', money(r.newDue))}${row('Due Collected', money(r.dueCollected))}</table></body></html>`);
    }
  };
  App.Views.reports = Rep;

  // ================= Dashboard =================
  App.Views.dashboard = {
    render() {
      const t = C.todayKey(); const td = C.buildReport(t, t); const mo = C.buildReport(C.monthStart(), t);
      const days = []; for (let i = 6; i >= 0; i--) { const k = C.addDays(t, -i); days.push({ k, v: C.buildReport(k, k).netSales }); }
      const mx = Math.max.apply(null, days.map(d => d.v).concat([1]));
      const low = DB.products.filter(p => p.track !== false && p.stock <= (p.minStock || 0)).slice(0, 8);
      const soon = C.addDays(t, 30); const exp = DB.products.filter(p => p.expiry && p.expiry <= soon).sort((a, b) => a.expiry < b.expiry ? -1 : 1).slice(0, 6);
      const debtors = DB.customers.map(c => ({ c, b: C.customerBalance(c.id) })).filter(x => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 5);
      const recent = DB.sales.slice(0, 5);
      $('view').innerHTML = `<div class="page-head"><div><h2>Dashboard</h2><p>${esc(DB.settings.shopName)} · ${C.fmtDate(new Date().toISOString())}</p></div></div>
      <div class="stats"><div class="stat hl"><div class="k"><i class="fas fa-sun"></i> Today's sales</div><div class="v">${money(td.netSales)}</div></div>
        <div class="stat"><div class="k">Today's profit</div><div class="v ok">${money(td.grossProfit)}</div></div><div class="stat"><div class="k">Today's bills</div><div class="v">${td.count}</div></div><div class="stat"><div class="k">Today's expenses</div><div class="v bad">${money(td.expenses)}</div></div>
        <div class="stat"><div class="k">This month's sales</div><div class="v">${money(mo.netSales)}</div></div><div class="stat"><div class="k">This month's net profit</div><div class="v ${mo.netProfit >= 0 ? 'ok' : 'bad'}">${money(mo.netProfit)}</div></div>
        <div class="stat" onclick="App.go('customers')" style="cursor:pointer"><div class="k">Total supplier payable</div><div class="v bad">${money(C.totalCustomerDue())}</div></div><div class="stat"><div class="k">Stock value</div><div class="v">${money(C.stockValue())}</div></div></div>
      <div class="card pad mb3"><div class="sec-title"><i class="fas fa-chart-column ptext"></i> Last 7 days sales</div><div class="bars">${days.map(d => `<div class="bar"><b>${d.v ? fmt(Math.round(d.v)) : ''}</b><i style="height:${Math.max(3, d.v / mx * 90)}%"></i><small>${new Date(d.k + 'T00:00').toLocaleDateString('bn-BD', { weekday: 'short' })}</small></div>`).join('')}</div></div>
      <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start">
        <div class="card pad"><div class="sec-title"><i class="fas fa-user-clock bad"></i> Highest dues</div>${debtors.length ? debtors.map(x => `<div class="kv" onclick="People.detail('${x.c.id}')" style="cursor:pointer"><span>${esc(x.c.name)}</span><b class="bad">${money(x.b)}</b></div>`).join('') : '<div class="empty" style="padding:14px">No dues ✓</div>'}</div>
        <div class="card pad"><div class="sec-title"><i class="fas fa-triangle-exclamation warn"></i> Low Stock</div>${low.length ? low.map(p => `<div class="kv"><span>${esc(p.name)}</span><b class="bad">${p.stock} ${esc(p.unit || '')}</b></div>`).join('') : '<div class="empty" style="padding:14px">All stock levels OK ✓</div>'}</div>
        <div class="card pad"><div class="sec-title"><i class="fas fa-hourglass-half warn"></i> Expiring soon</div>${exp.length ? exp.map(p => `<div class="kv"><span>${esc(p.name)}</span><b class="${p.expiry < t ? 'bad' : 'warn'}">${p.expiry}</b></div>`).join('') : '<div class="empty" style="padding:14px">All good ✓</div>'}</div>
        <div class="card pad"><div class="sec-title"><i class="fas fa-clock-rotate-left ptext"></i> Recent sales</div>${recent.length ? recent.map(s => `<div class="kv" onclick="Receipt.showId('${s.id}')" style="cursor:pointer"><span>#${C.invLabel(s)} · ${C.fmtTime(s.date)}</span><b>${money(s.total)}</b></div>`).join('') : '<div class="empty" style="padding:14px">No sales yet</div>'}</div></div>`;
    }
  };
})();
