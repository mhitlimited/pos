import * as db from './db.js';import {esc,money,r2,$,uid,toast} from './ui.js';
let list=[],q='';
export async function render(root){list=await db.all('products');
root.innerHTML=`<h1>Products</h1><div class="row card"><input class="grow" id="pq" placeholder="Search name, SKU, barcode" type="search"><button class="btn" id="add">Add product</button><button class="btn alt" id="csv">Export CSV</button></div><div class="card wrap" id="pl" style="margin-top:12px"></div><dialog id="dlg"></dialog>`;
$('#pq').oninput=e=>{q=e.target.value.toLowerCase();rows()};$('#add').onclick=()=>form();
$('#csv').onclick=exportCsv;$('#pl').onclick=async e=>{const b=e.target.closest('[data-e]');if(!b)return;const p=list.find(x=>x.id===b.dataset.id);
if(b.dataset.e==='edit')form(p);else if(confirm(`Delete "${p.name}"? Past invoices keep their records.`)){await db.del('products',p.id);toast('Product deleted');render(root)}};rows()}
function rows(){const f=list.filter(p=>[p.name,p.sku,p.barcode,p.category].join(' ').toLowerCase().includes(q));
$('#pl').innerHTML=f.length?`<table class="tbl"><tr><th>Name<th>SKU<th>Category<th class="n">Price<th class="n">Stock<th></tr>${f.map(p=>`<tr><td>${esc(p.name)}<td>${esc(p.sku)}<td>${esc(p.category)}<td class="n">${money(p.price)}<td class="n ${p.stock<=p.min?'low':''}">${p.stock} ${esc(p.unit)}${p.stock<=p.min?' (low)':''}<td class="n"><button class="btn alt" data-e="edit" data-id="${p.id}">Edit</button> <button class="btn alt" data-e="del" data-id="${p.id}">Delete</button></tr>`).join('')}</table>`:`<div class="empty">${list.length?'No products match your search.':'No products yet. Add your first product to start selling.'}</div>`}
function form(p){const d=$('#dlg'),n=!p;p=p||{name:'',sku:'',barcode:'',category:'',unit:'pcs',cost:0,price:0,stock:0,min:5};
d.innerHTML=`<form method="dialog"><h1>${n?'Add product':'Edit product'}</h1><label>Name<input name="name" required value="${esc(p.name)}"></label>
<div class="g2"><label>SKU<input name="sku" required value="${esc(p.sku)}"></label><label>Barcode<input name="barcode" value="${esc(p.barcode)}"></label>
<label>Category<input name="category" value="${esc(p.category)}"></label><label>Unit<select name="unit">${['pcs','kg','g','l','box'].map(u=>`<option ${u===p.unit?'selected':''}>${u}</option>`).join('')}</select></label>
<label>Purchase price<input name="cost" type="number" min="0" step="0.01" required value="${p.cost}"></label><label>Sale price<input name="price" type="number" min="0" step="0.01" required value="${p.price}"></label>
<label>Stock<input name="stock" type="number" min="0" step="any" required value="${p.stock}"></label><label>Low-stock alert at<input name="min" type="number" min="0" step="any" value="${p.min}"></label></div>
<div class="row"><button class="btn" value="ok">Save product</button><button class="btn alt" value="x" formnovalidate>Cancel</button></div></form>`;
d.showModal();d.querySelector('form').onsubmit=async e=>{if(e.submitter?.value!=='ok')return;e.preventDefault();
const f=Object.fromEntries(new FormData(e.target));const sku=f.sku.trim();
if(list.some(x=>x.sku.toLowerCase()===sku.toLowerCase()&&x.id!==p.id))return toast('SKU already exists',1);
const old=n?0:p.stock;const np={...p,id:p.id||uid(),name:f.name.trim(),sku,barcode:f.barcode.trim(),category:f.category.trim(),unit:f.unit,cost:r2(f.cost),price:r2(f.price),stock:+f.stock,min:+f.min||0};
await db.tx(['products','moves'],async s=>{s.products.put(np);if(np.stock!==old)s.moves.put({id:uid(),pid:np.id,name:np.name,qty:r2(np.stock-old),type:n?'opening':'adjust',at:Date.now()})});
d.close();toast('Product saved');render($('#view'))}}
function exportCsv(){const h=['name','sku','barcode','category','unit','cost','price','stock'];
const c=[h.join(','),...list.map(p=>h.map(k=>`"${String(p[k]).replace(/"/g,'""')}"`).join(','))].join('\n');
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:'text/csv'}));a.download='products.csv';a.click()}
