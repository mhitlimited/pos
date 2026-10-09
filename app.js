// ===== SAFE STORAGE =====
const DEFAULT_SETTINGS = {shopName:"আমার দোকান",shopAddress:"",shopPhone:"",defaultTax:0};
function safeLoad(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const val = JSON.parse(raw);
        return (val === null || typeof val !== typeof fallback) ? fallback : val;
    } catch (e) {
        console.error('ডেটা পড়া যায়নি:', key, e);
        try { localStorage.setItem(key + '_corrupt_' + Date.now(), localStorage.getItem(key)); } catch (_) {}
        return fallback;
    }
}
function safeSave(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        if (key !== 'propos_cart') localStorage.setItem('propos_dirty', '1'); // ব্যাকআপ বাকি
        return true;
    } catch (e) {
        console.error('সেভ ব্যর্থ:', key, e);
        toast('⚠️ ডেটা সেভ হয়নি! স্টোরেজ ভরে গেছে — ব্যাকআপ নিয়ে পুরনো ডেটা/ছবি কমান');
        return false;
    }
}
function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// DATA
let products = safeLoad('propos_products', []);
let sales = safeLoad('propos_sales', []);
let cart = safeLoad('propos_cart', []);
let settings = Object.assign({}, DEFAULT_SETTINGS, safeLoad('propos_settings', {}));
let currentCategory = 'all';
let paymentMethod = 'cash';
let editingProductId = null;
let currentImageBase64 = null;
let currentSaleForPrint = null;

// Bluetooth
let btDevice = null;
let btCharacteristic = null;
let isBtConnected = false;

// INIT
document.addEventListener('DOMContentLoaded', () => {
    loadSettingsToUI();
    renderProducts();
    renderCart();
    updateCategoryFilters();
    showView('pos');
    checkBtSupport();
    closeMobileCart();
    backupReminder();
});

// NAV
function showView(view) {
    document.body.dataset.view = view;
    ['product-modal','checkout-modal','receipt-modal'].forEach(id => {
        const m = document.getElementById(id); if (m) m.classList.add('hidden');
    });
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + view).classList.remove('hidden');
    
    document.querySelectorAll('.sidebar-link').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.add('text-slate-600');
    });
    const active = document.querySelector(`.sidebar-link[data-view="${view}"]`);
    if (active) {
        active.classList.add('active');
        active.classList.remove('text-slate-600');
    }
    
    if (view === 'products') renderProductsTable();
    if (view === 'history') renderHistory();
    if (view === 'dashboard') renderDashboard();
    if (view === 'settings') loadSettingsToUI();
    
    closeMobileCart();
}

function closeMobileNavIfOpen() {
    const nav = document.getElementById('mobile-nav');
    if (nav && nav.classList.contains('open')) toggleMobileNav();
}

function toggleMobileNav() {
    const nav = document.getElementById('mobile-nav');
    const overlay = document.getElementById('mobile-nav-overlay');
    if (nav.style.transform === 'translateX(0px)' || nav.classList.contains('open')) {
        nav.style.transform = 'translateX(-100%)';
        nav.classList.remove('open');
        overlay.classList.add('hidden');
    } else {
        nav.style.transform = 'translateX(0)';
        nav.classList.add('open');
        overlay.classList.remove('hidden');
    }
}

// PRODUCTS
function renderProducts() {
    const grid = document.getElementById('product-grid');
    const noProducts = document.getElementById('no-products');
    const search = (document.getElementById('search-input').value || '').toLowerCase();
    
    let filtered = products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search) || 
                           (p.barcode && p.barcode.includes(search)) ||
                           (p.category && p.category.toLowerCase().includes(search));
        const matchCat = currentCategory === 'all' || p.category === currentCategory;
        return matchSearch && matchCat;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = '';
        noProducts.classList.remove('hidden');
        return;
    }
    noProducts.classList.add('hidden');
    
    grid.innerHTML = filtered.map(p => {
        const isLow = p.stock <= (p.minStock || 5);
        const imgHtml = p.image 
            ? `<img src="${p.image}" class="w-full h-full object-cover" alt="">`
            : `<i class="fas fa-box text-2xl text-primary-300"></i>`;
        
        return `
        <div class="product-card bg-white rounded-2xl border border-slate-100 p-3 cursor-pointer shadow-sm" onclick="addToCart('${p.id}')">
            <div class="bg-gradient-to-br from-slate-50 to-primary-50 rounded-xl h-24 sm:h-28 flex items-center justify-center mb-2.5 overflow-hidden relative">
                ${imgHtml}
                ${isLow ? '<span class="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">কম স্টক</span>' : ''}
            </div>
            <h3 class="font-medium text-sm text-slate-800 truncate leading-tight">${esc(p.name)}</h3>
            <div class="flex justify-between items-center mt-1.5">
                <span class="text-primary-600 font-bold text-sm">৳${fmt(p.price)}</span>
                <span class="text-xs ${isLow ? 'text-red-500 font-medium' : 'text-slate-400'}">${p.stock} ${esc(p.unit||'')}</span>
            </div>
        </div>`;
    }).join('');
}

function filterProducts() { renderProducts(); }

function updateCategoryFilters() {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    const container = document.getElementById('category-filters');
    
    let html = `<button onclick="setCategory('all')" class="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${currentCategory==='all'?'bg-primary-600 text-white shadow-md shadow-primary-500/30':'bg-slate-100 text-slate-600 hover:bg-slate-200'}">সব</button>`;
    cats.forEach(cat => {
        html += `<button onclick="setCategory('${cat}')" class="whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${currentCategory===cat?'bg-primary-600 text-white shadow-md shadow-primary-500/30':'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${cat}</button>`;
    });
    container.innerHTML = html;
    document.getElementById('category-list').innerHTML = cats.map(c => `<option value="${c}">`).join('');
}

function setCategory(cat) {
    currentCategory = cat;
    updateCategoryFilters();
    renderProducts();
}

function openProductModal(id = null) {
    editingProductId = id;
    currentImageBase64 = null;
    const title = document.getElementById('product-modal-title');
    const preview = document.getElementById('product-image-preview');
    
    if (id) {
        const p = products.find(x => x.id === id);
        title.textContent = 'পণ্য সম্পাদনা';
        document.getElementById('product-id').value = p.id;
        document.getElementById('product-name').value = p.name;
        document.getElementById('product-barcode').value = p.barcode || '';
        document.getElementById('product-category').value = p.category || '';
        document.getElementById('product-cost').value = p.cost || '';
        document.getElementById('product-price').value = p.price;
        document.getElementById('product-stock').value = p.stock;
        document.getElementById('product-min-stock').value = p.minStock || 5;
        document.getElementById('product-unit').value = p.unit || 'পিস';
        if (p.image) {
            currentImageBase64 = p.image;
            preview.innerHTML = `<img src="${p.image}" class="w-full h-full object-cover">`;
        } else {
            preview.innerHTML = `<i class="fas fa-image text-slate-300 text-xl"></i>`;
        }
    } else {
        title.textContent = 'নতুন পণ্য যোগ করুন';
        document.getElementById('product-form').reset();
        document.getElementById('product-id').value = '';
        document.getElementById('product-min-stock').value = 5;
        preview.innerHTML = `<i class="fas fa-image text-slate-300 text-xl"></i>`;
    }
    document.getElementById('product-modal').classList.remove('hidden');
}

function closeProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
    editingProductId = null;
    currentImageBase64 = null;
}

function previewImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('শুধু ছবি ফাইল দিন'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            // ছবি ছোট করে (সর্বোচ্চ 400px) সংরক্ষণ — স্টোরেজ বাঁচাতে
            const max = 400;
            const ratio = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * ratio);
            c.height = Math.round(img.height * ratio);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            currentImageBase64 = c.toDataURL('image/jpeg', 0.75);
            document.getElementById('product-image-preview').innerHTML = `<img src="${currentImageBase64}" class="w-full h-full object-cover">`;
        };
        img.onerror = () => toast('ছবি পড়া যায়নি');
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('product-id').value || genId();
    
    const product = {
        id,
        name: document.getElementById('product-name').value.trim(),
        barcode: document.getElementById('product-barcode').value.trim(),
        category: document.getElementById('product-category').value.trim(),
        cost: parseFloat(document.getElementById('product-cost').value) || 0,
        price: parseFloat(document.getElementById('product-price').value),
        stock: parseInt(document.getElementById('product-stock').value),
        minStock: parseInt(document.getElementById('product-min-stock').value) || 5,
        unit: document.getElementById('product-unit').value,
        image: currentImageBase64 || (editingProductId ? (products.find(p=>p.id===editingProductId)||{}).image : null)
    };
    
    if (editingProductId) {
        const idx = products.findIndex(p => p.id === editingProductId);
        products[idx] = product;
        toast('পণ্য আপডেট হয়েছে ✓');
    } else {
        products.push(product);
        toast('নতুন পণ্য যোগ হয়েছে ✓');
    }
    
    saveProducts();
    closeProductModal();
    renderProducts();
    renderProductsTable();
    updateCategoryFilters();
}

function deleteProduct(id) {
    const pr = products.find(x => x.id === id);
    askConfirm(`"${pr ? pr.name : 'এই পণ্য'}" মুছে ফেলবেন? এটি আর ফেরানো যাবে না।`, () => doDeleteProduct(id), {title:'পণ্য মুছবেন?', yes:'হ্যাঁ, মুছুন', danger:true});
}
function doDeleteProduct(id) {
    products = products.filter(p => p.id !== id);
    cart = cart.filter(c => c.id !== id);
    saveProducts();
    saveCart();
    renderProducts();
    renderProductsTable();
    renderCart();
    updateCategoryFilters();
    toast('পণ্য মুছে ফেলা হয়েছে');
}

function renderProductsTable() {
    const tbody = document.getElementById('products-table');
    const noData = document.getElementById('no-products-table');
    const search = (document.getElementById('product-search')?.value || '').toLowerCase();
    
    let filtered = products;
    if (search) {
        filtered = products.filter(p => 
            p.name.toLowerCase().includes(search) || 
            (p.barcode && p.barcode.includes(search)) ||
            (p.category && p.category.toLowerCase().includes(search))
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        noData.classList.remove('hidden');
        return;
    }
    noData.classList.add('hidden');
    
    tbody.innerHTML = filtered.map(p => {
        const isLow = p.stock <= (p.minStock || 5);
        const img = p.image 
            ? `<img src="${p.image}" class="w-9 h-9 rounded-lg object-cover">`
            : `<div class="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center"><i class="fas fa-box text-primary-400 text-xs"></i></div>`;
        
        return `
        <tr class="hover:bg-slate-50/80 transition">
            <td class="p-4">
                <div class="flex items-center gap-3">
                    ${img}
                    <span class="font-medium text-slate-800">${esc(p.name)}</span>
                </div>
            </td>
            <td class="p-4 text-slate-500 font-mono text-xs">${esc(p.barcode || '—')}</td>
            <td class="p-4"><span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-md">${esc(p.category || '—')}</span></td>
            <td class="p-4 text-right text-slate-500">৳${fmt(p.cost||0)}</td>
            <td class="p-4 text-right font-semibold text-slate-800">৳${fmt(p.price)}</td>
            <td class="p-4 text-right ${isLow?'text-red-500 font-semibold':'text-slate-600'}">${p.stock} ${esc(p.unit||'')}</td>
            <td class="p-4 text-center">
                <button onclick="openProductModal('${p.id}')" class="text-primary-600 hover:bg-primary-50 p-2 rounded-lg transition"><i class="fas fa-pen text-xs"></i></button>
                <button onclick="deleteProduct('${p.id}')" class="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><i class="fas fa-trash text-xs"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// CART
function addToCart(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (product.stock <= 0) { toast('স্টক নেই!'); return; }
    
    const existing = cart.find(c => c.id === id);
    if (existing) {
        if (existing.qty >= product.stock) { toast('স্টক অপর্যাপ্ত!'); return; }
        existing.qty++;
    } else {
        cart.push({ id: product.id, name: product.name, price: product.price, qty: 1, unit: product.unit });
    }
    saveCart();
    renderCart();
    toast(product.name + ' যোগ হয়েছে');
}

function updateQty(id, delta) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    const product = products.find(p => p.id === id);
    const newQty = item.qty + delta;
    
    if (newQty <= 0) cart = cart.filter(c => c.id !== id);
    else if (product && newQty > product.stock) { toast('স্টক অপর্যাপ্ত!'); return; }
    else item.qty = newQty;
    
    saveCart();
    renderCart();
}

function removeFromCart(id) {
    cart = cart.filter(c => c.id !== id);
    saveCart();
    renderCart();
}

function clearCart() {
    if (cart.length === 0) return;
    if (!confirm('কার্ট খালি করতে চান?')) return;
    cart = [];
    saveCart();
    renderCart();
    toast('কার্ট খালি করা হয়েছে');
}

function renderCart() {
    const containers = [document.getElementById('cart-items'), document.getElementById('mobile-cart-items')];
    const badge = document.getElementById('cart-badge');
    const totalItems = cart.reduce((s, c) => s + c.qty, 0);
    
    document.getElementById('cart-count-desk').textContent = totalItems;
    
    if (totalItems > 0) {
        badge.textContent = totalItems;
        badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
    
    if (cart.length === 0) {
        containers.forEach(c => c.innerHTML = '<div class="text-center py-10 text-slate-300 text-sm">কার্ট খালি</div>');
    } else {
        const html = cart.map(item => `
            <div class="cart-item flex items-center gap-2.5 bg-slate-50 rounded-xl p-2.5">
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm text-slate-800 truncate">${esc(item.name)}</div>
                    <div class="text-xs text-slate-400">৳${fmt(item.price)} × ${item.qty}</div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="updateQty('${item.id}',-1)" class="w-7 h-7 bg-white border border-slate-200 rounded-lg text-sm font-bold hover:bg-slate-100 transition">−</button>
                    <span class="w-6 text-center text-sm font-semibold">${item.qty}</span>
                    <button onclick="updateQty('${item.id}',1)" class="w-7 h-7 bg-white border border-slate-200 rounded-lg text-sm font-bold hover:bg-slate-100 transition">+</button>
                </div>
                <div class="text-sm font-bold text-primary-600 w-14 text-right">৳${fmt(item.price*item.qty)}</div>
                <button onclick="removeFromCart('${item.id}')" class="text-slate-300 hover:text-red-500 p-1 transition"><i class="fas fa-times text-xs"></i></button>
            </div>
        `).join('');
        containers.forEach(c => c.innerHTML = html);
    }
    updateTotals();
}

function updateTotals() {
    const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const discountVal = parseFloat(document.getElementById('discount-input').value) || 0;
    const discountType = document.getElementById('discount-type').value;
    const taxVal = parseFloat(document.getElementById('tax-input').value) || 0;
    
    let discount = discountType === 'percent' ? subtotal * (discountVal / 100) : discountVal;
    discount = Math.min(discount, subtotal);
    const afterDiscount = subtotal - discount;
    const tax = afterDiscount * (taxVal / 100);
    const total = afterDiscount + tax;
    
    document.getElementById('subtotal').textContent = '৳' + fmt(subtotal);
    document.getElementById('grand-total').textContent = '৳' + fmt(total);
    document.getElementById('checkout-btn').disabled = cart.length === 0;
    
    document.getElementById('mobile-subtotal').textContent = '৳' + fmt(subtotal);
    document.getElementById('mobile-grand-total').textContent = '৳' + fmt(total);
    document.getElementById('mobile-checkout-btn').disabled = cart.length === 0;
    
    return { subtotal, discount, tax, total };
}

function syncDiscount(el) { document.getElementById('discount-input').value = el.value; updateTotals(); }
function syncDiscountType(el) { document.getElementById('discount-type').value = el.value; updateTotals(); }
function syncTax(el) { document.getElementById('tax-input').value = el.value; updateTotals(); }

function toggleCart() {
    document.getElementById('mobile-cart').classList.toggle('open');
    document.getElementById('cart-overlay').classList.toggle('hidden');
}
function closeMobileCart() {
    document.getElementById('mobile-cart').classList.remove('open');
    document.getElementById('cart-overlay').classList.add('hidden');
}

// CHECKOUT
function openCheckout() {
    if (cart.length === 0) return;
    const { total } = updateTotals();
    document.getElementById('checkout-total').textContent = '৳' + fmt(total);
    document.getElementById('cash-received').value = Math.ceil(total);
    document.getElementById('sale-note').value = '';
    selectPayment('cash');
    calculateChange();
    document.getElementById('checkout-modal').classList.remove('hidden');
    closeMobileCart();
}

function closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); }

function selectPayment(method) {
    paymentMethod = method;
    document.querySelectorAll('.payment-btn').forEach(btn => {
        btn.classList.remove('border-primary-500', 'bg-primary-50', 'text-primary-700');
        btn.classList.add('border-slate-200');
    });
    const active = document.getElementById('pay-' + method);
    active.classList.add('border-primary-500', 'bg-primary-50', 'text-primary-700');
    active.classList.remove('border-slate-200');
    document.getElementById('cash-section').style.display = method === 'cash' ? 'block' : 'none';
}

function calculateChange() {
    const { total } = updateTotals();
    const received = parseFloat(document.getElementById('cash-received').value) || 0;
    const change = received - total;
    const el = document.getElementById('change-amount');
    el.textContent = '৳' + fmt(Math.max(0, change));
    el.className = 'font-bold ' + (change >= 0 ? 'text-emerald-600' : 'text-red-500');
}

function completeSale() {
    const { subtotal, discount, tax, total } = updateTotals();
    
    if (paymentMethod === 'cash') {
        const received = parseFloat(document.getElementById('cash-received').value) || 0;
        if (received < total) { toast('পর্যাপ্ত টাকা পাওয়া যায়নি!'); return; }
    }
    
    for (const item of cart) {
        const product = products.find(p => p.id === item.id);
        if (!product || product.stock < item.qty) {
            toast(item.name + ' এর স্টক অপর্যাপ্ত!');
            return;
        }
    }
    
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) product.stock -= item.qty;
    });
    
    const sale = {
        id: genId(),
        date: new Date().toISOString(),
        items: JSON.parse(JSON.stringify(cart)),
        subtotal, discount, tax, total,
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? parseFloat(document.getElementById('cash-received').value) : total,
        change: paymentMethod === 'cash' ? Math.max(0, parseFloat(document.getElementById('cash-received').value) - total) : 0,
        note: document.getElementById('sale-note').value.trim()
    };
    
    sales.unshift(sale);
    cart = [];
    saveProducts();
    saveSales();
    saveCart();
    
    closeCheckout();
    renderCart();
    renderProducts();
    showReceipt(sale);
    toast('বিক্রয় সফল হয়েছে! ✓');
}

// RECEIPT
function showReceipt(sale) {
    currentSaleForPrint = sale;
    const methodNames = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল ব্যাংকিং' };
    const date = new Date(sale.date);
    const shop = settings;
    
    let itemsHtml = sale.items.map(item => `
        <div class="flex justify-between py-1">
            <div>
                <div>${esc(item.name)}</div>
                <div class="text-xs text-slate-400">${item.qty} × ৳${fmt(item.price)}</div>
            </div>
            <div class="font-medium">৳${fmt(item.price * item.qty)}</div>
        </div>
    `).join('');
    
    document.getElementById('receipt-content').innerHTML = `
        <div class="text-center mb-4">
            <div class="font-bold text-base">${esc(shop.shopName || 'ProPOS')}</div>
            ${shop.shopAddress ? `<div class="text-xs text-slate-400 mt-0.5">${esc(shop.shopAddress)}</div>` : ''}
            ${shop.shopPhone ? `<div class="text-xs text-slate-400">ফোন: ${esc(shop.shopPhone)}</div>` : ''}
            <div class="text-xs text-slate-400 mt-1 border-t border-dashed pt-1">বিক্রয় রসিদ</div>
        </div>
        <div class="text-xs text-slate-400 mb-3 space-y-0.5">
            <div class="flex justify-between"><span>রসিদ নং</span><span>${sale.id.slice(-8).toUpperCase()}</span></div>
            <div class="flex justify-between"><span>তারিখ</span><span>${date.toLocaleDateString('bn-BD')} ${date.toLocaleTimeString('bn-BD',{hour:'2-digit',minute:'2-digit'})}</span></div>
            <div class="flex justify-between"><span>পেমেন্ট</span><span>${methodNames[sale.paymentMethod]}</span></div>
        </div>
        <div class="border-t border-b border-dashed border-slate-200 py-2 mb-2">${itemsHtml}</div>
        <div class="space-y-1 text-sm">
            <div class="flex justify-between"><span class="text-slate-500">সাবটোটাল</span><span>৳${fmt(sale.subtotal)}</span></div>
            ${sale.discount > 0 ? `<div class="flex justify-between"><span class="text-slate-500">ডিসকাউন্ট</span><span class="text-red-500">-৳${fmt(sale.discount)}</span></div>` : ''}
            ${sale.tax > 0 ? `<div class="flex justify-between"><span class="text-slate-500">ট্যাক্স</span><span>৳${fmt(sale.tax)}</span></div>` : ''}
            <div class="flex justify-between font-bold text-base border-t border-slate-200 pt-1.5 mt-1"><span>মোট</span><span class="text-primary-600">৳${fmt(sale.total)}</span></div>
            ${sale.paymentMethod === 'cash' ? `
                <div class="flex justify-between text-sm"><span class="text-slate-500">প্রাপ্ত</span><span>৳${fmt(sale.cashReceived)}</span></div>
                <div class="flex justify-between text-sm"><span class="text-slate-500">ফেরত</span><span>৳${fmt(sale.change)}</span></div>
            ` : ''}
        </div>
        ${sale.note ? `<div class="mt-3 text-xs text-slate-400 border-t border-dashed pt-2">নোট: ${esc(sale.note)}</div>` : ''}
        <div class="text-center text-xs text-slate-300 mt-5">ধন্যবাদ! আবার আসবেন</div>
    `;
    
    document.getElementById('bt-print-btn').disabled = !isBtConnected;
    document.getElementById('receipt-modal').classList.remove('hidden');
}

function closeReceipt() {
    document.getElementById('receipt-modal').classList.add('hidden');
    currentSaleForPrint = null;
}

function printReceiptBrowser() {
    if (!currentSaleForPrint) return;
    const content = document.getElementById('receipt-content').innerHTML;
    const win = window.open('', '_blank', 'width=320,height=600');
    win.document.write(`<!DOCTYPE html><html><head><title>রসিদ</title>
        <style>
            body{font-family:'Courier New',monospace;font-size:12px;padding:12px;max-width:280px;margin:0 auto;color:#111}
            .flex{display:flex;justify-content:space-between}
            .text-center{text-align:center}
            .font-bold,.font-semibold{font-weight:bold}
            .text-xs{font-size:10px}.text-sm{font-size:11px}.text-base{font-size:13px}
            .border-t{border-top:1px dashed #999}.border-b{border-bottom:1px dashed #999}
            .py-1{padding:2px 0}.py-2{padding:6px 0}.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}
            .mb-4{margin-bottom:16px}.mt-1{margin-top:4px}.mt-3{margin-top:12px}.mt-5{margin-top:20px}
            .pt-1{padding-top:4px}.pt-1\\.5{padding-top:6px}.pt-2{padding-top:8px}
            .space-y-0\\.5>*+*{margin-top:2px}.space-y-1>*+*{margin-top:3px}
            .text-slate-400,.text-slate-300,.text-slate-500{color:#666}
            .text-primary-600{color:#4f46e5}.text-red-500{color:#ef4444}
        </style></head><body>${content}
        <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}<\/script>
        </body></html>`);
    win.document.close();
}

// BLUETOOTH
function checkBtSupport() {
    if (!navigator.bluetooth) {
        document.getElementById('bt-connect-btn').disabled = true;
        document.getElementById('bt-connect-btn').innerHTML = '<i class="fas fa-times mr-1"></i> সাপোর্টেড নয়';
        document.getElementById('bt-connection-status').textContent = 'এই ব্রাউজারে Web Bluetooth সাপোর্ট নেই';
    }
}

async function connectBluetoothPrinter() {
    if (!navigator.bluetooth) {
        toast('Web Bluetooth সাপোর্টেড নয়। Chrome/Edge ব্যবহার করুন।');
        return;
    }
    
    try {
        toast('প্রিন্টার খোঁজা হচ্ছে...');
        
        btDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                '0000ff00-0000-1000-8000-00805f9b34fb',
                '0000ffe0-0000-1000-8000-00805f9b34fb',
                '0000ffb0-0000-1000-8000-00805f9b34fb'
            ]
        });
        
        btDevice.addEventListener('gattserverdisconnected', onBtDisconnected);
        
        const server = await btDevice.gatt.connect();
        const services = await server.getPrimaryServices();
        
        let found = false;
        for (const service of services) {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    btCharacteristic = char;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        
        if (!found) throw new Error('Writable characteristic পাওয়া যায়নি');
        
        isBtConnected = true;
        updateBtUI(btDevice.name || 'Unknown Device');
        toast('প্রিন্টার সংযুক্ত হয়েছে! ✓');
        
    } catch (err) {
        console.error(err);
        if (err.name === 'NotFoundError') {
            toast('কোনো ডিভাইস সিলেক্ট করা হয়নি');
        } else {
            toast('সংযোগ ব্যর্থ: ' + (err.message || 'অজানা ত্রুটি'));
        }
        isBtConnected = false;
        updateBtUI(null);
    }
}

function onBtDisconnected() {
    isBtConnected = false;
    btCharacteristic = null;
    updateBtUI(null);
    toast('প্রিন্টার বিচ্ছিন্ন হয়েছে');
}

async function disconnectBluetooth() {
    if (btDevice && btDevice.gatt.connected) {
        await btDevice.gatt.disconnect();
    }
    isBtConnected = false;
    btCharacteristic = null;
    btDevice = null;
    updateBtUI(null);
    toast('প্রিন্টার বিচ্ছিন্ন করা হয়েছে');
}

function updateBtUI(deviceName) {
    const dot = document.getElementById('bt-dot');
    const statusText = document.getElementById('bt-status-text');
    const settingsDot = document.getElementById('bt-status-dot-settings');
    const deviceNameEl = document.getElementById('bt-device-name');
    const connStatus = document.getElementById('bt-connection-status');
    const connectBtn = document.getElementById('bt-connect-btn');
    const disconnectBtn = document.getElementById('bt-disconnect-btn');
    const printBtn = document.getElementById('bt-print-btn');
    
    if (deviceName) {
        dot.style.background = '#22c55e';
        statusText.textContent = deviceName;
        settingsDot.style.background = '#22c55e';
        deviceNameEl.textContent = deviceName;
        connStatus.textContent = 'সংযুক্ত ✓';
        connectBtn.classList.add('hidden');
        disconnectBtn.classList.remove('hidden');
        if (printBtn) printBtn.disabled = false;
    } else {
        dot.style.background = '#cbd5e1';
        statusText.textContent = 'প্রিন্টার সংযুক্ত নয়';
        settingsDot.style.background = '#cbd5e1';
        deviceNameEl.textContent = 'কোনো ডিভাইস সংযুক্ত নেই';
        connStatus.textContent = 'সংযোগের অপেক্ষায়';
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
        if (printBtn) printBtn.disabled = true;
    }
}

async function printReceiptBluetooth() {
    if (!isBtConnected || !btCharacteristic || !currentSaleForPrint) {
        toast('প্রিন্টার সংযুক্ত নেই!');
        return;
    }
    
    try {
        toast('প্রিন্ট হচ্ছে...');
        const data = buildESCPOS(currentSaleForPrint);
        
        const chunkSize = 100;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            if (btCharacteristic.properties.writeWithoutResponse) {
                await btCharacteristic.writeValueWithoutResponse(chunk);
            } else {
                await btCharacteristic.writeValue(chunk);
            }
            await new Promise(r => setTimeout(r, 50));
        }
        
        toast('প্রিন্ট সফল! ✓');
    } catch (err) {
        console.error(err);
        toast('প্রিন্ট ব্যর্থ: ' + (err.message || 'ত্রুটি'));
    }
}

function buildESCPOS(sale) {
    const encoder = new TextEncoder();
    const shop = settings;
    const methodNames = { cash: 'Cash', card: 'Card', mobile: 'Mobile' };
    const date = new Date(sale.date);
    
    let cmds = [];
    const push = (...bytes) => cmds.push(...bytes);
    const text = (str) => {
        const encoded = encoder.encode(str);
        for (let i = 0; i < encoded.length; i++) cmds.push(encoded[i]);
    };
    
    push(0x1B, 0x40); // Init
    push(0x1B, 0x61, 0x01); // Center
    push(0x1B, 0x21, 0x30); // Double size
    text((shop.shopName || 'ProPOS') + '\n');
    push(0x1B, 0x21, 0x00);
    if (shop.shopAddress) text(shop.shopAddress + '\n');
    if (shop.shopPhone) text('Tel: ' + shop.shopPhone + '\n');
    text('--------------------------------\n');
    push(0x1B, 0x61, 0x00); // Left
    
    text('No: ' + sale.id.slice(-8).toUpperCase() + '\n');
    text('Date: ' + date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '\n');
    text('Pay: ' + methodNames[sale.paymentMethod] + '\n');
    text('--------------------------------\n');
    
    sale.items.forEach(item => {
        text(item.name + '\n');
        text('  ' + item.qty + ' x ' + item.price.toFixed(2) + ' = ' + (item.price * item.qty).toFixed(2) + '\n');
    });
    
    text('--------------------------------\n');
    text('Subtotal:  ' + sale.subtotal.toFixed(2) + '\n');
    if (sale.discount > 0) text('Discount: -' + sale.discount.toFixed(2) + '\n');
    if (sale.tax > 0) text('Tax:       ' + sale.tax.toFixed(2) + '\n');
    
    push(0x1B, 0x21, 0x08);
    text('TOTAL:     ' + sale.total.toFixed(2) + '\n');
    push(0x1B, 0x21, 0x00);
    
    if (sale.paymentMethod === 'cash') {
        text('Received:  ' + sale.cashReceived.toFixed(2) + '\n');
        text('Change:    ' + sale.change.toFixed(2) + '\n');
    }
    
    text('--------------------------------\n');
    push(0x1B, 0x61, 0x01);
    text('Thank You!\n\n\n\n');
    push(0x1D, 0x56, 0x01); // Cut
    
    return new Uint8Array(cmds);
}

// HISTORY
function renderHistory() {
    const container = document.getElementById('history-list');
    const noData = document.getElementById('no-history');
    const dateFilter = document.getElementById('history-date').value;
    
    let filtered = sales;
    if (dateFilter) filtered = sales.filter(s => s.date.startsWith(dateFilter));
    
    if (filtered.length === 0) {
        container.innerHTML = '';
        noData.classList.remove('hidden');
        return;
    }
    noData.classList.add('hidden');
    
    const methodNames = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল' };
    const methodColors = { cash: 'bg-emerald-50 text-emerald-700', card: 'bg-blue-50 text-blue-700', mobile: 'bg-purple-50 text-purple-700' };
    
    container.innerHTML = filtered.map(sale => {
        const date = new Date(sale.date);
        return `
        <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition cursor-pointer" onclick='showReceipt(${JSON.stringify(sale).replace(/'/g,"&#39;")})'>
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="font-semibold text-slate-800">#${sale.id.slice(-8).toUpperCase()}</div>
                    <div class="text-xs text-slate-400 mt-0.5">${date.toLocaleDateString('bn-BD')} · ${date.toLocaleTimeString('bn-BD',{hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                <div class="text-right">
                    <div class="font-bold text-primary-600">৳${fmt(sale.total)}</div>
                    <span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${methodColors[sale.paymentMethod]}">${methodNames[sale.paymentMethod]}</span>
                </div>
            </div>
            <div class="text-xs text-slate-400 truncate">${sale.items.map(i => esc(i.name) + ' ×' + i.qty).join(' · ')}</div>
        </div>`;
    }).join('');
}

// DASHBOARD
function renderDashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter(s => s.date.startsWith(today));
    
    document.getElementById('stat-today-sales').textContent = '৳' + fmt(todaySales.reduce((s, x) => s + x.total, 0));
    document.getElementById('stat-today-orders').textContent = todaySales.length;
    document.getElementById('stat-total-products').textContent = products.length;
    
    const lowStock = products.filter(p => p.stock <= (p.minStock || 5));
    document.getElementById('stat-low-stock').textContent = lowStock.length;
    
    const lowList = document.getElementById('low-stock-list');
    if (lowStock.length === 0) {
        lowList.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">সব পণ্যের স্টক পর্যাপ্ত ✓</p>';
    } else {
        lowList.innerHTML = lowStock.map(p => `
            <div class="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
                <span class="text-sm text-slate-700">${esc(p.name)}</span>
                <span class="text-sm font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-md">${p.stock} ${esc(p.unit||'')}</span>
            </div>
        `).join('');
    }
    
    const productSales = {};
    sales.forEach(s => s.items.forEach(item => {
        productSales[item.id] = productSales[item.id] || { name: item.name, qty: 0 };
        productSales[item.id].qty += item.qty;
    }));
    
    const topSelling = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topList = document.getElementById('top-selling-list');
    
    if (topSelling.length === 0) {
        topList.innerHTML = '<p class="text-sm text-slate-400 py-4 text-center">এখনো কোনো বিক্রয় হয়নি</p>';
    } else {
        topList.innerHTML = topSelling.map((p, i) => `
            <div class="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
                <span class="text-sm text-slate-700"><span class="text-slate-300 font-medium mr-2">${i+1}</span>${esc(p.name)}</span>
                <span class="text-sm font-semibold text-primary-600">${p.qty} বিক্রি</span>
            </div>
        `).join('');
    }
}

// SETTINGS
function loadSettingsToUI() {
    document.getElementById('shop-name').value = settings.shopName || '';
    document.getElementById('shop-address').value = settings.shopAddress || '';
    document.getElementById('shop-phone').value = settings.shopPhone || '';
    document.getElementById('default-tax').value = settings.defaultTax || 0;
    
    if (settings.defaultTax) {
        document.getElementById('tax-input').value = settings.defaultTax;
        document.getElementById('mobile-tax-input').value = settings.defaultTax;
    }
}

function saveSettings() {
    settings = {
        shopName: document.getElementById('shop-name').value.trim() || 'আমার দোকান',
        shopAddress: document.getElementById('shop-address').value.trim(),
        shopPhone: document.getElementById('shop-phone').value.trim(),
        defaultTax: parseFloat(document.getElementById('default-tax').value) || 0
    };
    safeSave('propos_settings', settings);
    
    document.getElementById('tax-input').value = settings.defaultTax;
    document.getElementById('mobile-tax-input').value = settings.defaultTax;
    updateTotals();
    toast('সেটিংস সংরক্ষিত হয়েছে ✓');
}

// EXPORT / IMPORT
let _lastExport = 0;
function exportData(silent) {
    // স্বয়ংক্রিয় কল দুইবার চললে ডাবল ডাউনলোড ঠেকাতে ৩০ সেকেন্ডের গার্ড
    if (silent && Date.now() - _lastExport < 30000) return;
    _lastExport = Date.now();
    // ফ্ল্যাগ আগে সেট — ডাউনলোড শুরুর সময় পেজ hidden হলেও আবার অটো-ব্যাকআপ চলবে না
    try {
        localStorage.setItem('propos_last_backup', String(Date.now()));
        localStorage.setItem('propos_auto_at', String(Date.now()));
        localStorage.removeItem('propos_dirty');
    } catch (_) {}
    const data = { app: 'ProPOS', version: 2, products, sales, settings, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const n = new Date(), z = x => String(x).padStart(2,'0');
    // সেকেন্ডসহ ইউনিক নাম — "Download file again?" প্রম্পট আসবে না
    a.download = `propos-backup-${n.getFullYear()}-${z(n.getMonth()+1)}-${z(n.getDate())}_${z(n.getHours())}-${z(n.getMinutes())}-${z(n.getSeconds())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (!silent) toast('ব্যাকআপ ফাইল ডাউনলোড হয়েছে ✓');
}

function importData(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const d = JSON.parse(e.target.result);
            if (!Array.isArray(d.products) || !Array.isArray(d.sales)) throw new Error('ভুল ফাইল');
            askConfirm(`ব্যাকআপ থেকে ${d.products.length}টি পণ্য ও ${d.sales.length}টি বিক্রয় রিস্টোর হবে। বর্তমান ডেটা মুছে যাবে।`, () => {
                products = d.products;
                sales = d.sales;
                settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
                cart = [];
                saveProducts(); saveSales(); saveCart(); safeSave('propos_settings', settings);
                toast('রিস্টোর সফল ✓');
                setTimeout(() => location.reload(), 600);
            }, {title:'ব্যাকআপ রিস্টোর করবেন?', yes:'হ্যাঁ, রিস্টোর করুন', danger:true});
        } catch (err) {
            console.error(err);
            toast('⚠️ ফাইলটি সঠিক ProPOS ব্যাকআপ নয়');
        }
    };
    reader.onerror = () => toast('ফাইল পড়া যায়নি');
    reader.readAsText(file);
}

function wipeAllData() {
    askConfirm('সব পণ্য, বিক্রয় ইতিহাস ও সেটিংস স্থায়ীভাবে মুছে যাবে। মুছার আগে স্বয়ংক্রিয়ভাবে একটি ব্যাকআপ ফাইল ডাউনলোড হবে।', () => {
        askConfirm('সত্যিই সব ডেটা মুছতে চান? এই কাজ ফেরানো যাবে না!', () => {
            exportData(true);
            setTimeout(() => {
                ['propos_products','propos_sales','propos_cart','propos_settings','propos_last_backup','propos_dirty'].forEach(k => localStorage.removeItem(k));
                location.reload();
            }, 900);
        }, {title:'শেষ নিশ্চিতকরণ', yes:'হ্যাঁ, সব মুছুন', danger:true});
    }, {title:'সব ডেটা মুছবেন?', yes:'চালিয়ে যান', danger:true});
}

function backupReminder() { if (window.UI && UI.checkPendingBackup) UI.checkPendingBackup(); }

// গ্লোবাল এরর ধরা — অ্যাপ যেন নিঃশব্দে না ভাঙে
window.addEventListener('error', e => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); });

// HELPERS
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmt(n) { return Number(n).toLocaleString('en-BD', { maximumFractionDigits: 2 }); }
function saveProducts() { return safeSave('propos_products', products); }
function saveSales() { return safeSave('propos_sales', sales); }
function saveCart() { return safeSave('propos_cart', cart); }

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    if (window.Sound) Sound.play(/✓/.test(msg) ? 'success' : /⚠/.test(msg) ? 'warn' : null);
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), 2800);
}
