// IndexedDB layer. Stores: products, invoices, holds (draft bills), moves (stock history), meta (counters).
const STORES=['products','invoices','holds','moves','meta'];let dbp;
export const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
export function open(){return dbp||(dbp=new Promise((ok,no)=>{const r=indexedDB.open('ledgerly',1);
r.onupgradeneeded=()=>{for(const s of STORES)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:s==='meta'?'k':'id'})};
r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}))}
const st=async(s,m='readonly')=>(await open()).transaction(s,m).objectStore(s);
export const all=async s=>req((await st(s)).getAll());
export const get=async(s,k)=>req((await st(s)).get(k));
export const put=async(s,v)=>req((await st(s,'readwrite')).put(v));
export const del=async(s,k)=>req((await st(s,'readwrite')).delete(k));
// Atomic multi-store transaction: any thrown error aborts every write.
export async function tx(stores,fn){const d=await open();return new Promise((ok,no)=>{const t=d.transaction(stores,'readwrite');
const o=Object.fromEntries(stores.map(s=>[s,t.objectStore(s)]));let out;
Promise.resolve(fn(o)).then(v=>{out=v}).catch(e=>{try{t.abort()}catch{}no(e)});
t.oncomplete=()=>ok(out);t.onabort=()=>no(t.error||new Error('Transaction aborted'))})}
