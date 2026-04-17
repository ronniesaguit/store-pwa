// app.js — Store Management PWA main logic

var SCANNER_URL = 'https://ronniesaguit.github.io/store-pwa/scanner.html';

var state = {
  session: null,
  products: [],
  categories: [],
  cart: [],
  isOffline: false,
  storeProfile: null,
  lastReceipt: null,  // holds last completed sale data for printing
  lastReport:  null,  // holds last viewed report data for printing
  lastBIRData: null   // holds last generated BIR data for printing
};

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  // Force indicator to upper-left regardless of cached CSS
  var ind = document.getElementById('sync-indicator');
  if (ind) { ind.style.left = '10px'; ind.style.right = 'auto'; }

  // If no store key is configured, show setup screen
  if (!STORE_KEY) {
    showNoStoreKey();
    return;
  }

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

      try { state.storeProfile = await API.call('getStoreProfile'); } catch(e2) {}
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
    '<button class="big-btn" onclick="renderSettings()">⚙️ Settings</button>' +
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

  // Capture cart snapshot BEFORE clearing for receipt printing
  var cartSnapshot = state.cart.slice();

  var salePayload = {
    items: state.cart.map(function(i) { return { productId: i.id, qty: i.qty }; }),
    amountPaid: paid,
    paymentMethod: method
  };

  try {
    var saleResult = null;
    if (navigator.onLine) {
      saleResult = await API.call('createSale', salePayload);
    } else {
      await DB.addToSyncQueue({ action: 'createSale', data: salePayload });
    }
    state.cart = [];
    renderReceiptModal(cartSnapshot, total, paid, method, saleResult);
  } catch(err) {
    try {
      await DB.addToSyncQueue({ action: 'createSale', data: salePayload });
      state.cart = [];
      renderReceiptModal(cartSnapshot, total, paid, method, null);
    } catch(e2) {
      _showToast('Error: ' + (err.message || String(err)), true);
      renderQuickSell();
    }
  }
}

function renderReceiptModal(cartItems, total, paid, method, saleResult) {
  state.lastReceipt = { cartItems: cartItems, total: total, paid: paid, method: method, saleResult: saleResult };
  var change    = paid - total;
  var receiptNo = saleResult ? saleResult.receiptNo : '(offline)';
  var now       = new Date();
  var dateStr   = now.toLocaleDateString('en-PH');
  var timeStr   = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  var cashier   = state.session && state.session.user ? state.session.user.Full_Name : '';

  function money(v) { return '₱' + Number(v||0).toFixed(2); }

  var itemRows = cartItems.map(function(i) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;">' +
      '<span>' + i.qty + 'x ' + i.name + '</span>' +
      '<span>' + money(i.total) + '</span></div>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🧾 Receipt</div></div>' +

    '<div class="card" style="font-family:monospace;">' +
    '<div style="text-align:center;margin-bottom:10px;">' +
    '<div style="font-weight:bold;font-size:15px;">' + (state.storeProfile ? state.storeProfile.storeName : 'Store') + '</div>' +
    (state.storeProfile && state.storeProfile.address ? '<div style="font-size:12px;color:#6b7280;">' + state.storeProfile.address + '</div>' : '') +
    (state.storeProfile && state.storeProfile.phone   ? '<div style="font-size:12px;color:#6b7280;">' + state.storeProfile.phone + '</div>' : '') +
    '</div>' +
    '<div style="border-top:1px dashed #ccc;margin:8px 0;"></div>' +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">' +
    'Receipt#: <strong>' + receiptNo + '</strong><br>' +
    dateStr + ' ' + timeStr + '<br>' +
    (cashier ? 'Cashier: ' + cashier : '') +
    '</div>' +
    '<div style="border-top:1px dashed #ccc;margin:8px 0;"></div>' +
    itemRows +
    '<div style="border-top:1px dashed #ccc;margin:8px 0;"></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold;padding:4px 0;">' +
      '<span>TOTAL</span><span>' + money(total) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:14px;padding:2px 0;">' +
      '<span>Cash (' + method + ')</span><span>' + money(paid) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;color:#16a34a;padding:2px 0;">' +
      '<span>CHANGE</span><span>' + money(change) + '</span></div>' +
    '<div style="border-top:1px dashed #ccc;margin:8px 0;"></div>' +
    '<div style="text-align:center;font-size:11px;color:#9ca3af;">*UNOFFICIAL RECEIPT*<br>Not a BIR official receipt</div>' +
    '</div>' +

    '<button class="btn btn-primary" style="margin-top:4px;" onclick="printLastReceipt()">🖨️ Print / Save as PDF</button>' +
    '<button class="btn btn-secondary" onclick="renderQuickSell()">✅ New Sale</button>' +
    '</div>';
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
  { value: 'Store Rental',       label: 'Store Rental',       hint: 'Monthly rent for the store space…' },
  { value: 'Salaries/Wages',     label: 'Salaries/Wages',     hint: 'Staff pay — salbahis, daily wage, or monthly salary…' },
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
      '<button class="big-btn" style="margin-bottom:8px;background:#1e3a5f;color:#fff;" onclick="renderBIRData()">🏛️ BIR Filing Data</button>' +
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
    var data, fixedCosts;
    if      (type === 'daily')   data = await API.call('getDailyReport',   { date: a });
    else if (type === 'weekly')  data = await API.call('getWeeklyReport',  {});
    else if (type === 'monthly') data = await API.call('getMonthlyReport', { year: a, month: b });
    else                         data = await API.call('getPeriodReport',  { dateFrom: a, dateTo: b });
    try { fixedCosts = await API.call('getFixedCosts'); } catch(e2) { fixedCosts = { rent: 0, salaries: [], otherFixed: 0 }; }
    renderReportScreen(type, data, fixedCosts);
  } catch(e) {
    _showToast('Error: ' + e.message, true);
    renderReports();
  }
}

function renderReportScreen(type, d, fixedCosts) {
  var s      = d.summary;
  var title  = type === 'daily'   ? '📅 ' + d.date
             : type === 'weekly'  ? '📆 ' + d.dateFrom + ' → ' + d.dateTo
             : type === 'monthly' ? '🗓 ' + _monthName(d.month) + ' ' + d.year
             : '📊 ' + d.dateFrom + ' → ' + d.dateTo;

  fixedCosts = fixedCosts || { rent: 0, salaries: [], otherFixed: 0 };

  function money(v) { return '₱' + Number(v || 0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function pct(v)   { return (v || 0).toFixed(1) + '%'; }

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

  // ── Health Indicators ──
  var salaryTotal = (fixedCosts.salaries || []).reduce(function(t, x) { return t + Number(x.amount || 0); }, 0);
  var monthlyFixed = Number(fixedCosts.rent || 0) + salaryTotal + Number(fixedCosts.otherFixed || 0);

  // Scale fixed costs to the report period
  var periodDays = 30;
  if (type === 'daily')   periodDays = 1;
  else if (type === 'weekly') periodDays = 7;
  else if (type === 'monthly') periodDays = 30;
  else {
    var msPerDay = 86400000;
    var df = new Date((d.dateFrom || '').replace(/-/g,'/'));
    var dt = new Date((d.dateTo   || '').replace(/-/g,'/'));
    if (!isNaN(df) && !isNaN(dt)) periodDays = Math.max(1, Math.round((dt - df) / msPerDay) + 1);
  }
  var scaledFixed = monthlyFixed * periodDays / 30;

  var gpm   = s.revenue > 0 ? (s.grossProfit / s.revenue) * 100 : 0;   // Gross Profit Margin %
  var npm   = s.revenue > 0 ? (s.netProfit   / s.revenue) * 100 : 0;   // Net Profit Margin %
  var exr   = s.revenue > 0 ? (s.totalExpenses / s.revenue) * 100 : 0; // Expense Ratio %
  var breakEven = gpm > 0 ? (scaledFixed / (gpm / 100)) : 0;           // Revenue needed to cover fixed costs
  var beStatus  = breakEven <= 0 ? 'N/A' : s.revenue >= breakEven ? 'ABOVE' : 'BELOW';
  var dailyTarget = monthlyFixed > 0 ? (monthlyFixed / 30 / (gpm > 0 ? gpm / 100 : 1)) : 0;

  function gpmColor(v)  { return v >= 30 ? '#16a34a' : v >= 15 ? '#d97706' : '#dc2626'; }
  function npmColor(v)  { return v >= 10 ? '#16a34a' : v >= 0  ? '#d97706' : '#dc2626'; }
  function exrColor(v)  { return v <= 40 ? '#16a34a' : v <= 60 ? '#d97706' : '#dc2626'; }
  function beColor(st)  { return st === 'ABOVE' ? '#16a34a' : st === 'BELOW' ? '#dc2626' : '#6b7280'; }
  function beEmoji(st)  { return st === 'ABOVE' ? '🟢' : st === 'BELOW' ? '🔴' : '⚪'; }

  var healthHtml = '<div class="card"><div class="title" style="font-size:15px;margin-bottom:10px;">📈 Business Health Indicators</div>';

  if (monthlyFixed <= 0) {
    healthHtml += '<div style="background:#fef9c3;border-radius:8px;padding:10px;font-size:13px;color:#854d0e;margin-bottom:10px;">' +
      '⚙️ <strong>Set your Monthly Fixed Costs</strong> in Settings to unlock Break-Even analysis.</div>';
  }

  healthHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    _rptCard('📊 Gross Margin',   pct(gpm),  gpmColor(gpm), gpm >= 30 ? 'Healthy (≥30%)' : gpm >= 15 ? 'Moderate (≥15%)' : 'Low (<15%)') +
    _rptCard('💹 Net Margin',     pct(npm),  npmColor(npm), npm >= 10 ? 'Healthy (≥10%)' : npm >= 0  ? 'Slim (≥0%)'     : 'Loss!') +
    _rptCard('💸 Expense Ratio',  pct(exr),  exrColor(exr), exr <= 40 ? 'Controlled (≤40%)' : exr <= 60 ? 'High (≤60%)' : 'Very High') +
    _rptCard('🎯 Break-Even',     monthlyFixed > 0 ? money(breakEven) : '—', beColor(beStatus),
             monthlyFixed > 0 ? beEmoji(beStatus) + ' ' + (beStatus === 'N/A' ? 'Set fixed costs' : beStatus + ' break-even') : 'Set fixed costs in Settings') +
  '</div>';

  if (monthlyFixed > 0) {
    var fcRow = function(label, val) {
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">' +
        '<span style="color:#6b7280;">' + label + '</span><strong>' + money(val) + '</strong></div>';
    };
    healthHtml += '<div style="margin-top:10px;background:#f9fafb;border-radius:8px;padding:10px;">' +
      '<div style="font-size:12px;font-weight:bold;color:#374151;margin-bottom:6px;">Cost Structure (' + periodDays + '-day period)</div>' +
      fcRow('Rent (scaled)',    fixedCosts.rent * periodDays / 30) +
      (fixedCosts.salaries || []).map(function(s2) {
        return fcRow(s2.name, s2.amount * periodDays / 30);
      }).join('') +
      fcRow('Other Fixed',     fixedCosts.otherFixed * periodDays / 30) +
      fcRow('Variable Expenses', s.totalExpenses) +
      '<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;font-weight:bold;">' +
        '<span>Total Costs</span><span style="color:#dc2626;">' + money(scaledFixed + s.totalExpenses) + '</span></div>' +
      (dailyTarget > 0 ? '<div style="font-size:12px;color:#6b7280;margin-top:4px;">Daily revenue target to break even: <strong style="color:#2563eb;">' + money(dailyTarget) + '/day</strong></div>' : '') +
    '</div>';
  }
  healthHtml += '</div>';

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

  state.lastReport = { type: type, d: d };

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar" style="flex-wrap:wrap;gap:4px;">' +
      '<div style="font-size:14px;font-weight:bold;">' + title + '</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="small-btn" onclick="printLastReport()">📄 PDF</button>' +
        '<button class="small-btn" onclick="renderReports()">← Back</button>' +
      '</div>' +
    '</div>' +
    '<div class="card">' + summaryHtml + '</div>' +
    healthHtml +
    breakdownHtml +
    topHtml +
    expHtml +
    lowStockHtml +
    deadStockHtml +
    '</div>';
}

function _rptCard(label, value, color, detail) {
  return '<div style="background:#f9fafb;border-radius:10px;padding:12px;text-align:center;">' +
    '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">' + label + '</div>' +
    '<div style="font-size:15px;font-weight:bold;color:' + color + ';">' + value + '</div>' +
    (detail ? '<div style="font-size:10px;color:#6b7280;margin-top:3px;">' + detail + '</div>' : '') +
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

async function renderSettings() {
  showLoading('Loading settings…');
  var fc = { rent: 0, salaries: [], otherFixed: 0 };
  try { fc = await API.call('getFixedCosts'); } catch(e) {}
  _renderFixedCostsForm(fc);
}

function _renderFixedCostsForm(fc) {
  var salaries = (fc.salaries || []);
  var salaryRows = salaries.map(function(s, i) { return _salaryRowHtml(i, s.name, s.amount); }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">⚙️ Settings</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +

    '<div class="card">' +
    '<div class="subtitle" style="margin-bottom:4px;">Monthly Fixed Costs</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:14px;">These are costs the store pays every month regardless of sales. Used to compute Break-Even.</div>' +

    '<div class="field"><label>Store Rent (₱/month)</label>' +
    '<input id="fc-rent" type="number" min="0" step="1" value="' + (fc.rent || 0) + '" placeholder="0"></div>' +

    '<div class="field"><label>Other Fixed Costs (₱/month)</label>' +
    '<input id="fc-other" type="number" min="0" step="1" value="' + (fc.otherFixed || 0) + '" placeholder="0">' +
    '<div class="muted" style="font-size:12px;margin-top:4px;">e.g. loan amortization, annual fees averaged monthly</div></div>' +

    '<div class="field"><label>Salaries / Wages</label>' +
    '<div id="fc-salary-list">' + salaryRows + '</div>' +
    '<button class="btn btn-secondary" style="margin-top:8px;" onclick="_addSalaryRow()">+ Add Person</button></div>' +

    '<button class="btn btn-primary" style="margin-top:8px;" onclick="saveFixedCostsSettings()">💾 Save Fixed Costs</button>' +
    '</div></div>';
}

function _salaryRowHtml(i, name, amount) {
  return '<div id="fc-sal-' + i + '" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">' +
    '<input placeholder="Name (e.g. Ate Nena)" style="flex:2;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;" value="' + (name || '') + '" id="fc-sal-name-' + i + '">' +
    '<input type="number" min="0" step="1" placeholder="₱/mo" style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;" value="' + (amount || '') + '" id="fc-sal-amt-' + i + '">' +
    '<button onclick="_removeSalaryRow(' + i + ')" style="padding:8px 12px;background:#fee2e2;border:none;border-radius:8px;cursor:pointer;font-size:16px;color:#dc2626;">✕</button>' +
    '</div>';
}

var _salaryRowCount = 0;
function _addSalaryRow() {
  var list = document.getElementById('fc-salary-list');
  if (!list) return;
  var idx = ++_salaryRowCount + 1000;
  var div = document.createElement('div');
  div.innerHTML = _salaryRowHtml(idx, '', '');
  list.appendChild(div.firstChild);
}

function _removeSalaryRow(i) {
  var row = document.getElementById('fc-sal-' + i);
  if (row) row.parentNode.removeChild(row);
}

async function saveFixedCostsSettings() {
  var rent      = Number(document.getElementById('fc-rent').value)  || 0;
  var otherFixed = Number(document.getElementById('fc-other').value) || 0;
  var salaries  = [];
  document.getElementById('fc-salary-list').querySelectorAll('[id^="fc-sal-name-"]').forEach(function(inp) {
    var idx = inp.id.replace('fc-sal-name-', '');
    var amtEl = document.getElementById('fc-sal-amt-' + idx);
    var name  = inp.value.trim();
    var amount = Number(amtEl ? amtEl.value : 0) || 0;
    if (name && amount > 0) salaries.push({ name: name, amount: amount });
  });
  try {
    await API.call('saveFixedCosts', { rent: rent, salaries: salaries, otherFixed: otherFixed });
    _showToast('Fixed costs saved!', false);
    renderSettings();
  } catch(e) {
    _showToast('Error: ' + e.message, true);
  }
}

// ── Print / PDF utilities ─────────────────────────────────────────────────────

function _openPrintWindow(title, htmlBody, extraStyles) {
  var w = window.open('', '_blank');
  if (!w) { _showToast('Allow pop-ups to print/save PDF', true); return; }
  var css = [
    '* { box-sizing:border-box; margin:0; padding:0; }',
    'body { font-family: Arial, sans-serif; font-size: 13px; color: #111; }',
    'table { width:100%; border-collapse:collapse; }',
    'th, td { border: 1px solid #ccc; padding: 6px 8px; text-align:left; }',
    'th { background:#1e3a5f; color:#fff; }',
    'tr:nth-child(even) { background:#f9fafb; }',
    '.center { text-align:center; }',
    '.right  { text-align:right; }',
    '.bold   { font-weight:bold; }',
    '.divider { border-top:1px dashed #999; margin:8px 0; }',
    '.no-print { display:none; }',
    '@media print { @page { margin: 12mm; } }',
    extraStyles || ''
  ].join('\n');
  w.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + title + '</title>' +
    '<style>' + css + '</style></head><body>' +
    '<div style="text-align:right;margin-bottom:12px;" class="no-print">' +
    '<button onclick="window.print()" style="padding:8px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Print / Save as PDF</button>' +
    '</div>' + htmlBody + '</body></html>'
  );
  w.document.close();
  w.focus();
}

// ── Receipt printing ──────────────────────────────────────────────────────────

function printLastReceipt() {
  var r = state.lastReceipt;
  if (!r) { _showToast('No receipt to print', true); return; }
  _printReceiptHtml(r.cartItems, r.total, r.paid, r.method, r.saleResult);
}

function _printReceiptHtml(cartItems, total, paid, method, saleResult) {
  var sp        = state.storeProfile || {};
  var change    = paid - total;
  var receiptNo = saleResult && saleResult.receiptNo ? saleResult.receiptNo : '(offline)';
  var now       = new Date();
  var dateStr   = now.toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' });
  var timeStr   = now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });
  var cashier   = state.session && state.session.user ? state.session.user.Full_Name : '';

  function money(v) { return '₱' + Number(v||0).toFixed(2); }

  var itemRows = cartItems.map(function(i) {
    return '<tr><td>' + i.qty + 'x ' + i.name + '</td><td class="right">' + money(i.total) + '</td></tr>';
  }).join('');

  var html =
    '<div style="max-width:280px;margin:0 auto;font-family:monospace;">' +
    '<div class="center" style="margin-bottom:8px;">' +
    '<div class="bold" style="font-size:15px;">' + (sp.storeName || 'Store') + '</div>' +
    (sp.address ? '<div style="font-size:11px;">' + sp.address + '</div>' : '') +
    (sp.phone   ? '<div style="font-size:11px;">' + sp.phone   + '</div>' : '') +
    (sp.receiptHeader ? '<div style="font-size:11px;margin-top:4px;">' + sp.receiptHeader + '</div>' : '') +
    '</div>' +
    '<div class="divider"></div>' +
    '<div style="font-size:11px;margin-bottom:6px;">' +
    'Receipt #: <strong>' + receiptNo + '</strong><br>' +
    'Date: ' + dateStr + '<br>Time: ' + timeStr +
    (cashier ? '<br>Cashier: ' + cashier : '') +
    '</div>' +
    '<div class="divider"></div>' +
    '<table style="border:none;"><tbody>' + itemRows + '</tbody></table>' +
    '<div class="divider"></div>' +
    '<table style="border:none;"><tbody>' +
    '<tr><td class="bold">TOTAL</td><td class="right bold">' + money(total) + '</td></tr>' +
    '<tr><td>Cash (' + method + ')</td><td class="right">' + money(paid) + '</td></tr>' +
    '<tr><td class="bold" style="color:#16a34a;">CHANGE</td><td class="right bold" style="color:#16a34a;">' + money(change) + '</td></tr>' +
    '</tbody></table>' +
    '<div class="divider"></div>' +
    '<div class="center" style="font-size:10px;color:#666;">' +
    '--- UNOFFICIAL RECEIPT ---<br>' +
    'This is NOT a BIR Official Receipt.<br>' +
    (sp.receiptFooter || 'Thank you for your purchase!') +
    '</div></div>';

  _openPrintWindow('Receipt ' + receiptNo, html,
    '@media print { @page { size: 80mm auto; margin: 4mm; } body { width:80mm; } }');
}

// ── Report printing ───────────────────────────────────────────────────────────

function printReport(type, d) {
  function money(v) { return '&#8369;' + Number(v||0).toLocaleString('en-PH', {minimumFractionDigits:2}); }
  function pct(v)   { return Number(v||0).toFixed(1) + '%'; }

  var sp    = state.storeProfile || {};
  var title = type === 'daily'   ? 'Daily Report — '   + d.date
            : type === 'weekly'  ? 'Weekly Report — '  + d.dateFrom + ' to ' + d.dateTo
            : type === 'monthly' ? 'Monthly Report — ' + _monthName(d.month) + ' ' + d.year
            : 'Period Report — ' + d.dateFrom + ' to ' + d.dateTo;
  var s = d.summary;

  // Header
  var html = '<h2 style="margin-bottom:4px;">' + (sp.storeName || 'Store') + '</h2>' +
    '<div style="color:#666;font-size:12px;margin-bottom:16px;">' + title + ' &nbsp;|&nbsp; Printed: ' + new Date().toLocaleDateString('en-PH') + '</div>';

  // Summary table
  html += '<h3 style="margin-bottom:8px;">Summary</h3>' +
    '<table><thead><tr><th>Metric</th><th class="right">Amount</th></tr></thead><tbody>' +
    '<tr><td>Total Revenue</td><td class="right">' + money(s.revenue) + '</td></tr>' +
    '<tr><td>Cost of Goods Sold</td><td class="right">' + money(s.cogs) + '</td></tr>' +
    '<tr><td>Gross Profit</td><td class="right bold">' + money(s.grossProfit) + '</td></tr>' +
    '<tr><td>Total Expenses</td><td class="right">' + money(s.totalExpenses) + '</td></tr>' +
    '<tr><td>Net Profit / (Loss)</td><td class="right bold" style="color:' + (s.netProfit >= 0 ? 'green' : 'red') + ';">' + money(s.netProfit) + '</td></tr>' +
    '<tr><td>Transactions</td><td class="right">' + s.txCount + '</td></tr>' +
    '<tr><td>Items Sold</td><td class="right">' + s.totalQty + ' pcs</td></tr>' +
    '<tr><td>Avg Sale Value</td><td class="right">' + money(s.avgTx) + '</td></tr>' +
    '</tbody></table>';

  // Health indicators
  var gpm = s.revenue > 0 ? (s.grossProfit / s.revenue * 100) : 0;
  var npm = s.revenue > 0 ? (s.netProfit   / s.revenue * 100) : 0;
  html += '<h3 style="margin:16px 0 8px;">Health Indicators</h3>' +
    '<table><tbody>' +
    '<tr><td>Gross Profit Margin</td><td class="right">' + pct(gpm) + '</td></tr>' +
    '<tr><td>Net Profit Margin</td><td class="right">' + pct(npm) + '</td></tr>' +
    '</tbody></table>';

  // Top products
  if (d.topProducts && d.topProducts.length) {
    html += '<h3 style="margin:16px 0 8px;">Top Products</h3>' +
      '<table><thead><tr><th>#</th><th>Product</th><th class="right">Qty</th><th class="right">Revenue</th><th class="right">Profit</th></tr></thead><tbody>' +
      d.topProducts.map(function(p, i) {
        return '<tr><td>' + (i+1) + '</td><td>' + p.name + '</td><td class="right">' + p.qty + '</td><td class="right">' + money(p.revenue) + '</td><td class="right">' + money(p.profit) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // Expenses
  if (d.expenseBreakdown && d.expenseBreakdown.length) {
    html += '<h3 style="margin:16px 0 8px;">Expenses by Category</h3>' +
      '<table><thead><tr><th>Category</th><th class="right">Amount</th></tr></thead><tbody>' +
      d.expenseBreakdown.map(function(e) {
        return '<tr><td>' + e.category + '</td><td class="right">' + money(e.amount) + '</td></tr>';
      }).join('') +
      '<tr><td class="bold">Total</td><td class="right bold">' + money(s.totalExpenses) + '</td></tr>' +
      '</tbody></table>';
  }

  // Period-specific breakdown
  if (type === 'weekly' && d.dailyBreakdown) {
    html += '<h3 style="margin:16px 0 8px;">Daily Breakdown</h3>' +
      '<table><thead><tr><th>Date</th><th class="right">Revenue</th><th class="right">Transactions</th><th class="right">Gross Profit</th></tr></thead><tbody>' +
      d.dailyBreakdown.map(function(day) {
        return '<tr><td>' + _formatDate(day.date) + '</td><td class="right">' + money(day.revenue) + '</td><td class="right">' + day.count + '</td><td class="right">' + money(day.grossProfit) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  if ((type === 'monthly' || type === 'period') && d.monthlyBreakdown) {
    html += '<h3 style="margin:16px 0 8px;">Monthly Breakdown</h3>' +
      '<table><thead><tr><th>Month</th><th class="right">Revenue</th><th class="right">Transactions</th><th class="right">Gross Profit</th></tr></thead><tbody>' +
      d.monthlyBreakdown.map(function(m) {
        return '<tr><td>' + m.month + '</td><td class="right">' + money(m.revenue) + '</td><td class="right">' + m.count + '</td><td class="right">' + money(m.grossProfit) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  _openPrintWindow(title, html);
}

function printLastReport() {
  if (!state.lastReport) { _showToast('No report to print', true); return; }
  printReport(state.lastReport.type, state.lastReport.d);
}

// ── BIR Data screen ───────────────────────────────────────────────────────────

function renderBIRData() {
  var year = new Date().getFullYear();
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🏛️ BIR Filing Data</div>' +
    '<button class="small-btn" onclick="renderReports()">← Back</button></div>' +
    '<div class="card">' +
    '<div class="subtitle" style="margin-bottom:8px;">Annual Summary for Income Tax Filing</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:12px;">Generates monthly/quarterly sales and expense summaries required for BIR Form 1701A and related schedules.</div>' +
    '<div class="field"><label>Select Year</label>' +
    '<select id="bir-year">' +
    [year, year-1, year-2].map(function(y) { return '<option value="' + y + '">' + y + '</option>'; }).join('') +
    '</select></div>' +
    '<button class="btn btn-primary" onclick="loadBIRData(document.getElementById(\'bir-year\').value)">📊 Generate BIR Data</button>' +
    '</div></div>';
}

async function loadBIRData(year) {
  showLoading('Generating BIR data for ' + year + '…');
  try {
    var d = await API.call('getBIRData', { year: Number(year) });
    state.lastBIRData = d;
    renderBIRScreen(d);
  } catch(e) {
    _showToast('Error: ' + e.message, true);
    renderBIRData();
  }
}

function renderBIRScreen(d) {
  function money(v) { return '₱' + Number(v||0).toLocaleString('en-PH', {minimumFractionDigits:2}); }

  var monthRows = d.months.map(function(m) {
    return '<tr>' +
      '<td>' + m.monthName.substring(0,3) + '</td>' +
      '<td class="right">' + money(m.revenue) + '</td>' +
      '<td class="right">' + money(m.cogs) + '</td>' +
      '<td class="right">' + money(m.grossProfit) + '</td>' +
      '<td class="right">' + money(m.totalExpenses) + '</td>' +
      '<td class="right" style="font-weight:bold;color:' + (m.netIncome >= 0 ? '#16a34a' : '#dc2626') + ';">' + money(m.netIncome) + '</td>' +
      '</tr>';
  }).join('');

  var qRows = d.quarters.map(function(q) {
    return '<tr style="background:#eff6ff;">' +
      '<td class="bold">' + q.label + '</td>' +
      '<td class="right bold">' + money(q.revenue) + '</td>' +
      '<td class="right">' + money(q.cogs) + '</td>' +
      '<td class="right">' + money(q.grossProfit) + '</td>' +
      '<td class="right">' + money(q.totalExpenses) + '</td>' +
      '<td class="right bold" style="color:' + (q.netIncome >= 0 ? '#16a34a' : '#dc2626') + ';">' + money(q.netIncome) + '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar" style="flex-wrap:wrap;gap:4px;">' +
    '<div style="font-size:14px;font-weight:bold;">🏛️ BIR Data — ' + d.year + '</div>' +
    '<button class="small-btn" onclick="renderBIRData()">← Back</button></div>' +

    // Store info
    '<div class="card">' +
    '<div style="font-size:14px;font-weight:bold;">' + (d.store.storeName || '') + '</div>' +
    (d.store.ownerName ? '<div class="muted">Owner: ' + d.store.ownerName + '</div>' : '') +
    (d.store.address   ? '<div class="muted">' + d.store.address + '</div>' : '') +
    '</div>' +

    // Monthly table (scrollable)
    '<div class="card" style="overflow-x:auto;">' +
    '<div style="font-size:13px;font-weight:bold;margin-bottom:8px;">Monthly & Quarterly Sales Summary</div>' +
    '<div class="muted" style="font-size:11px;margin-bottom:8px;">For BIR Form 1701A Schedule 1 — Summary of Sales/Revenues</div>' +
    '<table style="font-size:12px;min-width:420px;">' +
    '<thead><tr><th>Month</th><th>Gross Sales</th><th>Cost of Sales</th><th>Gross Profit</th><th>Expenses</th><th>Net Income</th></tr></thead>' +
    '<tbody>' + monthRows + qRows +
    '<tr style="background:#1e3a5f;color:#fff;">' +
    '<td class="bold">ANNUAL TOTAL</td>' +
    '<td class="right bold">' + money(d.annual.revenue) + '</td>' +
    '<td class="right">' + money(d.annual.cogs) + '</td>' +
    '<td class="right">' + money(d.annual.grossProfit) + '</td>' +
    '<td class="right">' + money(d.annual.totalExpenses) + '</td>' +
    '<td class="right bold">' + money(d.annual.netProfit) + '</td>' +
    '</tr></tbody></table></div>' +

    // Expense summary
    '<div class="card">' +
    '<div style="font-size:13px;font-weight:bold;margin-bottom:8px;">Annual Expense Breakdown</div>' +
    '<div class="muted" style="font-size:11px;margin-bottom:8px;">For BIR Schedule of Deductible Expenses</div>' +
    (d.expenseSummary && d.expenseSummary.length
      ? d.expenseSummary.map(function(e) {
          return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">' +
            '<span>' + e.category + '</span><strong>' + money(e.amount) + '</strong></div>';
        }).join('') +
        '<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:bold;">' +
        '<span>Total Expenses</span><span style="color:#dc2626;">' + money(d.annual.totalExpenses) + '</span></div>'
      : '<div class="muted">No expenses recorded for ' + d.year + '.</div>') +
    '</div>' +

    '<button class="btn btn-primary" onclick="printBIRData(state.lastBIRData)">📄 Export as PDF / Print</button>' +
    '</div>';
}

function printBIRData(d) {
  function money(v) { return '&#8369;' + Number(v||0).toLocaleString('en-PH', {minimumFractionDigits:2}); }

  var html =
    '<h2 style="margin-bottom:4px;">' + (d.store.storeName || 'Store') + '</h2>' +
    '<div style="color:#666;font-size:12px;margin-bottom:4px;">' +
    (d.store.ownerName ? 'Owner: ' + d.store.ownerName + ' &nbsp;|&nbsp; ' : '') +
    (d.store.address   ? d.store.address + ' &nbsp;|&nbsp; ' : '') +
    (d.store.phone     ? d.store.phone : '') + '</div>' +
    '<div style="color:#666;font-size:12px;margin-bottom:16px;">Printed: ' + new Date().toLocaleDateString('en-PH') + '</div>' +

    '<h3 style="margin-bottom:8px;">Summary of Sales for BIR Form 1701A — Year ' + d.year + '</h3>' +
    '<div style="font-size:11px;color:#888;margin-bottom:8px;">Schedule 1 — Summary of Gross Sales/Revenues and Cost of Sales</div>' +
    '<table>' +
    '<thead><tr><th>Month/Quarter</th><th class="right">Gross Sales</th><th class="right">Cost of Sales</th><th class="right">Gross Profit</th><th class="right">Operating Expenses</th><th class="right">Net Income/(Loss)</th></tr></thead>' +
    '<tbody>' +
    d.months.map(function(m) {
      return '<tr><td>' + m.monthName + '</td>' +
        '<td class="right">' + money(m.revenue) + '</td>' +
        '<td class="right">' + money(m.cogs) + '</td>' +
        '<td class="right">' + money(m.grossProfit) + '</td>' +
        '<td class="right">' + money(m.totalExpenses) + '</td>' +
        '<td class="right">' + money(m.netIncome) + '</td></tr>';
    }).join('') +
    d.quarters.map(function(q) {
      return '<tr style="font-weight:bold;background:#e8f0fe;"><td>' + q.label + '</td>' +
        '<td class="right">' + money(q.revenue) + '</td>' +
        '<td class="right">' + money(q.cogs) + '</td>' +
        '<td class="right">' + money(q.grossProfit) + '</td>' +
        '<td class="right">' + money(q.totalExpenses) + '</td>' +
        '<td class="right">' + money(q.netIncome) + '</td></tr>';
    }).join('') +
    '<tr style="font-weight:bold;background:#1e3a5f;color:white;"><td>ANNUAL TOTAL</td>' +
    '<td class="right">' + money(d.annual.revenue) + '</td>' +
    '<td class="right">' + money(d.annual.cogs) + '</td>' +
    '<td class="right">' + money(d.annual.grossProfit) + '</td>' +
    '<td class="right">' + money(d.annual.totalExpenses) + '</td>' +
    '<td class="right">' + money(d.annual.netProfit) + '</td></tr>' +
    '</tbody></table>' +

    '<h3 style="margin:20px 0 8px;">Schedule of Deductible Expenses — Year ' + d.year + '</h3>' +
    '<table>' +
    '<thead><tr><th>Expense Category</th><th class="right">Annual Amount</th></tr></thead><tbody>' +
    (d.expenseSummary || []).map(function(e) {
      return '<tr><td>' + e.category + '</td><td class="right">' + money(e.amount) + '</td></tr>';
    }).join('') +
    '<tr style="font-weight:bold;"><td>TOTAL DEDUCTIBLE EXPENSES</td><td class="right">' + money(d.annual.totalExpenses) + '</td></tr>' +
    '</tbody></table>' +

    '<div style="margin-top:24px;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:8px;">' +
    'DISCLAIMER: This is a computer-generated summary from Tindahan Hub POS. ' +
    'This is NOT a BIR-registered document. Please consult a CPA or BIR-accredited tax preparer before filing. ' +
    'Data accuracy depends on complete recording of all sales and expenses in the system.' +
    '</div>';

  _openPrintWindow('BIR Filing Data ' + d.year, html);
}

// ── Subscription / Store Key screens ─────────────────────────────────────────

function showNoStoreKey() {
  document.getElementById('app').innerHTML =
    '<div class="screen"><div class="card" style="text-align:center;padding:32px 20px;">' +
    '<div style="font-size:48px;margin-bottom:12px;">🏪</div>' +
    '<h2 style="margin:0 0 8px;">Tindahan Hub</h2>' +
    '<div class="muted" style="margin-bottom:24px;">This app is not linked to any store yet.</div>' +
    '<div class="subtitle" style="margin-bottom:8px;">Enter your Store Key</div>' +
    '<input id="sk-input" placeholder="sk_xxxxxxxxxxxxxxxxxxxxxxxx" ' +
      'style="width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;' +
      'margin-bottom:12px;box-sizing:border-box;">' +
    '<button class="btn btn-primary" onclick="_applyStoreKey()">Connect Store</button>' +
    '<div class="muted" style="margin-top:16px;font-size:12px;">Your store key was provided by Tindahan Hub when your store was created.<br>' +
    'Contact <strong>09163561251</strong> (GCash/Viber) for assistance.</div>' +
    '</div></div>';
}

function _applyStoreKey() {
  var key = (document.getElementById('sk-input').value || '').trim();
  if (!key.startsWith('sk_')) { _showToast('Invalid store key format', true); return; }
  localStorage.setItem('store_key', key);
  window.location.reload();
}

function showSubscriptionExpired(paymentInfo) {
  paymentInfo = paymentInfo || {};
  var gcash    = paymentInfo.gcashNumber  || '09163561251';
  var gcashName= paymentInfo.gcashName    || 'Tindahan Hub';
  var qr       = paymentInfo.gcashQrUrl   || '';

  document.getElementById('app').innerHTML =
    '<div class="screen"><div class="card" style="text-align:center;padding:32px 20px;">' +
    '<div style="font-size:48px;margin-bottom:8px;">🔒</div>' +
    '<h2 style="margin:0 0 4px;color:#dc2626;">Subscription Expired</h2>' +
    '<div class="muted" style="margin-bottom:20px;">Your store subscription has expired.<br>Please renew to continue.</div>' +

    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:16px;">' +
    '<div style="font-size:13px;font-weight:bold;color:#15803d;margin-bottom:8px;">Pay via GCash to renew</div>' +
    (qr ? '<img src="' + qr + '" style="width:160px;height:160px;border-radius:8px;margin-bottom:8px;"><br>' : '') +
    '<div style="font-size:18px;font-weight:bold;color:#15803d;">' + gcash + '</div>' +
    '<div style="font-size:13px;color:#6b7280;">' + gcashName + '</div>' +
    '</div>' +

    '<div class="muted" style="font-size:12px;margin-bottom:16px;">After payment, send your GCash reference number to <strong>' + gcash + '</strong> (Viber/SMS) to activate your subscription.</div>' +

    '<button class="btn btn-secondary" onclick="window.location.reload()">I already paid — Refresh</button>' +
    '</div></div>';
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
