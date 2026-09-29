import * as db from './db.js';import {esc,money,r2,$,uid,toast,CFG} from './ui.js';import {printInvoice} from './invoices.js';
const blank=()=>({id:uid(),lines:[],disc:0,tax:CFG.tax,method:'cash',paid:null,customer:''});
let cart=blank(),prods=[],q='',busy=false;
export const totals=c=>{const sub=r2(c.lines.reduce((s,l)=>s+l.qty*l.price,0));const d=r2(sub*Math.min(100,Math.max(0,c.disc))/100);const tax=r2((sub-d)*Math.max(0,c.tax)/100);return{sub,d,tax,total:r2(sub-d+tax)}};
const paidOf=(c,t)=>c.paid!=null?c.paid:c.method==='credit'?0:t.total;
export async function render(root){prods=await db.all('products');
root.innerHTML=`<h1>Sell</h1><div class="pos"><section><input id="q" type="search" placeholder="Search name, SKU or scan barcode, then press Enter" autofocus><div class="results" id="res"></div></section><aside class="card" id="cart"></aside></div><dialog id="dlg"></dialog>`;
const inp=$('#q');inp.oninput=()=>{q=inp.value.toLowerCase();res()};
inp.onkeydown=e=>{if(e.key!=='Enter')return;const m=prods.filter(p=>p.barcode===inp.value.trim()||p.sku.toLowerCase()===q);const one=m.length===1?m[0]:res(true);if(one){add(one);inp.value='';q='';res()}};
$('#res').onclick=e=>{const b=e.target.closest('[data-add]');if(b)add(prods.find(p=>p.id===b.dataset.add))};
$('#cart').onclick=act;$('#cart').onchange=chg;res();draw()}
function res(first){const f=prods.filter(p=>!q||[p.name,p.sku,p.barcode,p.category].join(' ').toLowerCase().includes(q));
if(first)return f.length===1?f[0]:null;
$('#res').innerHTML=f.length?f.slice(0,60).map(p=>`<button class="item ${p.stock<=0?'out':''}" data-add="${p.id}">${esc(p.name)}<small>${money(p.price)} · ${p.stock} ${esc(p.unit)}</small></button>`).join(''):`<div class="empty">${prods.length?'No matching products.':'No products yet. Add products first, then come back to sell.'}</div>`}
function add(p){if(!p)return;const l=cart.lines.find(x=>x.pid===p.id);const n=(l?l.qty:0)+1;
if(n>p.stock)return toast(`Only ${p.stock} ${p.unit} of ${p.name} in stock`,1);
l?l.qty=n:cart.lines.push({pid:p.id,name:p.name,price:p.price,qty:1,unit:p.unit});draw()}
async function draw(){const t=totals(cart),paid=paidOf(cart,t),held=(await db.all('holds')).length;
$('#cart').innerHTML=`<div class="row"><b class="grow">Current bill</b><button class="btn alt" data-a="held">Held (${held})</button></div>
${cart.lines.length?`<table class="tbl">${cart.lines.map((l,i)=>`<tr><td>${esc(l.name)}<br><small>${money(l.price)}</small><td style="width:80px"><input type="number" min="0" step="any" value="${l.qty}" data-f="qty" data-i="${i}" aria-label="Quantity"><td class="n">${money(l.qty*l.price)}<td><button class="btn alt" data-a="rm" data-i="${i}" aria-label="Remove">×</button></tr>`).join('')}</table>`:'<div class="empty">Tap a product to add it to the bill.</div>'}
<div class="g2"><label>Discount %<input type="number" min="0" max="100" step="any" value="${cart.disc}" data-f="disc"></label><label>Tax %<input type="number" min="0" step="any" value="${cart.tax}" data-f="tax"></label>
<label>Payment<select data-f="method">${['cash','card','mobile','credit'].map(m=>`<option ${m===cart.method?'selected':''}>${m}</option>`).join('')}</select></label><label>Amount paid<input type="number" min="0" step="0.01" value="${paid}" data-f="paid"></label></div>
<label>Customer (optional)<input value="${esc(cart.customer)}" data-f="customer"></label>
<div style="margin-top:8px"><div class="tot"><span>Subtotal</span><span>${money(t.sub)}</span></div><div class="tot"><span>Discount</span><span>−${money(t.d)}</span></div><div class="tot"><span>Tax</span><span>${money(t.tax)}</span></div><div class="tot big"><span>Total</span><span>${money(t.total)}</span></div>
<div class="tot ${t.total-paid>0?'low':''}"><span>Balance due</span><span>${money(t.total-paid)}</span></div></div>
<div class="row" style="margin-top:8px"><button class="btn grow" data-a="pay" ${busy||!cart.lines.length?'disabled':''}>Complete sale</button><button class="btn alt" data-a="hold" ${cart.lines.length?'':'disabled'}>Hold</button><button class="btn alt" data-a="clear">Clear</button></div>`}
function chg(e){const f=e.target.dataset.f;if(!f)return;const v=e.target.value;
if(f==='qty'){const l=cart.lines[+e.target.dataset.i],p=prods.find(x=>x.id===l.pid),n=+v;if(!(n>0))cart.lines.splice(+e.target.dataset.i,1);else if(p&&n>p.stock)toast(`Only ${p.stock} ${p.unit} in stock`,1);else l.qty=n}
else if(f==='method'){cart.method=v;cart.paid=null}else if(f==='customer')cart.customer=v.trim();
else if(f==='paid')cart.paid=Math.max(0,r2(v));else cart[f]=Math.max(0,+v||0);draw()}
async function act(e){const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
if(a==='rm'){cart.lines.splice(+b.dataset.i,1);draw()}else if(a==='clear'){if(!cart.lines.length||confirm('Discard this bill?')){cart=blank();draw()}}
else if(a==='hold'){await db.put('holds',{...cart,at:Date.now()});cart=blank();toast('Bill held');draw()}
else if(a==='held')held();else if(a==='pay')pay()}
async function held(){const h=await db.all('holds'),d=$('#dlg');d.innerHTML=`<h1>Held bills</h1>${h.length?h.map(x=>`<div class="row card" style="margin-bottom:6px"><span class="grow">${new Date(x.at).toLocaleTimeString()} · ${x.lines.length} items · ${money(totals(x).total)}</span><button class="btn" data-r="${x.id}">Resume</button><button class="btn alt" data-d="${x.id}">Delete</button></div>`).join(''):'<div class="empty">No held bills.</div>'}<button class="btn alt" id="cl">Close</button>`;
d.showModal();$('#cl').onclick=()=>d.close();d.onclick=async e=>{const r=e.target.dataset.r,x=e.target.dataset.d;
if(r){cart=h.find(y=>y.id===r);await db.del('holds',r);d.close();draw()}else if(x){await db.del('holds',x);d.close();held();draw()}}}
async function pay(){if(busy||!cart.lines.length)return;const t=totals(cart),paid=paidOf(cart,t);
if(paid>t.total)return toast('Amount paid cannot exceed the total',1);busy=true;draw();
try{const inv=await db.tx(['products','invoices','moves','meta'],async s=>{
const ex=await db.req(s.invoices.get(cart.id));if(ex)return ex; // same bill id can never create a second invoice
const seq=((await db.req(s.meta.get('seq')))?.v||0)+1;s.meta.put({k:'seq',v:seq});
for(const l of cart.lines){const p=await db.req(s.products.get(l.pid));if(!p||p.stock<l.qty)throw new Error(`Not enough stock for ${l.name}`);
p.stock=r2(p.stock-l.qty);s.products.put(p);s.moves.put({id:uid(),pid:p.id,name:p.name,qty:-l.qty,type:'sale',ref:cart.id,at:Date.now()})}
const inv={id:cart.id,no:'INV-'+String(seq).padStart(5,'0'),at:Date.now(),lines:cart.lines,...t,discPct:cart.disc,taxPct:cart.tax,method:cart.method,paid,due:r2(t.total-paid),customer:cart.customer,status:'active'};
s.invoices.put(inv);return inv});
await db.del('holds',cart.id);cart=blank();prods=await db.all('products');toast('Sale completed: '+inv.no);res();busy=false;await draw();printInvoice(inv)}
catch(err){busy=false;draw();toast(err.message,1)}}
