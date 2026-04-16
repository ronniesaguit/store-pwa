// app.js — Store Management PWA main logic

var SCANNER_URL = 'https://ronniesaguit.github.io/store-pwa/scanner.html';

var state = {
  session: null,
  products: [],
  categories: [],
  cart: [],
  isOffline: false
};

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  // Force indicator to upper-left regardless of cached CSS
  var ind = document.getElementById('sync-indicator');
  if (ind) { ind.style.left = '10px'; ind.style.right = 'auto'; }

  showLoading('Loading Store App…');
  try { await DB.init(); } catch(e) { console.warn('IndexedDB unavailable:', e); }

  // ── Try online session validation first ──────────────────────────────────────
  if (navigator.onLine && API.token) {
    try {
      var session = await API.call('getSessionInfo');
      state.session = session;
      localStorage.setItem('store_session', JSON.stringify(session));
      state.isOffline = false;

      // Load fresh data — products & categories
      try {
        state.products = await API.call('getProducts');
        try { await DB.saveProducts(state.products); } catch(e) {}
      } catch(e) {
        try { state.products = (await DB.getProducts()) || []; } catch(e2) { state.products = []; }
      }
      var serverCats = [], cachedCats = [];
      try { serverCats = await API.call('getCategories'); } catch(e) {}
      try { cachedCats = (await DB.getCategories()) || []; } catch(e) {}
      var merged = serverCats.slice();
      cachedCats.forEach(function(local) {
        if (!merged.find(function(s){ return s.Category_Name === local.Category_Name; }))
          merged.push(local);
      });
      state.categories = merged;
      try { await DB.saveCategories(state.categories); } catch(e) {}

      routeToDashboard();
      return;
    } catch(e) {
      console.warn('Online session failed, checking cache:', e.message);
      // Fall through to offline path below
    }
  }

  // ── Offline / server unreachable — use cached session ────────────────────────
  var cached = localStorage.getItem('store_session');
  if (cached) {
    try {
      state.session    = JSON.parse(cached);
      state.isOffline  = true;
      state.products   = (await DB.getProducts())   || [];
      state.categories = (await DB.getCategories()) || [];
      routeToDashboard();
      return;
    } catch(e) {
      console.warn('Cache restore failed:', e);
    }
  }

  // ── No session at all — show login ────────────────────────────────────────────
  renderLogin(navigator.onLine ? null : 'No internet. Please connect and log in once first.');
}

function routeToDashboard() {
  if (!state.session || !state.session.user) { renderLogin(); return; }
  if (state.session.user.Role === 'OWNER') renderOwnerDashboard();
  else renderWatcherDashboard();
}

async function syncWhenOnline() {
  if (!API.token) return;
  try {
    var queue = await DB.getSyncQueue();
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      try {
        await API.call(item.action, item.data);
        await DB.markSynced(item.id);
      } catch(e) { console.warn('Sync item failed:', e); }
    }
    // Refresh cached data
    state.products   = await API.call('getProducts');
    state.categories = await API.call('getCategories');
    await DB.saveProducts(state.products);
    await DB.saveCategories(state.categories);
    _showToast('Synced!', false);
  } catch(e) { console.warn('Sync error:', e); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showLoading(text) {
  document.getElementById('app').innerHTML =
    '<div class="screen"><div class="card" style="text-align:center;padding:40px;">' + text + '</div></div>';
}

function showError(msg) {
  return '<div class="message message-error">' + msg + '</div>';
}

function _showToast(msg, isError) {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'padding:12px 20px;border-radius:20px;font-weight:bold;z-index:9998;' +
    'white-space:nowrap;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.25);' +
    (isError ? 'background:#dc2626;color:#fff;' : 'background:#16a34a;color:#fff;');
  t.textContent = (isError ? '⚠ ' : '✓ ') + msg;
  document.body.appendChild(t);
  setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
}

function goHome() {
  if (!state.session || !state.session.user) { renderLogin(); return; }
  if (state.session.user.Role === 'OWNER') renderOwnerDashboard();
  else renderWatcherDashboard();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function renderLogin(msg) {
  document.getElementById('app').innerHTML =
    '<div class="screen"><div class="card">' +
    '<h1 class="title">🏪 Store Login</h1>' +
    '<div class="subtitle">Sign in to continue</div>' +
    (msg ? showError(msg) : '') +
    '<div class="field"><label>Username</label><input id="login-username" placeholder="Enter username" autocomplete="username"></div>' +
    '<div class="field"><label>Password</label><input id="login-password" type="password" placeholder="Enter password" autocomplete="current-password"></div>' +
    '<button class="btn btn-primary" onclick="submitLogin()">Login</button>' +
    '<div class="muted" style="text-align:center;">owner / 1234 &nbsp;|&nbsp; watcher / 1234</div>' +
    '</div></div>';
}

// SHA-256 helper for offline credential verification
async function sha256(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

async function submitLogin() {
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  if (!username || !password) { _showToast('Enter username and password', true); return; }

  showLoading('Logging in…');

  // ── Try online login ──────────────────────────────────────────────────────────
  try {
    var result = await Promise.race([
      API.call('login', { username: username, password: password }),
      new Promise(function(_, reject){
        setTimeout(function(){ reject(new Error('__TIMEOUT__')); }, 10000);
      })
    ]);

    API.setToken(result.token);
    state.session  = { loggedIn: true, user: result.user };
    state.isOffline = false;
    localStorage.setItem('store_session', JSON.stringify(state.session));

    // Cache hashed credentials so offline login works next time
    try {
      var hash = await sha256(password);
      localStorage.setItem('offline_cred_' + username.toLowerCase(), JSON.stringify({
        passwordHash: hash,
        user: result.user
      }));
    } catch(e) {}

    // Cache products & categories
    try { state.products   = await API.call('getProducts');   } catch(e){ state.products   = []; }
    try { state.categories = await API.call('getCategories'); } catch(e){ state.categories = []; }
    try { await DB.saveProducts(state.products);   } catch(e) {}
    try { await DB.saveCategories(state.categories); } catch(e) {}

    routeToDashboard();
    return;

  } catch(serverErr) {
    var msg = serverErr.message || String(serverErr);
    // Real auth error (wrong password, user not found) — don't try offline
    if (msg !== '__TIMEOUT__' && msg !== 'No internet connection' && navigator.onLine) {
      renderLogin(msg);
      return;
    }
    // Timeout or no internet — fall through to offline login
  }

  // ── Offline login — verify against cached credentials ────────────────────────
  try {
    var raw = localStorage.getItem('offline_cred_' + username.toLowerCase());
    if (!raw) {
      renderLogin('No offline session for "' + username + '".\nPlease log in while connected at least once first.');
      return;
    }
    var cachedCred = JSON.parse(raw);
    var enteredHash = await sha256(password);
    if (enteredHash !== cachedCred.passwordHash) {
      renderLogin('Incorrect password.');
      return;
    }
    // Offline login success
    state.session    = { loggedIn: true, user: cachedCred.user };
    state.isOffline  = true;
    localStorage.setItem('store_session', JSON.stringify(state.session));
    state.products   = (await DB.getProducts())   || [];
    state.categories = (await DB.getCategories()) || [];
    routeToDashboard();
  } catch(err) {
    renderLogin('Offline login failed: ' + (err.message || err));
  }
}

async function logout() {
  try { await API.call('logout'); } catch(e) {}
  API.clearToken();
  state.session = null;
  state.products = [];
  state.categories = [];
  state.cart = [];
  renderLogin();
}

// ── Dashboards ────────────────────────────────────────────────────────────────

function renderOwnerDashboard(msg) {
  var name = state.session.user.Full_Name;
  var offlineBanner = state.isOffline
    ? '<div class="message message-offline">🔴 Offline mode — changes will sync when connected</div>' : '';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">👋 ' + name + '</div>' +
    '<button class="small-btn" onclick="logout()">Logout</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    offlineBanner +
    '<div class="grid-buttons">' +
    '<button class="big-btn" onclick="loadProducts()">📦 Products</button>' +
    '<button class="big-btn" onclick="renderQuickSell()">💰 Quick Sell</button>' +
    '<button class="big-btn" onclick="renderInventoryMenu()">📋 Inventory</button>' +
    '<button class="big-btn" onclick="renderExpenses()">💸 Expenses</button>' +
    '<button class="big-btn" onclick="renderReports()">📊 Reports</button>' +
    '<button class="big-btn" onclick="renderChat()">💬 Chat</button>' +
    '</div>' +
    '<div class="card"><div class="subtitle">Quick Actions</div>' +
    '<button class="btn btn-secondary" onclick="renderAddProductForm()">+ Add New Product</button>' +
    '<button class="btn btn-secondary" style="margin-top:8px;" onclick="renderAddExpenseForm()">+ Record Expense</button>' +
    '</div></div>';
}

function renderWatcherDashboard(msg) {
  var name = state.session.user.Full_Name;
  var offlineBanner = state.isOffline
    ? '<div class="message message-offline">🔴 Offline mode — sales will sync when connected</div>' : '';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">👋 ' + name + '</div>' +
    '<button class="small-btn" onclick="logout()">Logout</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    offlineBanner +
    '<div class="grid-buttons">' +
    '<button class="big-btn" onclick="renderQuickSell()">💰 Quick Sell</button>' +
    '<button class="big-btn" onclick="renderExpenses()">💸 Expenses</button>' +
    '</div></div>';
}

// ── Products ──────────────────────────────────────────────────────────────────

async function loadProducts() {
  showLoading('Loading products…');
  try {
    state.products   = await API.call('getProducts');
    state.categories = await API.call('getCategories');
    renderProductsList();
  } catch(err) { _showToast('Error: ' + err.message, true); goHome(); }
}

function renderProductsList() {
  var html = state.products.map(function(p) {
    var pImg = _productImage(p);
    var imgEl = pImg
      ? _thumbHtml(pImg, 44)
      : '<div style="width:44px;height:44px;border-radius:6px;background:#f3f4f6;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">📦</div>';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #f3f4f6;">' +
      imgEl +
      '<div style="flex:1;min-width:0;"><strong>' + p.Product_Name + '</strong>' +
      (p._pending ? ' <span style="color:#d97706;font-size:11px;">⏳pending</span>' : '') + '<br>' +
      '<span class="muted">₱' + Number(p.Selling_Price).toFixed(2) + ' | Stock: ' + p.Current_Stock + '</span></div>' +
      '<button class="small-btn" onclick="editProduct(\'' + p.Product_ID + '\')">Edit</button>' +
      '</div>';
  }).join('');
  if (!html) html = '<div class="muted" style="padding:12px;">No products yet.</div>';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title">Products (' + state.products.length + ')</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +
    '<button class="btn btn-secondary" onclick="renderAddProductForm()">+ Add Product</button>' +
    '<div class="card">' + html + '</div></div>';
}

function renderAddProductForm(msg, scannedCode, existingImage) {
  _pendingProductImage = existingImage || null;
  var catsHtml = (state.categories || []).map(function(c) {
    return '<option value="' + c.Category_Name + '">' + c.Category_Name + '</option>';
  }).join('');
  var initialCode  = scannedCode || '';
  var imgPreview   = existingImage
    ? '<img id="p-img-preview" src="' + existingImage + '" onclick="openImageLightbox(\'' + existingImage + '\')" ' +
      'style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid #e5e7eb;">'
    : '<img id="p-img-preview" src="" style="display:none;width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid #e5e7eb;" onclick="openImageLightbox(this.src)">';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">Add Product</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +
    (msg ? showError(msg) : '') +
    '<div class="card">' +
      '<div class="field">' +
        '<button class="btn btn-primary" style="background:#7c3aed;margin:0 0 10px 0;" onclick="openScannerModal(\'addProduct\')">📷 Scan Barcode</button>' +
        '<input id="p-barcode" value="' + initialCode + '" placeholder="Barcode number">' +
      '</div>' +
      '<div class="field"><label>Product Name *</label>' +
        '<div style="display:flex;gap:6px;align-items:stretch;">' +
          '<input id="p-name" placeholder="Full product name" style="flex:1;min-width:0;">' +
          '<button id="voice-btn-p-name" onclick="startVoiceInput(\'p-name\')" title="Speak product name" ' +
            'style="background:#7c3aed;color:#fff;border:none;padding:0 12px;border-radius:8px;font-size:20px;cursor:pointer;flex-shrink:0;">🎤</button>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Product Photo</label>' +
        '<div style="display:flex;gap:10px;align-items:center;">' +
          '<button onclick="openProductCamera()" ' +
            'style="background:#0891b2;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">📷 Take Photo</button>' +
          imgPreview +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Category</label>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<select id="p-category" style="flex:1;"><option value="">Select Category</option>' + catsHtml + '</select>' +
          '<button class="small-btn" onclick="showCategoryModal()" style="background:#dbeafe;padding:10px;">+ New</button>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Cost Price (₱)</label><input id="p-cost" type="number" step="0.01" placeholder="0.00" oninput="calcSellingPrice()"></div>' +
      '<div class="field"><label>Profit Margin (%)</label><input id="p-margin" type="number" value="20" oninput="calcSellingPrice()"></div>' +
      '<div class="field"><label>Selling Price (₱) *</label><input id="p-price" type="number" step="0.01" placeholder="Auto-calculated"></div>' +
      '<div class="field"><label>Starting Stock</label><input id="p-stock" type="number" value="0"></div>' +
      '<div class="field"><label>Reorder Level</label><input id="p-reorder" type="number" value="5"></div>' +
      '<button class="btn btn-primary" onclick="submitProduct()">Save Product</button>' +
    '</div>' +
    _renderCategoryModalHtml() +
    '</div>';
}

// ── Voice to Text ────────────────────────────────────────────────────────────

var _voiceRec = null;

function startVoiceInput(fieldId) {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { _showToast('Voice not supported on this browser', true); return; }
  if (_voiceRec) { try { _voiceRec.stop(); } catch(e) {} }

  var btn   = document.getElementById('voice-btn-' + fieldId);
  var field = document.getElementById(fieldId);
  if (btn) { btn.textContent = '🔴'; btn.style.background = '#dc2626'; }

  _voiceRec = new SR();
  _voiceRec.lang = 'en-PH';
  _voiceRec.interimResults = false;
  _voiceRec.maxAlternatives = 1;

  _voiceRec.onresult = function(e) {
    var text = e.results[0][0].transcript;
    if (field) { field.value = text; field.dispatchEvent(new Event('input')); }
    _showToast('Got: ' + text.substring(0, 30), false);
  };
  _voiceRec.onerror = function(e) {
    _showToast('Voice error: ' + e.error, true);
  };
  _voiceRec.onend = function() {
    if (btn) { btn.textContent = '🎤'; btn.style.background = '#7c3aed'; }
    _voiceRec = null;
  };
  _voiceRec.start();
  _showToast('Listening… speak now', false);
}

// ── Product Photo / Thumbnail ─────────────────────────────────────────────────

var _pendingProductImage = null;

function openProductCamera() {
  document.getElementById('product-photo-input').click();
}

function handleProductPhoto(input) {
  var file = input.files[0];
  if (!file) return;
  _compressToThumbnail(file).then(function(dataUrl) {
    _pendingProductImage = dataUrl;
    var preview = document.getElementById('p-img-preview');
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
    _showToast('Photo ready', false);
  });
  input.value = ''; // reset so same file can be picked again
}

function _compressToThumbnail(file) {
  return new Promise(function(resolve) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var MAX = 96;
        var scale = Math.min(MAX / img.width, MAX / img.height, 1);
        var w = Math.max(1, Math.round(img.width  * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.45));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function openImageLightbox(src) {
  var lb = document.getElementById('img-lightbox');
  document.getElementById('img-lightbox-img').src = src;
  lb.style.display = 'flex';
}

function closeImageLightbox() {
  document.getElementById('img-lightbox').style.display = 'none';
  document.getElementById('img-lightbox-img').src = '';
}

function _productImage(p) {
  return p.Thumbnail_URL || p.Image || '';
}

function _thumbHtml(src, size) {
  size = size || 44;
  if (!src) return '';
  var safe = src.replace(/'/g, '%27');
  return '<img src="' + src + '" onclick="openImageLightbox(\'' + safe + '\')" ' +
    'style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:6px;' +
    'cursor:pointer;flex-shrink:0;border:1px solid #e5e7eb;" loading="lazy">';
}

function calcSellingPrice() {
  var cost   = Number(document.getElementById('p-cost').value)   || 0;
  var margin = Number(document.getElementById('p-margin').value) || 0;
  if (cost > 0) document.getElementById('p-price').value = Math.ceil(cost * (1 + margin / 100));
}

async function submitProduct() {
  var name  = (document.getElementById('p-name')  || {}).value || '';
  var price = (document.getElementById('p-price') || {}).value || '';
  if (!name.trim())       { _showToast('Product name is required', true); return; }
  if (Number(price) <= 0) { _showToast('Selling price must be greater than zero', true); return; }

  // ── Strict duplicate check ────────────────────────────────────────────────────
  var nameLower = name.trim().toLowerCase();
  var duplicate = (state.products || []).find(function(p) {
    return String(p.Product_Name || '').trim().toLowerCase() === nameLower;
  });
  if (duplicate) {
    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">⚠ Product Exists</div>' +
      '<button class="small-btn" onclick="renderAddProductForm()">Back</button></div>' +
      '<div class="card" style="text-align:center;padding:24px;">' +
        '<div style="font-size:48px;margin-bottom:12px;">📦</div>' +
        '<div style="font-size:18px;font-weight:bold;margin-bottom:8px;">' + duplicate.Product_Name + '</div>' +
        '<div style="color:#6b7280;margin-bottom:6px;">already exists in your products.</div>' +
        '<div style="color:#6b7280;font-size:14px;margin-bottom:20px;">Current stock: <strong>' + (duplicate.Current_Stock || 0) + ' pcs</strong></div>' +
        '<div style="background:#fef3c7;border-radius:10px;padding:14px;margin-bottom:20px;color:#92400e;font-size:14px;">' +
          'If you received new stocks, go to <strong>Inventory → Add Stock</strong> to update the quantity.' +
        '</div>' +
        '<button class="btn btn-primary" style="margin-bottom:10px;" onclick="renderAddStock()">➕ Add Stock to this Product</button>' +
        '<button class="btn btn-secondary" onclick="renderAddProductForm()">Go Back</button>' +
      '</div></div>';
    return;
  }

  var payload = {
    Product_Name:  name,
    Category_Name: (document.getElementById('p-category') || {}).value || '',
    Unit:          'pc',
    Barcode:       (document.getElementById('p-barcode')  || {}).value || '',
    Cost_Price:    (document.getElementById('p-cost')     || {}).value || 0,
    Selling_Price: price,
    Current_Stock: (document.getElementById('p-stock')   || {}).value || 0,
    Reorder_Level: (document.getElementById('p-reorder') || {}).value || 5,
    Image:         _pendingProductImage || ''
  };

  // ── Offline path: queue locally, sync when back online ───────────────────────
  if (!navigator.onLine) {
    try {
      await DB.addToSyncQueue({ action: 'createProduct', data: payload });
      // Add to local state immediately so it appears in the product list
      var tempProduct = Object.assign({}, payload, {
        Product_ID: 'OFFLINE_' + Date.now(),
        _pending: true
      });
      state.products.push(tempProduct);
      try { await DB.saveProducts(state.products); } catch(e) {}
      renderOwnerDashboard('✓ Product saved offline — will sync when online.');
    } catch(e) {
      renderAddProductForm('Failed to save offline: ' + (e.message || String(e)));
    }
    return;
  }

  // ── Online path ───────────────────────────────────────────────────────────────
  showLoading('Saving product…');
  try {
    await API.call('createProduct', payload);
    state.products = await API.call('getProducts');
    // If the server didn't return a Thumbnail_URL yet (Drive not wired),
    // inject the local base64 image so it shows immediately
    if (payload.Image) {
      var match = state.products.find(function(p) {
        return p.Product_Name === payload.Product_Name && !p.Thumbnail_URL;
      });
      if (match) match.Image = payload.Image;
    }
    try { await DB.saveProducts(state.products); } catch(e) {}
    renderOwnerDashboard('Product saved successfully!');
  } catch(err) { renderAddProductForm(err.message || String(err)); }
}

async function editProduct(id) {
  var p = state.products.find(function(x) { return x.Product_ID === id; });
  if (!p) return;
  renderAddProductForm('', p.Barcode, _productImage(p));
  document.getElementById('p-name').value    = p.Product_Name   || '';
  document.getElementById('p-price').value   = p.Selling_Price  || '';
  document.getElementById('p-cost').value    = p.Cost_Price     || '';
  document.getElementById('p-stock').value   = p.Current_Stock  || 0;
  document.getElementById('p-reorder').value = p.Reorder_Level  || 5;
  var sel = document.getElementById('p-category');
  if (sel && p.Category_Name) sel.value = p.Category_Name;
}

// ── Categories ────────────────────────────────────────────────────────────────

function _renderCategoryModalHtml() {
  var cats = state.categories || [];
  var listHtml = cats.length
    ? cats.map(function(c) {
        return '<div class="category-item"><span>' + c.Category_Name + '</span>' +
          '<div><button class="category-edit" onclick="editCategory(\'' + c.Category_Name + '\')">Edit</button>' +
          '<button class="category-delete" onclick="deleteCategory(\'' + c.Category_Name + '\')">Delete</button>' +
          '</div></div>';
      }).join('')
    : '<div style="padding:10px;color:#6b7280;">No categories yet</div>';

  return '<div id="category-modal" class="modal">' +
    '<div class="modal-content">' +
    '<button class="modal-close" onclick="closeCategoryModal()">×</button>' +
    '<div class="modal-title">Manage Categories</div>' +
    '<div class="field">' +
      '<input id="new-category-name" placeholder="New category name">' +
      '<button class="btn btn-primary" style="margin-top:8px;" onclick="addNewCategory()">Add Category</button>' +
    '</div>' +
    '<div class="category-list">' + listHtml + '</div>' +
    '</div></div>';
}

function showCategoryModal()  { var m = document.getElementById('category-modal'); if (m) m.classList.add('active'); }
function closeCategoryModal() { var m = document.getElementById('category-modal'); if (m) m.classList.remove('active'); }

function _updateCategoryList() {
  var cats = state.categories || [];
  var html = cats.length
    ? cats.map(function(c) {
        return '<div class="category-item"><span>' + c.Category_Name + '</span>' +
          '<div><button class="category-edit" onclick="editCategory(\'' + c.Category_Name + '\')">Edit</button>' +
          '<button class="category-delete" onclick="deleteCategory(\'' + c.Category_Name + '\')">Delete</button>' +
          '</div></div>';
      }).join('')
    : '<div style="padding:10px;color:#6b7280;">No categories yet</div>';
  var el = document.querySelector('#category-modal .category-list');
  if (el) el.innerHTML = html;
}

function _updateCategoryDropdown() {
  var sel = document.getElementById('p-category');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">Select Category</option>' +
    (state.categories || []).map(function(c) {
      return '<option value="' + c.Category_Name + '">' + c.Category_Name + '</option>';
    }).join('');
  sel.value = cur;
}

async function addNewCategory() {
  var inp  = document.getElementById('new-category-name');
  var name = inp ? inp.value.trim() : '';
  if (!name) { _showToast('Enter a category name', true); return; }

  // ── Strict duplicate check ──────────────────────────────────────────────────
  var nameLower = name.toLowerCase();
  var existing = (state.categories || []).find(function(c) {
    return String(c.Category_Name || '').trim().toLowerCase() === nameLower;
  });
  if (existing) {
    // Clear input, highlight the existing category in the list
    if (inp) inp.value = '';
    _showToast('"' + existing.Category_Name + '" already exists', true);
    // Highlight the existing entry in the modal list
    var items = document.querySelectorAll('#category-modal .category-item');
    items.forEach(function(el) {
      var span = el.querySelector('span');
      if (span && span.textContent.trim().toLowerCase() === nameLower) {
        el.style.background = '#fef3c7';
        el.style.borderRadius = '8px';
        setTimeout(function() { el.style.background = ''; }, 2500);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }

  try {
    // Save to server
    await API.call('createCategory', { Category_Name: name });
    if (inp) inp.value = '';

    // Add to state immediately
    if (!state.categories) state.categories = [];
    state.categories.push({ Category_Name: name, Is_Active: 'TRUE', Sort_Order: 99 });

    // Save current full list to IndexedDB
    try { await DB.saveCategories(state.categories); } catch(e) {}

    _updateCategoryList();
    _updateCategoryDropdown();
    _showToast('Category "' + name + '" added!', false);

    // Fetch fresh list from server (flush already happened) and merge
    try {
      var fresh = await API.call('getCategories');
      // Merge: keep any local entries not yet on server
      fresh.forEach(function(s) {
        if (!state.categories.find(function(c) { return c.Category_Name === s.Category_Name; })) {
          state.categories.push(s);
        }
      });
      // Remove any that server explicitly deleted (not in fresh AND not just added)
      state.categories = fresh.concat(
        state.categories.filter(function(c) {
          return !fresh.find(function(s) { return s.Category_Name === c.Category_Name; });
        })
      );
      await DB.saveCategories(state.categories);
      _updateCategoryList();
      _updateCategoryDropdown();
    } catch(e) {} // server refresh failure is non-fatal

  } catch(err) {
    _showToast('Error: ' + (err.message || String(err)), true);
  }
}

async function editCategory(oldName) {
  var newName = prompt('Rename category:', oldName);
  if (!newName || newName === oldName) return;
  try {
    await API.call('updateCategory', { oldName: oldName, newName: newName });
    var cat = state.categories.find(function(c) { return c.Category_Name === oldName; });
    if (cat) cat.Category_Name = newName;
    _updateCategoryList();
    _updateCategoryDropdown();
    _showToast('Renamed to "' + newName + '"', false);
    try { await DB.saveCategories(state.categories); } catch(e) {}
  } catch(err) { _showToast('Error: ' + (err.message || String(err)), true); }
}

async function deleteCategory(name) {
  if (!confirm('Delete category "' + name + '"?')) return;
  try {
    await API.call('deleteCategory', { Category_Name: name });
    state.categories = state.categories.filter(function(c) { return c.Category_Name !== name; });
    _updateCategoryList();
    _updateCategoryDropdown();
    _showToast('Category deleted', false);
    try { await DB.saveCategories(state.categories); } catch(e) {}
  } catch(err) { _showToast('Error: ' + (err.message || String(err)), true); }
}

// ── Quick Sell ────────────────────────────────────────────────────────────────

function renderQuickSell(msg) {
  var prodsHtml = state.products.map(function(p) {
    var pImg = _productImage(p);
    var safeImg = pImg ? pImg.replace(/'/g, '%27') : '';
    var imgEl = pImg
      ? '<img src="' + pImg + '" loading="lazy" onclick="event.stopPropagation();openImageLightbox(\'' + safeImg + '\')" ' +
        'style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid #e5e7eb;">'
      : '<div style="width:44px;height:44px;border-radius:6px;background:#f3f4f6;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">📦</div>';
    return '<button class="product-btn" onclick="addToCart(\'' + p.Product_ID + '\')" style="display:flex;align-items:center;gap:8px;padding:10px;">' +
      imgEl +
      '<div style="flex:1;min-width:0;text-align:left;">' +
        '<div class="product-name" style="font-size:13px;line-height:1.3;white-space:normal;">' + p.Product_Name + '</div>' +
        '<div class="product-price" style="font-size:13px;">₱' + Number(p.Selling_Price).toFixed(2) + '</div>' +
        '<div class="muted" style="font-size:11px;">Stock: ' + p.Current_Stock + '</div>' +
      '</div>' +
      '</button>';
  }).join('');

  var cartHtml = state.cart.map(function(item, idx) {
    return '<div class="cart-row">' +
      '<div><strong>' + item.name + '</strong><br>' +
      '<span class="muted">' + item.qty + ' x ₱' + item.price.toFixed(2) + '</span></div>' +
      '<div><strong>₱' + item.total.toFixed(2) + '</strong><br>' +
      '<button class="small-btn" onclick="removeCartItem(' + idx + ')">Remove</button></div>' +
      '</div>';
  }).join('');

  var total = state.cart.reduce(function(s, x) { return s + x.total; }, 0);

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">💰 Quick Sell</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +
    '<button class="btn btn-primary" style="background:#7c3aed;margin-bottom:12px;" onclick="openScannerModal(\'quickSell\')">📷 Scan to Sell</button>' +
    (msg ? showError(msg) : '') +
    '<div class="card"><div class="subtitle">Tap product to add to cart</div>' +
    '<div class="products-grid">' + (prodsHtml || '<div class="muted">No products.</div>') + '</div></div>' +
    '<div class="card">' +
    '<div class="title" style="font-size:20px;">Cart (' + state.cart.length + ' items)</div>' +
    (cartHtml || '<div class="muted">No items yet.</div>') +
    '<div class="cart-total">₱' + total.toFixed(2) + '</div>' +
    '<div class="field"><label>Amount Paid (₱)</label>' +
    '<input id="amount-paid" type="number" step="0.01" value="' + total.toFixed(2) + '"></div>' +
    '<div class="field"><label>Payment Method</label>' +
    '<select id="payment-method"><option>Cash</option><option>GCash</option><option>Maya</option><option>Bank Transfer</option></select></div>' +
    '<button class="btn btn-primary" onclick="checkoutSale()">Confirm Sale</button>' +
    '</div></div>';
}

function addToCart(pid) {
  var p = state.products.find(function(x) { return x.Product_ID === pid; });
  if (!p) return;
  var existing = state.cart.find(function(x) { return x.id === pid; });
  if (existing) { existing.qty++; existing.total = existing.qty * existing.price; }
  else { state.cart.push({ id: pid, name: p.Product_Name, price: Number(p.Selling_Price), qty: 1, total: Number(p.Selling_Price) }); }
  renderQuickSell();
}

function removeCartItem(idx) { state.cart.splice(idx, 1); renderQuickSell(); }

async function checkoutSale() {
  if (!state.cart.length) { _showToast('Cart is empty', true); return; }
  var paid   = Number(document.getElementById('amount-paid').value);
  var total  = state.cart.reduce(function(s, x) { return s + x.total; }, 0);
  var method = document.getElementById('payment-method').value;
  if (paid < total) { _showToast('Amount paid is less than total', true); return; }

  showLoading('Processing sale…');

  var salePayload = {
    items: state.cart.map(function(i) { return { productId: i.id, qty: i.qty }; }),
    amountPaid: paid,
    paymentMethod: method
  };

  try {
    if (navigator.onLine) {
      var result = await API.call('createSale', salePayload);
      state.cart = [];
      _showToast('Sale done! Change: ₱' + (paid - total).toFixed(2), false);
    } else {
      await DB.addToSyncQueue({ action: 'createSale', data: salePayload });
      state.cart = [];
      _showToast('Sale saved offline! Change: ₱' + (paid - total).toFixed(2), false);
    }
    renderQuickSell();
  } catch(err) {
    // Fall back to offline queue on server error
    try {
      await DB.addToSyncQueue({ action: 'createSale', data: salePayload });
      state.cart = [];
      _showToast('Saved offline. Change: ₱' + (paid - total).toFixed(2), false);
      renderQuickSell();
    } catch(e2) {
      _showToast('Error: ' + (err.message || String(err)), true);
      renderQuickSell();
    }
  }
}

// ── Inventory ─────────────────────────────────────────────────────────────────

function renderInventoryMenu() {
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title">📋 Inventory</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +
    '<div class="card">' +
    '<button class="btn btn-secondary" onclick="renderAddStock()">Add Stock</button>' +
    '</div></div>';
}

async function renderAddStock() {
  if (navigator.onLine) {
    try { state.products = await API.call('getProducts'); } catch(e) {}
  }
  var opts = state.products.map(function(p) {
    return '<option value="' + p.Product_ID + '">' + p.Product_Name + ' (Stock: ' + p.Current_Stock + ')</option>';
  }).join('');
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title">Add Stock</div>' +
    '<button class="small-btn" onclick="renderInventoryMenu()">Back</button></div>' +
    '<div class="card">' +
    '<div class="field"><label>Product</label><select id="stock-product">' + opts + '</select></div>' +
    '<div class="field"><label>Quantity</label><input id="stock-qty" type="number" value="1"></div>' +
    '<div class="field"><label>Reason</label><select id="stock-reason"><option>RESTOCK</option><option>RETURN</option><option>ADJUSTMENT</option></select></div>' +
    '<button class="btn btn-primary" onclick="submitStock()">Add Stock</button>' +
    '</div></div>';
}

async function submitStock() {
  var pid    = document.getElementById('stock-product').value;
  var qty    = Number(document.getElementById('stock-qty').value);
  var reason = document.getElementById('stock-reason').value;
  if (!pid || qty <= 0) { _showToast('Invalid input', true); return; }
  showLoading('Adding stock…');
  try {
    await API.call('addProductStock', { productId: pid, qty: qty, reason: reason, notes: '' });
    state.products = await API.call('getProducts');
    _showToast('Stock added!', false);
    renderInventoryMenu();
  } catch(err) { _showToast('Error: ' + err.message, true); renderInventoryMenu(); }
}

// ── Expenses ──────────────────────────────────────────────────────────────────

// Category list with descriptions shown in the form
var EXPENSE_CATEGORIES = [
  { value: 'Inventory Purchase', label: 'Inventory Purchase', hint: 'Products you bought to sell (Coke, rice, snacks…)' },
  { value: 'Store Supplies',     label: 'Store Supplies',     hint: 'Items the store uses up but does not sell (bags, ice for display, tape…)' },
  { value: 'Utilities',          label: 'Utilities',          hint: 'Electricity, water, internet, load…' },
  { value: 'Transportation',     label: 'Transportation',     hint: 'Fare, fuel, delivery cost…' },
  { value: 'Repairs',            label: 'Repairs',            hint: 'Fixing equipment, shelves, appliances…' },
  { value: 'Food',               label: 'Food (Staff)',       hint: 'Meals or snacks for the store staff…' },
  { value: 'Others',             label: 'Others',             hint: 'Anything that does not fit above…' }
];

async function renderExpenses() {
  showLoading('Loading expenses…');
  var items = [];
  try {
    items = await API.call('getTodayExpenses');
  } catch(e) {
    // Offline — show queued expenses from today
    try {
      var queue = await DB.getSyncQueue();
      var today = new Date().toISOString().substring(0, 10);
      items = queue
        .filter(function(q) { return q.action === 'createExpense' && (q.data.Expense_Date || '').substring(0,10) === today; })
        .map(function(q) { return Object.assign({}, q.data, { _pending: true }); });
    } catch(e2) { items = []; }
  }

  var total = items.reduce(function(s, x) { return s + (Number(x.Amount) || 0); }, 0);

  var listHtml = items.length ? items.map(function(x) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'padding:10px 0;border-bottom:1px solid #f3f4f6;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:bold;font-size:14px;">' + x.Description +
          (x._pending ? ' <span style="color:#d97706;font-size:11px;">⏳</span>' : '') + '</div>' +
        '<div class="muted" style="font-size:12px;">' + (x.Expense_Category || 'Others') +
          ' · ' + (x.Expense_Date || '').substring(0,10) +
          ' · ' + (x.Recorded_By_Name || '') + '</div>' +
      '</div>' +
      '<div style="font-weight:bold;color:#dc2626;font-size:15px;margin-left:10px;">₱' +
        Number(x.Amount).toFixed(2) + '</div>' +
      '</div>';
  }).join('') : '<div class="muted" style="padding:16px 0;text-align:center;">No expenses recorded today.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">💸 Expenses</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +
    '<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;">' +
      '<div><div class="muted" style="font-size:12px;">TODAY\'S TOTAL</div>' +
        '<div style="font-size:26px;font-weight:bold;color:#dc2626;">₱' + total.toFixed(2) + '</div></div>' +
      '<button class="btn btn-primary" style="width:auto;padding:12px 18px;margin:0;" onclick="renderAddExpenseForm()">+ Add</button>' +
    '</div>' +
    '<div class="card">' + listHtml + '</div>' +
    '</div>';
}

function renderAddExpenseForm(msg) {
  var today    = new Date().toISOString().substring(0, 10);
  var catsHtml = EXPENSE_CATEGORIES.map(function(c) {
    return '<option value="' + c.value + '">' + c.label + '</option>';
  }).join('');
  var firstHint = EXPENSE_CATEGORIES[0].hint;

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">+ Record Expense</div>' +
    '<button class="small-btn" onclick="renderExpenses()">Back</button></div>' +
    (msg ? '<div class="message message-error">' + msg + '</div>' : '') +
    '<div class="card">' +
      '<div class="field"><label>Date</label>' +
        '<input id="exp-date" type="date" value="' + today + '"></div>' +

      '<div class="field"><label>Category</label>' +
        '<select id="exp-cat" onchange="updateExpenseCategoryHint()">' + catsHtml + '</select>' +
        '<div id="exp-cat-hint" style="font-size:12px;color:#6b7280;margin-top:4px;padding:6px 8px;' +
          'background:#f9fafb;border-radius:6px;">' + firstHint + '</div>' +
      '</div>' +

      '<div class="field"><label>Description *</label>' +
        '<div style="display:flex;gap:6px;align-items:stretch;">' +
          '<input id="exp-desc" placeholder="e.g. Bought ice, Meralco bill" style="flex:1;min-width:0;">' +
          '<button id="voice-btn-exp-desc" onclick="startVoiceInput(\'exp-desc\')" ' +
            'style="background:#7c3aed;color:#fff;border:none;padding:0 12px;border-radius:8px;font-size:20px;cursor:pointer;flex-shrink:0;">🎤</button>' +
        '</div></div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">' +
        '<div class="field" style="margin:0;"><label>Quantity</label>' +
          '<input id="exp-qty" type="number" step="1" min="1" value="1" inputmode="numeric" ' +
            'oninput="calcExpenseAmount()"></div>' +
        '<div class="field" style="margin:0;"><label>Unit Price (₱)</label>' +
          '<input id="exp-unit-price" type="number" step="0.01" placeholder="0.00" inputmode="decimal" ' +
            'oninput="calcExpenseAmount()"></div>' +
      '</div>' +

      '<div class="field">' +
        '<label>Total Amount (₱) *</label>' +
        '<input id="exp-amount" type="number" step="0.01" placeholder="Auto-calculated or enter directly" ' +
          'inputmode="decimal" style="font-size:18px;font-weight:bold;background:#f0fdf4;"></div>' +

      '<div class="field"><label>Payment Method</label>' +
        '<select id="exp-pay"><option>Cash</option><option>GCash</option><option>Maya</option><option>Credit</option></select></div>' +

      '<button class="btn btn-primary" onclick="submitExpense()">Save Expense</button>' +
    '</div></div>';
}

function updateExpenseCategoryHint() {
  var sel  = document.getElementById('exp-cat');
  var hint = document.getElementById('exp-cat-hint');
  if (!sel || !hint) return;
  var cat = EXPENSE_CATEGORIES.find(function(c) { return c.value === sel.value; });
  hint.textContent = cat ? cat.hint : '';
}

function calcExpenseAmount() {
  var qty   = Number((document.getElementById('exp-qty')        || {}).value) || 0;
  var price = Number((document.getElementById('exp-unit-price') || {}).value) || 0;
  var amtEl = document.getElementById('exp-amount');
  if (qty > 0 && price > 0 && amtEl) {
    amtEl.value = (qty * price).toFixed(2);
  }
}

async function submitExpense() {
  var desc   = (document.getElementById('exp-desc')   || {}).value || '';
  var amount = (document.getElementById('exp-amount') || {}).value || '';
  var qty    = Number((document.getElementById('exp-qty')        || {}).value) || 1;
  var uPrice = Number((document.getElementById('exp-unit-price') || {}).value) || 0;
  if (!desc.trim())        { _showToast('Description is required', true); return; }
  if (Number(amount) <= 0) { _showToast('Amount must be greater than zero', true); return; }

  // Build description suffix if qty/unit price were filled
  var descFull = desc.trim();
  if (qty > 1 || uPrice > 0) {
    descFull += ' (' + qty + ' × ₱' + uPrice.toFixed(2) + ')';
  }

  var payload = {
    Expense_Date:     (document.getElementById('exp-date') || {}).value || new Date().toISOString().substring(0,10),
    Expense_Category: (document.getElementById('exp-cat')  || {}).value || 'Others',
    Description:      descFull,
    Amount:           Number(amount),
    Payment_Method:   (document.getElementById('exp-pay')  || {}).value || 'Cash',
    Quantity:         qty,
    Unit_Price:       uPrice
  };

  // Offline path
  if (!navigator.onLine) {
    try {
      await DB.addToSyncQueue({ action: 'createExpense', data: payload });
      _showToast('Expense saved offline — will sync when online', false);
      renderExpenses();
    } catch(e) { _showToast('Failed to save offline', true); }
    return;
  }

  // Online path
  showLoading('Saving expense…');
  try {
    await API.call('createExpense', payload);
    _showToast('Expense recorded!', false);
    renderExpenses();
  } catch(err) { renderAddExpenseForm(err.message || String(err)); }
}

// ── Reports ───────────────────────────────────────────────────────────────────

function renderReports() {
  var today   = new Date();
  var yyyy    = today.getFullYear();
  var mm      = String(today.getMonth() + 1).padStart(2, '0');
  var dd      = String(today.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;

  // Quarter date range
  var q        = Math.ceil((today.getMonth() + 1) / 3);
  var qFrom    = yyyy + '-' + String((q - 1) * 3 + 1).padStart(2, '0') + '-01';
  var qLastMo  = new Date(yyyy, q * 3, 0);
  var qTo      = yyyy + '-' + String(q * 3).padStart(2, '0') + '-' + qLastMo.getDate();

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📊 Reports</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +

    '<div class="card">' +
      '<div class="subtitle" style="margin-bottom:10px;">Select Report Period</div>' +
      '<button class="big-btn" style="margin-bottom:8px;" onclick="loadReport(\'daily\',\'' + todayStr + '\')">📅 Daily — Today</button>' +
      '<button class="big-btn" style="margin-bottom:8px;" onclick="loadReport(\'weekly\')">📆 Weekly — This Week</button>' +
      '<button class="big-btn" style="margin-bottom:8px;" onclick="loadReport(\'monthly\',' + yyyy + ',' + (today.getMonth()+1) + ')">🗓 Monthly — This Month</button>' +
      '<button class="big-btn" style="margin-bottom:8px;" onclick="loadReport(\'period\',\'' + qFrom + '\',\'' + qTo + '\')">📊 Quarterly — Q' + q + ' ' + yyyy + '</button>' +
      '<button class="big-btn" style="margin-bottom:8px;" onclick="loadReport(\'period\',\'' + yyyy + '-01-01\',\'' + yyyy + '-12-31\')">📈 Yearly — ' + yyyy + '</button>' +
    '</div>' +

    '<div class="card">' +
      '<div class="subtitle" style="margin-bottom:10px;">Custom Date</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
        '<div><label style="font-size:12px;font-weight:bold;display:block;margin-bottom:4px;">From</label>' +
          '<input type="date" id="rpt-from" value="' + todayStr + '" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;"></div>' +
        '<div><label style="font-size:12px;font-weight:bold;display:block;margin-bottom:4px;">To</label>' +
          '<input type="date" id="rpt-to" value="' + todayStr + '" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;"></div>' +
      '</div>' +
      '<button class="btn btn-primary" onclick="loadReport(\'period\',document.getElementById(\'rpt-from\').value,document.getElementById(\'rpt-to\').value)">View Custom Report</button>' +
    '</div></div>';
}

async function loadReport(type, a, b) {
  showLoading('Generating report…');
  try {
    var data;
    if      (type === 'daily')   data = await API.call('getDailyReport',   { date: a });
    else if (type === 'weekly')  data = await API.call('getWeeklyReport',  {});
    else if (type === 'monthly') data = await API.call('getMonthlyReport', { year: a, month: b });
    else                         data = await API.call('getPeriodReport',  { dateFrom: a, dateTo: b });
    renderReportScreen(type, data);
  } catch(e) {
    _showToast('Error: ' + e.message, true);
    renderReports();
  }
}

function renderReportScreen(type, d) {
  var s      = d.summary;
  var title  = type === 'daily'   ? '📅 ' + d.date
             : type === 'weekly'  ? '📆 ' + d.dateFrom + ' → ' + d.dateTo
             : type === 'monthly' ? '🗓 ' + _monthName(d.month) + ' ' + d.year
             : '📊 ' + d.dateFrom + ' → ' + d.dateTo;

  function money(v) { return '₱' + Number(v || 0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}); }

  // ── Summary cards ──
  var summaryHtml =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
      _rptCard('💰 Revenue',      money(s.revenue),      '#16a34a') +
      _rptCard('🧾 Transactions', s.txCount + ' sales',  '#2563eb') +
      _rptCard('📦 Items Sold',   s.totalQty + ' pcs',   '#7c3aed') +
      _rptCard('📊 Avg Sale',     money(s.avgTx),        '#0891b2') +
      _rptCard('🏭 Cost of Goods', money(s.cogs),        '#6b7280') +
      _rptCard('💚 Gross Profit', money(s.grossProfit),  '#16a34a') +
      _rptCard('💸 Expenses',     money(s.totalExpenses),'#dc2626') +
      _rptCard('🏆 Net Profit',   money(s.netProfit), s.netProfit >= 0 ? '#16a34a' : '#dc2626') +
    '</div>';

  // ── Top Products ──
  var topHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:10px;">🏆 Top Products</div>';
  if (d.topProducts && d.topProducts.length) {
    d.topProducts.forEach(function(p, i) {
      topHtml += '<div style="display:flex;justify-content:space-between;align-items:center;' +
        'padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
        '<div><span style="color:#9ca3af;font-size:12px;">#' + (i+1) + ' </span>' +
        '<strong style="font-size:13px;">' + p.name + '</strong>' +
        '<span class="muted" style="font-size:12px;"> · ' + p.qty + ' pcs</span></div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:13px;font-weight:bold;color:#16a34a;">' + money(p.revenue) + '</div>' +
          '<div style="font-size:11px;color:#6b7280;">profit ' + money(p.profit) + '</div>' +
        '</div></div>';
    });
  } else { topHtml += '<div class="muted">No sales in this period.</div>'; }
  topHtml += '</div>';

  // ── Expense Breakdown ──
  var expHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:10px;">💸 Expenses by Category</div>';
  if (d.expenseBreakdown && d.expenseBreakdown.length) {
    d.expenseBreakdown.forEach(function(e) {
      expHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
        '<span style="font-size:13px;">' + e.category + '</span>' +
        '<strong style="color:#dc2626;font-size:13px;">' + money(e.amount) + '</strong></div>';
    });
    expHtml += '<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:bold;">' +
      '<span>Total</span><span style="color:#dc2626;">' + money(s.totalExpenses) + '</span></div>';
  } else { expHtml += '<div class="muted">No expenses in this period.</div>'; }
  expHtml += '</div>';

  // ── Period breakdown (daily → hourly, weekly → daily, monthly/period → monthly) ──
  var breakdownHtml = '';
  if (type === 'daily' && d.hourlySales && d.hourlySales.length) {
    breakdownHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:10px;">🕐 Sales by Hour</div>';
    d.hourlySales.forEach(function(h) {
      breakdownHtml += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;">' +
        '<span style="font-size:13px;">' + h.hour + '</span>' +
        '<span style="font-size:13px;">' + h.count + ' tx · <strong>' + money(h.revenue) + '</strong></span></div>';
    });
    breakdownHtml += '</div>';
  } else if (type === 'weekly' && d.dailyBreakdown) {
    breakdownHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:10px;">📆 Daily Breakdown</div>';
    if (d.bestDay) breakdownHtml += '<div style="background:#dcfce7;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:13px;">' +
      '🏆 Best day: <strong>' + d.bestDay.date + '</strong> — ' + money(d.bestDay.revenue) + '</div>';
    d.dailyBreakdown.forEach(function(day) {
      breakdownHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
        '<div><div style="font-size:13px;font-weight:bold;">' + _formatDate(day.date) + '</div>' +
          '<div style="font-size:11px;color:#6b7280;">' + day.count + ' transactions</div></div>' +
        '<div style="text-align:right;"><div style="font-size:13px;font-weight:bold;">' + money(day.revenue) + '</div>' +
          '<div style="font-size:11px;color:#16a34a;">profit ' + money(day.grossProfit) + '</div></div></div>';
    });
    breakdownHtml += '</div>';
  } else if ((type === 'monthly' || type === 'period') && d.monthlyBreakdown) {
    breakdownHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:10px;">📅 Monthly Breakdown</div>';
    if (d.bestMonth) breakdownHtml += '<div style="background:#dcfce7;border-radius:8px;padding:8px 10px;margin-bottom:4px;font-size:13px;">🏆 Best: <strong>' + d.bestMonth.month + '</strong> — ' + money(d.bestMonth.revenue) + '</div>';
    if (d.worstMonth && d.monthlyBreakdown.length > 1) breakdownHtml += '<div style="background:#fee2e2;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:13px;">📉 Lowest: <strong>' + d.worstMonth.month + '</strong> — ' + money(d.worstMonth.revenue) + '</div>';
    d.monthlyBreakdown.forEach(function(m) {
      breakdownHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
        '<div><div style="font-size:13px;font-weight:bold;">' + m.month + '</div>' +
          '<div style="font-size:11px;color:#6b7280;">' + m.count + ' transactions</div></div>' +
        '<div style="text-align:right;"><div style="font-size:13px;font-weight:bold;">' + money(m.revenue) + '</div>' +
          '<div style="font-size:11px;color:#16a34a;">profit ' + money(m.grossProfit) + '</div></div></div>';
    });
    breakdownHtml += '</div>';
  }

  // ── Low stock ──
  var lowStockHtml = '';
  if (type === 'daily' && d.lowStock && d.lowStock.length) {
    lowStockHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:10px;">⚠ Low Stock Alert</div>';
    d.lowStock.forEach(function(p) {
      var color = p.stock === 0 ? '#dc2626' : '#d97706';
      lowStockHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
        '<span style="font-size:13px;">' + p.name + '</span>' +
        '<span style="font-size:13px;font-weight:bold;color:' + color + ';">' +
          (p.stock === 0 ? 'OUT OF STOCK' : p.stock + ' left') + '</span></div>';
    });
    lowStockHtml += '</div>';
  }

  // ── Dead stock (monthly only) ──
  var deadStockHtml = '';
  if (type === 'monthly' && d.deadStock && d.deadStock.length) {
    deadStockHtml = '<div class="card"><div class="title" style="font-size:16px;margin-bottom:6px;">💤 No Sales This Month</div>' +
      '<div class="muted" style="font-size:12px;margin-bottom:8px;">Consider discounting or removing these items:</div>';
    d.deadStock.slice(0, 10).forEach(function(p) {
      deadStockHtml += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;">' +
        '<span style="font-size:13px;">' + p.name + '</span>' +
        '<span class="muted" style="font-size:12px;">' + p.stock + ' in stock</span></div>';
    });
    deadStockHtml += '</div>';
  }

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar" style="flex-wrap:wrap;gap:4px;">' +
      '<div style="font-size:14px;font-weight:bold;">' + title + '</div>' +
      '<button class="small-btn" onclick="renderReports()">← Back</button>' +
    '</div>' +
    '<div class="card">' + summaryHtml + '</div>' +
    breakdownHtml +
    topHtml +
    expHtml +
    lowStockHtml +
    deadStockHtml +
    '</div>';
}

function _rptCard(label, value, color) {
  return '<div style="background:#f9fafb;border-radius:10px;padding:12px;text-align:center;">' +
    '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">' + label + '</div>' +
    '<div style="font-size:15px;font-weight:bold;color:' + color + ';">' + value + '</div>' +
    '</div>';
}

function _monthName(m) {
  return ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m] || m;
}

function _formatDate(dateStr) {
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var d = new Date(dateStr + 'T00:00:00');
  return days[d.getDay()] + ' ' + dateStr;
}

function renderSettings() {
  document.getElementById('app').innerHTML =
    '<div class="screen"><div class="topbar"><div class="title">⚙️ Settings</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +
    '<div class="card"><p>Coming soon…</p></div></div>';
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function renderChat() {
  showLoading('Loading chat…');
  try {
    var staff    = await API.call('getStaffChatMessages');
    var customer = await API.call('getCustomerChatMessages');
    renderChatScreen(staff.messages || [], customer.messages || []);
  } catch(e) { renderChatScreen([], []); }
}

function renderChatScreen(staffMsgs, customerMsgs) {
  var staffHtml = staffMsgs.map(function(m) {
    return '<div class="chat-msg"><div class="chat-meta"><strong>' + m.From_Name + '</strong></div>' +
      '<div class="chat-text">' + m.Message + '</div>' +
      '<div class="chat-time">' + new Date(m.Created_At).toLocaleString() + '</div></div>';
  }).join('') || '<div class="muted">No staff messages</div>';

  var custHtml = customerMsgs.map(function(m) {
    return '<div class="chat-msg"><div class="chat-meta"><strong>' + (m.Customer_Name || 'Unknown') + '</strong></div>' +
      '<div class="chat-text">' + m.Message + '</div>' +
      '<div class="chat-time">' + new Date(m.Created_At).toLocaleString() + '</div></div>';
  }).join('') || '<div class="muted">No customer messages</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title">💬 Chat</div><button class="small-btn" onclick="goHome()">Back</button></div>' +
    '<div class="card"><div class="subtitle">Staff Chat</div>' + staffHtml +
    '<div class="field" style="margin-top:12px;"><input id="staff-msg" placeholder="Message staff…">' +
    '<button class="btn btn-primary" style="margin-top:8px;" onclick="sendStaffMsg()">Send</button></div></div>' +
    '<div class="card"><div class="subtitle">Customer Chat</div>' + custHtml +
    '<div class="field" style="margin-top:12px;"><input id="cust-msg" placeholder="Message customer…">' +
    '<button class="btn btn-primary" style="margin-top:8px;" onclick="sendCustMsg()">Send</button></div></div>' +
    '</div>';
}

async function sendStaffMsg() {
  var msg = document.getElementById('staff-msg').value.trim();
  if (!msg) return;
  try { await API.call('sendStaffMessage', { toUserId: '', message: msg }); renderChat(); }
  catch(e) { _showToast('Error: ' + e.message, true); }
}

async function sendCustMsg() {
  var msg = document.getElementById('cust-msg').value.trim();
  if (!msg) return;
  try { await API.call('sendCustomerMessage', { customerId: '', customerName: '', customerEmail: '', message: msg }); renderChat(); }
  catch(e) { _showToast('Error: ' + e.message, true); }
}

// ── Barcode Scanner (inline overlay, no popup window) ────────────────────────

var _scanMode      = null;
var _barcodeStream = null;
var _barcodeTimer  = null;
var _barcodeSent   = false;

function openScannerModal(mode) {
  _scanMode   = mode || 'quickSell';
  _barcodeSent = false;
  var overlay = document.getElementById('barcode-overlay');
  overlay.style.display = 'flex';
  document.getElementById('scan-manual-input').value = '';
  document.getElementById('barcode-status').textContent = 'Point camera at barcode…';
  _startBarcodeCamera();
}

function closeScannerModal() {
  document.getElementById('barcode-overlay').style.display = 'none';
  _stopBarcodeCamera();
}

function submitManualScan() {
  var val = document.getElementById('scan-manual-input').value.trim();
  if (!val) return;
  closeScannerModal();
  _onBarcodeReceived(val);
}

async function _startBarcodeCamera() {
  var video  = document.getElementById('barcode-video');
  var status = document.getElementById('barcode-status');
  try {
    _barcodeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = _barcodeStream;
  } catch(e) {
    status.textContent = '⚠ Camera not accessible. Type barcode below.';
    return;
  }

  // Native BarcodeDetector (Chrome Android 83+) — fastest
  if (typeof BarcodeDetector !== 'undefined') {
    var detector = new BarcodeDetector();
    _barcodeTimer = setInterval(async function() {
      if (_barcodeSent || video.readyState < 2) return;
      try {
        var results = await detector.detect(video);
        if (results.length > 0) {
          _barcodeSent = true;
          status.textContent = '✅ ' + results[0].rawValue;
          clearInterval(_barcodeTimer); _barcodeTimer = null;
          setTimeout(function() {
            closeScannerModal();
            _onBarcodeReceived(results[0].rawValue);
          }, 250);
        }
      } catch(e) {}
    }, 150);
    return;
  }

  // Fallback: load html5-qrcode from CDN
  status.textContent = 'Loading scanner…';
  if (typeof Html5Qrcode === 'undefined') {
    await new Promise(function(res, rej) {
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  // Stop our own camera stream first — html5-qrcode manages its own
  _stopBarcodeCamera();
  var scannerDiv = document.getElementById('barcode-reader-div');
  scannerDiv.innerHTML = '';
  var qr = new Html5Qrcode('barcode-reader-div');
  _barcodeTimer = qr; // store so we can stop it
  status.textContent = 'Point camera at barcode…';
  qr.start(
    { facingMode: 'environment' },
    { fps: 12, qrbox: { width: 260, height: 100 } },
    function(decoded) {
      if (_barcodeSent) return;
      _barcodeSent = true;
      status.textContent = '✅ ' + decoded;
      qr.stop().catch(function(){}).finally(function() {
        closeScannerModal();
        _onBarcodeReceived(decoded);
      });
    },
    function() {}
  ).catch(function(e) {
    status.textContent = '⚠ Camera error. Type barcode below.';
  });
}

function _stopBarcodeCamera() {
  if (_barcodeTimer) {
    if (typeof _barcodeTimer === 'number') clearInterval(_barcodeTimer);
    else if (_barcodeTimer.stop) _barcodeTimer.stop().catch(function(){});
    _barcodeTimer = null;
  }
  if (_barcodeStream) {
    _barcodeStream.getTracks().forEach(function(t) { t.stop(); });
    _barcodeStream = null;
  }
  var video = document.getElementById('barcode-video');
  if (video) video.srcObject = null;
}

function _onBarcodeReceived(barcode) {
  _playBeep();
  if (_scanMode === 'addProduct') {
    var inp = document.getElementById('p-barcode');
    if (inp) { inp.value = barcode; _showToast('Barcode: ' + barcode, false); }
  } else {
    var product = state.products.find(function(p) {
      return String(p.Barcode || '').trim() === String(barcode).trim();
    });
    if (product) {
      addToCart(product.Product_ID);
      _showToast('Added: ' + product.Product_Name, false);
    } else if (navigator.onLine) {
      API.call('getProductByBarcode', { barcode: barcode }).then(function(p) {
        if (p && p.Product_ID) {
          if (!state.products.find(function(x) { return x.Product_ID === p.Product_ID; }))
            state.products.push(p);
          addToCart(p.Product_ID);
          _showToast('Added: ' + p.Product_Name, false);
        } else {
          _showToast('Product not found: ' + barcode, true);
        }
      }).catch(function() { _showToast('Product not found: ' + barcode, true); });
    } else {
      _showToast('Product not in offline list: ' + barcode, true);
    }
  }
}

function _playBeep() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var g   = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.frequency.value = 1200; osc.type = 'sine'; g.gain.value = 0.3;
    osc.start(); setTimeout(function() { osc.stop(); }, 150);
  } catch(e) {}
}

// ── Start ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', function() {
  boot().catch(function(err) {
    console.error('Boot error:', err);
    renderLogin('Startup error: ' + err.message);
  });
});
