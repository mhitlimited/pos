/* ProPOS: ক্রেতা, বাকি আদায়, সরবরাহকারী, ক্রয় */
(function () {
  'use strict';
  const C = Core, { DB, esc, num, r2, money, genId, toast, findCustomer, findSupplier, findProduct } = C;
  const $ = id => document.getElementById(id);
  const ini = n => esc((n || '?').trim().charAt(0).toUpperCase());
  const MN = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল', due: 'বাকি' };

  const People = window.People = {
    cq: '', cf: 'all', tab: 'purchases', pr: [],

    // ---------- ক্রেতা বাছাই (POS/চেকআউট) ----------
    pick(cb, allowNone) {
      const m = Modal.open({ title: 'ক্রেতা বাছাই', body: `
        <div class="relative mb3"><i class="fas fa-magnifying-glass search-ico"></i><input id="pk-q" class="input has-ico" placeholder="নাম বা ফোন..." oninput="People._pk()" autofocus></div>
        ${allowNone ? '<button class="btn btn-ghost btn-block mb3" id="pk-none">ওয়াক-ইন ক্রেতা (কেউ না)</button>' : ''}
        <button class="btn btn-soft btn-block mb3" id="pk-new"><i class="fas fa-user-plus"></i> নতুন ক্রেতা যোগ করুন</button><div class="card" id="pk-list"></div>` });
      People._pkCb = cb; People._pkEl = m;
      if (allowNone) m.querySelector('#pk-none').onclick = () => { Modal.close(m); cb(null); };
      m.querySelector('#pk-new').onclick = () => People.edit(null, id => { Modal.close(m); cb(id); });
      People._pk();
    },
    _pk() {
      const q = ($('pk-q').value || '').trim().toLowerCase(); const el = $('pk-list');
      const arr = DB.customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 60);
      el.innerHTML = arr.length ? arr.map(c => { const b = C.customerBalance(c.id); return `<div class="row" data-id="${c.id}"><div class="avatar">${ini(c.name)}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.phone || '—')}</div></div>${b > 0 ? `<span class="badge b-bad">বাকি ${money(b)}</span>` : ''}</div>`; }).join('') : '<div class="empty">কোনো ক্রেতা নেই</div>';
      el.querySelectorAll('.row').forEach(r => r.onclick = () => { const id = r.dataset.id; Modal.close(People._pkEl); People._pkCb(id); });
    },

    // ---------- ক্রেতা তালিকা ----------
    render() {
      const due = C.totalCustomerDue(); const withDue = DB.customers.filter(c => C.customerBalance(c.id) > 0).length;
      $('view').innerHTML = `
      <div class="page-head"><div><h2>ক্রেতা ও বাকি</h2><p>বাকির হিসাব, আদায় ও খতিয়ান</p></div>
        <div class="flex gap2"><button class="btn btn-ghost" onclick="People.csvOut()"><i class="fas fa-file-csv"></i></button><button class="btn btn-primary" onclick="People.edit()"><i class="fas fa-user-plus"></i> নতুন ক্রেতা</button></div></div>
      <div class="stats"><div class="stat hl"><div class="k">মোট বাকি পাওনা</div><div class="v">${money(due)}</div></div>
        <div class="stat"><div class="k">মোট ক্রেতা</div><div class="v">${DB.customers.length}</div></div>
        <div class="stat"><div class="k">বাকি আছে এমন ক্রেতা</div><div class="v ${withDue ? 'bad' : ''}">${withDue}</div></div>
        <div class="stat"><div class="k">সরবরাহকারীকে দেনা</div><div class="v">${money(C.totalSupplierDue())}</div></div></div>
      <div class="card pad-s mb3"><div class="relative mb2"><i class="fas fa-magnifying-glass search-ico"></i><input class="input has-ico" placeholder="নাম বা ফোন..." value="${esc(this.cq)}" oninput="People.cSearch(this.value)"></div>
        <div class="chips"><button class="chip ${this.cf === 'all' ? 'on' : ''}" onclick="People.cFilter('all')">সব</button><button class="chip ${this.cf === 'due' ? 'on' : ''}" onclick="People.cFilter('due')">বাকি আছে</button></div></div>
      <div class="card" id="cust-list"></div>`;
      this.cList();
    },
    cSearch(v) { this.cq = v; this.cList(); }, cFilter(f) { this.cf = f; this.render(); },
    cList() {
      const q = this.cq.trim().toLowerCase();
      let arr = DB.customers.map(c => ({ c, b: C.customerBalance(c.id) })).filter(x => !q || x.c.name.toLowerCase().includes(q) || (x.c.phone || '').includes(q));
      if (this.cf === 'due') arr = arr.filter(x => x.b > 0);
      arr.sort((a, b) => b.b - a.b || a.c.name.localeCompare(b.c.name, 'bn'));
      const el = $('cust-list'); if (!el) return;
      el.innerHTML = arr.length ? arr.map(x => `<div class="row" onclick="People.detail('${x.c.id}')"><div class="avatar">${ini(x.c.name)}</div>
        <div class="grow"><div class="t">${esc(x.c.name)}</div><div class="s">${esc(x.c.phone || 'ফোন নেই')}${x.c.address ? ' · ' + esc(x.c.address) : ''}</div></div>
        <div class="tr">${x.b > 0 ? `<div class="fw7 bad">${money(x.b)}</div><div class="xs muted">বাকি</div>` : (x.b < 0 ? `<div class="fw7 ok">${money(-x.b)}</div><div class="xs muted">অগ্রিম</div>` : '<span class="badge b-ok">পরিষ্কার</span>')}</div></div>`).join('')
        : '<div class="empty"><i class="fas fa-users"></i>কোনো ক্রেতা নেই</div>';
    },
    csvOut() { C.download('propos-customers.csv', C.toCSV([['নাম', 'ফোন', 'ঠিকানা', 'বর্তমান বাকি'], ...DB.customers.map(c => [c.name, c.phone, c.address, C.customerBalance(c.id)])]), 'text/csv'); },

    edit(id, after) {
      const c = id ? findCustomer(id) : null;
      const m = Modal.open({ title: c ? 'ক্রেতা সম্পাদনা' : 'নতুন ক্রেতা', body: `
        <div class="field"><label class="label">নাম *</label><input id="cf-name" class="input" autofocus value="${esc(c ? c.name : '')}"></div>
        <div class="field"><label class="label">মোবাইল</label><input id="cf-phone" type="tel" class="input" value="${esc(c ? c.phone : '')}"></div>
        <div class="field"><label class="label">ঠিকানা</label><input id="cf-addr" class="input" value="${esc(c ? c.address : '')}"></div>
        <div class="grid2"><div class="field"><label class="label">প্রারম্ভিক বাকি (৳)</label><input id="cf-open" type="number" step="any" class="input" value="${c ? c.openingDue || '' : ''}" placeholder="0"></div>
          <div class="field"><label class="label">বাকির সীমা (৳)</label><input id="cf-lim" type="number" min="0" class="input" value="${c ? c.creditLimit || '' : ''}" placeholder="সীমাহীন"></div></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-primary" id="cf-ok">সংরক্ষণ</button>` });
      m.querySelector('#cf-ok').onclick = () => {
        const name = $('cf-name').value.trim(); if (!name) { toast('⚠️ নাম দিন'); return; }
        const ph = $('cf-phone').value.trim();
        if (ph && DB.customers.some(x => x.phone === ph && x.id !== id)) { toast('⚠️ এই নম্বরে আরেকজন ক্রেতা আছে'); return; }
        const d = { name, phone: ph, address: $('cf-addr').value.trim(), openingDue: num($('cf-open').value), creditLimit: num($('cf-lim').value) };
        let rid = id; if (c) Object.assign(c, d); else { rid = genId(); DB.customers.push(Object.assign({ id: rid, created: new Date().toISOString() }, d)); }
        C.save('customers'); Modal.close(m); toast('ক্রেতা সংরক্ষিত ✓'); if (after) after(rid); else App.refresh();
      };
    },
    detail(id) {
      const c = findCustomer(id); if (!c) return; const b = C.customerBalance(id);
      const led = C.customerLedger(id).reverse();
      const m = Modal.open({ title: c.name, size: 'wide', body: `
        <div class="card pad mb3 tc"><div class="muted xs">${b >= 0 ? 'বর্তমান বাকি' : 'অগ্রিম জমা'}</div><div class="xxl fw7 ${b > 0 ? 'bad' : 'ok'}">${money(Math.abs(b))}</div>
          <div class="xs muted mt1">${esc(c.phone || 'ফোন নেই')}${c.address ? ' · ' + esc(c.address) : ''}${c.creditLimit ? ' · সীমা ' + money(c.creditLimit) : ''}</div></div>
        <div class="grid2 mb3"><button class="btn btn-primary" onclick="People.collect('${id}')"><i class="fas fa-hand-holding-dollar"></i> বাকি আদায়</button>
          <button class="btn btn-soft" onclick="People.remind('${id}')"><i class="fas fa-bell"></i> রিমাইন্ডার</button></div>
        <div class="sec-title">খতিয়ান</div>
        <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>তারিখ</th><th>বিবরণ</th><th class="r">বাকি +</th><th class="r">জমা −</th><th class="r">ব্যালেন্স</th></tr></thead><tbody>${led.length ? led.map(r => `<tr ${r.type === 'sale' ? `onclick="Receipt.showId('${r.ref}')" style="cursor:pointer"` : ''}><td class="xs">${C.fmtDate(r.date)}</td><td class="sm">${esc(r.desc)}</td><td class="r bad">${r.debit ? money(r.debit) : ''}</td><td class="r ok">${r.credit ? money(r.credit) : ''}</td><td class="r fw6">${money(r.balance)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">কোনো লেনদেন নেই</td></tr>'}</tbody></table></div>`,
        foot: `<button class="btn btn-danger-soft" onclick="People.del('${id}')"><i class="fas fa-trash"></i></button><button class="btn" onclick="People.edit('${id}',()=>{Modal.closeAll();People.detail('${id}');App.refresh()})"><i class="fas fa-pen"></i> এডিট</button>` });
    },
    collect(id) {
      const c = findCustomer(id); const b = C.customerBalance(id);
      const m = Modal.open({ title: 'বাকি আদায় — ' + c.name, body: `
        <div class="tc mb3"><div class="muted xs">বর্তমান বাকি</div><div class="xl fw7 bad">${money(Math.max(0, b))}</div></div>
        <div class="field"><label class="label">আদায়ের পরিমাণ (৳)</label><input id="cl-amt" type="number" step="any" min="0" class="input" style="font-size:20px;font-weight:700" autofocus value="${b > 0 ? b : ''}"></div>
        <div class="field"><label class="label">পেমেন্ট মাধ্যম</label><select id="cl-m" class="input"><option value="cash">নগদ</option><option value="mobile">মোবাইল ব্যাংকিং</option><option value="card">কার্ড</option></select></div>
        <div class="field"><label class="label">নোট</label><input id="cl-note" class="input" placeholder="ঐচ্ছিক"></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-ok" id="cl-ok">আদায় নিশ্চিত করুন</button>` });
      m.querySelector('#cl-ok').onclick = () => {
        const a = num($('cl-amt').value); if (a <= 0) { toast('⚠️ সঠিক পরিমাণ দিন'); return; }
        const go = () => {
          DB.payments.push({ id: genId(), date: new Date().toISOString(), customerId: id, amount: r2(a), method: $('cl-m').value, note: $('cl-note').value.trim() });
          C.save('payments'); Modal.closeAll(); toast('বাকি আদায় হয়েছে ✓'); App.refresh();
          const nb = C.customerBalance(id); const txt = `প্রিয় ${c.name}, ${DB.settings.shopName}-এ আপনার ${money(a)} জমা পেয়েছি।${nb > 0 ? ' বর্তমান বাকি ' + money(nb) : ' আপনার বাকি পরিষ্কার।'} ধন্যবাদ।`;
          setTimeout(() => { if (c.phone) askConfirm('ক্রেতাকে WhatsApp এ কনফার্মেশন পাঠাবেন?', () => shareWA(c.phone, txt), { yes: 'পাঠান', icon: 'fa-paper-plane' }); }, 400);
        };
        if (a > Math.max(0, b)) askConfirm(`বাকির চেয়ে ${money(a - Math.max(0, b))} বেশি দিচ্ছেন — অতিরিক্ত অংশ অগ্রিম হিসেবে থাকবে।`, go, { yes: 'ঠিক আছে' }); else go();
      };
    },
    remind(id) {
      const c = findCustomer(id); const b = C.customerBalance(id); if (b <= 0) { toast('এই ক্রেতার কোনো বাকি নেই'); return; }
      const txt = `প্রিয় ${c.name}, ${DB.settings.shopName}-এ আপনার ${money(b)} টাকা বাকি আছে। অনুগ্রহ করে সুবিধামতো পরিশোধ করুন। ধন্যবাদ।`;
      const m = Modal.open({ title: 'বাকির রিমাইন্ডার', body: `<div class="card pad-s mb3 sm" style="user-select:text">${esc(txt)}</div>
        <div class="grid2"><button class="btn btn-ok" id="rm-wa"><i class="fab fa-whatsapp"></i> WhatsApp</button>
        <button class="btn btn-soft" id="rm-sms"><i class="fas fa-message"></i> SMS</button></div>${c.phone ? '' : '<p class="xs muted mt2">ফোন নম্বর না থাকায় WhatsApp-এ কন্টাক্ট বেছে নিতে হবে।</p>'}` });
      m.querySelector('#rm-wa').onclick = () => shareWA(c.phone || '', txt);
      m.querySelector('#rm-sms').onclick = () => shareSMS(c.phone || '', txt);
    },
    del(id) {
      const c = findCustomer(id); const used = DB.sales.some(s => s.customerId === id) || DB.payments.some(p => p.customerId === id);
      if (used) { toast('⚠️ লেনদেন থাকায় মুছা যাবে না'); return; }
      askConfirm(`"${c.name}" মুছে ফেলবেন?`, () => { DB.customers = DB.customers.filter(x => x.id !== id); C.save('customers'); Modal.closeAll(); toast('মুছে ফেলা হয়েছে'); App.refresh(); }, { danger: true, yes: 'মুছুন', title: 'ক্রেতা মুছবেন?' });
    }
  };
  App.Views.customers = { render: () => People.render() };

  // ================= ক্রয় ও সরবরাহকারী =================
  const Buy = window.Buy = {
    render() {
      const t = People.tab;
      $('view').innerHTML = `
      <div class="page-head"><div><h2>ক্রয় ও সরবরাহকারী</h2><p>মাল কেনা, স্টক বাড়ানো ও সরবরাহকারীর পাওনা</p></div>
        <div class="flex gap2"><button class="btn btn-ghost" onclick="Buy.editSup()"><i class="fas fa-user-plus"></i> সরবরাহকারী</button><button class="btn btn-primary" onclick="Buy.newPurchase()"><i class="fas fa-plus"></i> নতুন ক্রয়</button></div></div>
      <div class="stats"><div class="stat"><div class="k">সরবরাহকারীকে দেনা</div><div class="v bad">${money(C.totalSupplierDue())}</div></div><div class="stat"><div class="k">সরবরাহকারী</div><div class="v">${DB.suppliers.length}</div></div>
        <div class="stat"><div class="k">এই মাসের ক্রয়</div><div class="v">${money(C.buildReport(C.monthStart(), C.todayKey()).purchases)}</div></div></div>
      <div class="chips mb3"><button class="chip ${t === 'purchases' ? 'on' : ''}" onclick="Buy.tab('purchases')">ক্রয়ের তালিকা</button><button class="chip ${t === 'suppliers' ? 'on' : ''}" onclick="Buy.tab('suppliers')">সরবরাহকারী</button></div>
      <div class="card" id="buy-list"></div>`;
      const el = $('buy-list');
      if (t === 'purchases') {
        el.innerHTML = DB.purchases.length ? [...DB.purchases].sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 200).map(p => { const s = findSupplier(p.supplierId); return `<div class="row" onclick="Buy.viewPurchase('${p.id}')"><div class="avatar"><i class="fas fa-truck"></i></div><div class="grow"><div class="t">ক্রয় #${p.no} · ${esc(s ? s.name : 'সরবরাহকারী নেই')}</div><div class="s">${C.fmtDT(p.date)} · ${p.items.length} আইটেম</div></div><div class="tr"><div class="fw7">${money(p.total)}</div>${p.due > 0 ? `<span class="badge b-bad">বাকি ${money(p.due)}</span>` : '<span class="badge b-ok">পরিশোধিত</span>'}</div></div>`; }).join('') : '<div class="empty"><i class="fas fa-truck-ramp-box"></i>কোনো ক্রয় নেই</div>';
      } else {
        el.innerHTML = DB.suppliers.length ? DB.suppliers.map(s => { const b = C.supplierBalance(s.id); return `<div class="row" onclick="Buy.supDetail('${s.id}')"><div class="avatar">${ini(s.name)}</div><div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.phone || 'ফোন নেই')}</div></div><div class="tr">${b > 0 ? `<div class="fw7 bad">${money(b)}</div><div class="xs muted">দেনা</div>` : '<span class="badge b-ok">পরিষ্কার</span>'}</div></div>`; }).join('') : '<div class="empty"><i class="fas fa-user-tie"></i>কোনো সরবরাহকারী নেই</div>';
      }
    },
    tab(t) { People.tab = t; this.render(); },
    editSup(id, after) {
      const s = id ? findSupplier(id) : null;
      const m = Modal.open({ title: s ? 'সরবরাহকারী সম্পাদনা' : 'নতুন সরবরাহকারী', body: `
        <div class="field"><label class="label">নাম / কোম্পানি *</label><input id="sf-name" class="input" autofocus value="${esc(s ? s.name : '')}"></div>
        <div class="field"><label class="label">মোবাইল</label><input id="sf-phone" type="tel" class="input" value="${esc(s ? s.phone : '')}"></div>
        <div class="field"><label class="label">ঠিকানা</label><input id="sf-addr" class="input" value="${esc(s ? s.address : '')}"></div>
        <div class="field"><label class="label">প্রারম্ভিক পাওনা (আমরা যা দেব) ৳</label><input id="sf-open" type="number" step="any" class="input" value="${s ? s.openingDue || '' : ''}" placeholder="0"></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-primary" id="sf-ok">সংরক্ষণ</button>` });
      m.querySelector('#sf-ok').onclick = () => {
        const name = $('sf-name').value.trim(); if (!name) { toast('⚠️ নাম দিন'); return; }
        const d = { name, phone: $('sf-phone').value.trim(), address: $('sf-addr').value.trim(), openingDue: num($('sf-open').value) };
        let rid = id; if (s) Object.assign(s, d); else { rid = genId(); DB.suppliers.push(Object.assign({ id: rid, created: new Date().toISOString() }, d)); }
        C.save('suppliers'); Modal.close(m); toast('সংরক্ষিত ✓'); if (after) after(rid); else App.refresh();
      };
    },
    supDetail(id) {
      const s = findSupplier(id); const b = C.supplierBalance(id); const led = C.supplierLedger(id).reverse();
      Modal.open({ title: s.name, size: 'wide', body: `<div class="card pad mb3 tc"><div class="muted xs">সরবরাহকারীকে দেনা</div><div class="xxl fw7 ${b > 0 ? 'bad' : 'ok'}">${money(Math.max(0, b))}</div><div class="xs muted mt1">${esc(s.phone || '')} ${esc(s.address || '')}</div></div>
        <button class="btn btn-primary btn-block mb3" onclick="Buy.pay('${id}')"><i class="fas fa-money-bill-transfer"></i> পরিশোধ করুন</button>
        <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>তারিখ</th><th>বিবরণ</th><th class="r">দেনা +</th><th class="r">পরিশোধ −</th><th class="r">ব্যালেন্স</th></tr></thead><tbody>${led.length ? led.map(r => `<tr><td class="xs">${C.fmtDate(r.date)}</td><td class="sm">${esc(r.desc)}</td><td class="r bad">${r.debit ? money(r.debit) : ''}</td><td class="r ok">${r.credit ? money(r.credit) : ''}</td><td class="r fw6">${money(r.balance)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">লেনদেন নেই</td></tr>'}</tbody></table></div>`,
        foot: `<button class="btn btn-danger-soft" onclick="Buy.delSup('${id}')"><i class="fas fa-trash"></i></button><button class="btn" onclick="Buy.editSup('${id}',()=>{Modal.closeAll();Buy.supDetail('${id}');App.refresh()})"><i class="fas fa-pen"></i> এডিট</button>` });
    },
    pay(id) {
      const s = findSupplier(id); const b = C.supplierBalance(id);
      const m = Modal.open({ title: 'পরিশোধ — ' + s.name, body: `<div class="field"><label class="label">পরিমাণ (৳)</label><input id="sp-amt" type="number" step="any" min="0" class="input" style="font-size:20px;font-weight:700" autofocus value="${b > 0 ? b : ''}"></div>
        <div class="field"><label class="label">মাধ্যম</label><select id="sp-m" class="input"><option value="cash">নগদ</option><option value="mobile">মোবাইল ব্যাংকিং</option><option value="card">কার্ড/ব্যাংক</option></select></div>
        <div class="field"><label class="label">নোট</label><input id="sp-note" class="input"></div>`, foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-primary" id="sp-ok">নিশ্চিত করুন</button>` });
      m.querySelector('#sp-ok').onclick = () => { const a = num($('sp-amt').value); if (a <= 0) { toast('⚠️ সঠিক পরিমাণ দিন'); return; }
        DB.spayments.push({ id: genId(), date: new Date().toISOString(), supplierId: id, amount: r2(a), method: $('sp-m').value, note: $('sp-note').value.trim() }); C.save('spayments'); Modal.closeAll(); toast('পরিশোধ সংরক্ষিত ✓'); App.refresh(); };
    },
    delSup(id) {
      if (DB.purchases.some(p => p.supplierId === id) || DB.spayments.some(p => p.supplierId === id)) { toast('⚠️ লেনদেন থাকায় মুছা যাবে না'); return; }
      askConfirm('এই সরবরাহকারী মুছবেন?', () => { DB.suppliers = DB.suppliers.filter(x => x.id !== id); C.save('suppliers'); Modal.closeAll(); App.refresh(); }, { danger: true, yes: 'মুছুন' });
    },
    // ---- নতুন ক্রয় ----
    newPurchase() {
      if (!DB.products.length) { toast('⚠️ আগে পণ্য যোগ করুন'); return; }
      People.pr = [{ pid: '', qty: 1, cost: 0 }];
      const m = Modal.open({ title: 'নতুন ক্রয় (স্টক ইন)', size: 'wide', static: true, body: `
        <div class="field"><label class="label">সরবরাহকারী</label><div class="flex gap2"><select id="pu-sup" class="input"><option value="">— নির্দিষ্ট নয় —</option>${DB.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="btn btn-soft" onclick="Buy.quickSup()"><i class="fas fa-plus"></i></button></div></div>
        <div id="pu-rows"></div><button class="btn btn-ghost btn-block mb3" onclick="Buy.addRow()"><i class="fas fa-plus"></i> আরেকটি পণ্য</button>
        <div class="card pad-s"><div class="sumrow big" style="border:0;margin:0;padding:0"><span>মোট</span><span class="ptext" id="pu-total">৳0</span></div></div>
        <div class="grid2 mt3"><div class="field"><label class="label">এখন পরিশোধ (৳)</label><input id="pu-paid" type="number" step="any" min="0" class="input" oninput="Buy.puCalc()"></div><div class="field"><label class="label">বাকি থাকছে</label><input id="pu-due" class="input" disabled value="৳0"></div></div>
        <div class="field"><label class="label">নোট</label><input id="pu-note" class="input"></div>`,
        foot: `<button class="btn" onclick="Modal.closeFrom(this)">বাতিল</button><button class="btn btn-primary" onclick="Buy.savePurchase(this)">ক্রয় সংরক্ষণ</button>` });
      this.rows();
    },
    quickSup() { Buy.editSup(null, id => { const sel = $('pu-sup'); if (sel) { sel.innerHTML += `<option value="${id}">${esc(findSupplier(id).name)}</option>`; sel.value = id; } }); },
    rows() {
      const el = $('pu-rows'); if (!el) return;
      el.innerHTML = People.pr.map((r, i) => `<div class="card pad-s mb2"><div class="flex gap2 mb2"><select class="input grow" onchange="Buy.selP(${i},this.value)"><option value="">পণ্য বাছাই...</option>${DB.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'bn')).map(p => `<option value="${p.id}" ${r.pid === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="icon-btn" onclick="Buy.delRow(${i})"><i class="fas fa-xmark bad"></i></button></div>
        <div class="grid2"><div><label class="label">পরিমাণ</label><input type="number" step="any" min="0" class="input" value="${r.qty}" oninput="Buy.setR(${i},'qty',this.value)"></div><div><label class="label">একক ক্রয়মূল্য</label><input type="number" step="any" min="0" class="input" value="${r.cost}" oninput="Buy.setR(${i},'cost',this.value)"></div></div></div>`).join('');
      this.puCalc();
    },
    addRow() { People.pr.push({ pid: '', qty: 1, cost: 0 }); this.rows(); },
    delRow(i) { if (People.pr.length > 1) People.pr.splice(i, 1); else People.pr[0] = { pid: '', qty: 1, cost: 0 }; this.rows(); },
    selP(i, pid) { People.pr[i].pid = pid; const p = findProduct(pid); if (p) People.pr[i].cost = p.cost || 0; this.rows(); },
    setR(i, k, v) { People.pr[i][k] = num(v); this.puCalc(); },
    puTotal() { return r2(People.pr.reduce((s, r) => s + num(r.qty) * num(r.cost), 0)); },
    puCalc() { const t = this.puTotal(); const e = $('pu-total'); if (!e) return; e.textContent = money(t); const paid = Math.min(Math.max(0, num($('pu-paid').value)), t); $('pu-due').value = money(Math.max(0, r2(t - paid))); },
    savePurchase(btn) {
      const rows = People.pr.filter(r => r.pid && num(r.qty) > 0);
      if (!rows.length) { toast('⚠️ অন্তত একটি পণ্য ও পরিমাণ দিন'); return; }
      const total = r2(rows.reduce((s, r) => s + r.qty * r.cost, 0)); const paid = Math.min(Math.max(0, num($('pu-paid').value)), total); const due = r2(total - paid);
      const sup = $('pu-sup').value; if (due > 0 && !sup) { toast('⚠️ বাকি রাখতে সরবরাহকারী বাছাই করুন'); return; }
      rows.forEach(r => { const p = findProduct(r.pid); if (p) { if (p.track !== false) p.stock = r2(num(p.stock) + r.qty); if (r.cost > 0) p.cost = r.cost; } });
      const no = DB.purchases.length ? Math.max.apply(null, DB.purchases.map(p => p.no || 0)) + 1 : 1;
      DB.purchases.push({ id: genId(), no, date: new Date().toISOString(), supplierId: sup || null, items: rows.map(r => ({ id: r.pid, name: findProduct(r.pid).name, qty: r.qty, cost: r.cost })), total, paid, due, note: $('pu-note').value.trim() });
      C.save('products'); C.save('purchases'); Modal.closeFrom(btn); toast('ক্রয় সংরক্ষিত, স্টক বেড়েছে ✓'); App.refresh();
    },
    viewPurchase(id) {
      const p = DB.purchases.find(x => x.id === id); if (!p) return; const s = findSupplier(p.supplierId);
      Modal.open({ title: 'ক্রয় #' + p.no, body: `<div class="kv"><span class="muted">সরবরাহকারী</span><b>${esc(s ? s.name : '—')}</b></div><div class="kv"><span class="muted">তারিখ</span><span>${C.fmtDT(p.date)}</span></div>
        ${p.items.map(i => `<div class="kv"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.qty * i.cost)}</span></div>`).join('')}
        <div class="kv"><b>মোট</b><b>${money(p.total)}</b></div><div class="kv"><span class="muted">পরিশোধ</span><span class="ok">${money(p.paid)}</span></div><div class="kv"><span class="muted">বাকি</span><span class="bad">${money(p.due)}</span></div>${p.note ? `<p class="xs muted mt2">নোট: ${esc(p.note)}</p>` : ''}`,
        foot: `<button class="btn btn-danger-soft" onclick="Buy.delPurchase('${id}')"><i class="fas fa-trash"></i> বাতিল করুন</button>` });
    },
    delPurchase(id) {
      askConfirm('এই ক্রয় বাতিল করলে স্টক থেকে ক্রয়ের পরিমাণ কমে যাবে এবং সরবরাহকারীর হিসাব ঠিক হয়ে যাবে। নিশ্চিত?', () => {
        const p = DB.purchases.find(x => x.id === id); if (!p) return;
        p.items.forEach(i => { const pr = findProduct(i.id); if (pr && pr.track !== false) pr.stock = Math.max(0, r2(pr.stock - i.qty)); });
        DB.purchases = DB.purchases.filter(x => x.id !== id); C.save('products'); C.save('purchases'); Modal.closeAll(); toast('ক্রয় বাতিল হয়েছে'); App.refresh();
      }, { danger: true, yes: 'হ্যাঁ, বাতিল', title: 'ক্রয় বাতিল?' });
    }
  };
  App.Views.purchases = { render: () => Buy.render() };
})();
