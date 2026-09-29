import {$} from './ui.js';import * as pos from './pos.js';import * as products from './products.js';import * as invoices from './invoices.js';
const routes={sell:pos,products,invoices};
async function route(){const k=location.hash.slice(2)||'sell',v=$('#view');v.onclick=null;
document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('on',a.hash==='#/'+k));
try{await (routes[k]||pos).render(v)}catch(e){v.innerHTML=`<div class="card">Something went wrong: ${e.message}. Reload the page; your saved data is not affected.</div>`}}
addEventListener('hashchange',route);route();
let ip;addEventListener('beforeinstallprompt',e=>{e.preventDefault();ip=e;$('#install').hidden=false});
$('#install').onclick=async()=>{ip.prompt();await ip.userChoice;$('#install').hidden=true};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').then(r=>{r.addEventListener('updatefound',()=>{const w=r.installing;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller&&confirm('A new version is ready. Reload now?')){w.postMessage('skip');location.reload()}})})});
