export const CFG={name:'My Shop',cur:'৳',tax:0,footer:'Thank you for your purchase.'};
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const r2=n=>Math.round((+n+Number.EPSILON)*100)/100;
export const money=n=>CFG.cur+r2(n).toFixed(2);
export const $=(s,r=document)=>r.querySelector(s);
export const uid=()=>crypto.randomUUID();
export function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='show'+(bad?' bad':'');clearTimeout(t._t);t._t=setTimeout(()=>t.className='',2800)}
