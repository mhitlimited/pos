const V='ledgerly-v1',FILES=['./','index.html','manifest.json','css/main.css','js/app.js','js/db.js','js/ui.js','js/products.js','js/pos.js','js/invoices.js','assets/icons/icon.svg','assets/icons/icon-192.png','assets/icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).catch(()=>caches.match('index.html'))))});
