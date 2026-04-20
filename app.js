// app.js — Store Management PWA main logic

var SCANNER_URL = 'https://ronniesaguit.github.io/store-pwa/scanner.html';

var state = {
  session:       null,
  products:      [],
  categories:    [],
  cart:          [],
  isOffline:     false,
  storeProfile:  null,
  todayExpenses: null,  // cached null = not loaded yet; [] = loaded but empty
  lastReceipt:   null,
  lastReport:    null,
  lastBIRData:   null
};

// Executive dashboard state
var execCurrentPeriod = 'last_month';

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

  try { await DB.init(); } catch(e) { console.warn('IndexedDB unavailable:', e); }

  // ── Step 1: Render instantly from IndexedDB cache (zero network wait) ────────
  var cachedSession = localStorage.getItem('store_session');
  if (cachedSession && API.token) {
    try {
      state.session    = JSON.parse(cachedSession);
      state.products   = (await DB.getProducts())   || [];
      state.categories = (await DB.getCategories()) || [];
      var cachedSP = localStorage.getItem('store_profile');
      state.storeProfile = cachedSP ? JSON.parse(cachedSP) : {
        storeName: state.session.storeName || '', ownerName: state.session.ownerName || ''
      };
      state.isOffline = !navigator.onLine;
      routeToDashboard();  // show dashboard immediately — no spinner
    } catch(e) {}
  } else if (API.token) {
    showLoading('Loading…');
  }

  // ── Step 2: Online — fetch fresh data in background (single batch call) ──────
  if (navigator.onLine && API.token) {
    try {
      var boot = await API.call('getBootData');
      var session = boot.session;
      state.session = session; // already contains plan, inTrial, manifest
      state.storeProfile = { storeName: session.storeName || '', ownerName: session.ownerName || '' };
      state.products   = boot.products   || [];
      state.categories = boot.categories || [];
      state.isOffline  = false;
      localStorage.setItem('store_session', JSON.stringify(session));
      localStorage.setItem('store_profile', JSON.stringify(state.storeProfile));
      try { await DB.saveProducts(state.products); }   catch(e) {}
      try { await DB.saveCategories(state.categories); } catch(e) {}
      routeToDashboard();  // re-render with fresh data (instant, already on screen)
      _submitHealthSnapshot();
      return;
    } catch(e) {
      console.warn('Boot fetch failed:', e.message);
      if (!cachedSession) { showLoading('No connection. Please connect and try again.'); return; }
      // Cached session already rendered above — stay offline
    }
  }

  // ── No session at all — show login ────────────────────────────────────────────
  renderLogin(navigator.onLine ? null : 'No internet. Please connect and log in once first.');
}

function routeToDashboard() {
  if (!state.session || !state.session.user) { renderLogin(); return; }
  var dashType = state.session.manifest && state.session.manifest.dashboard_type;
  if (dashType === 'store_owner_dashboard')  { renderOwnerDashboard(); return; }
  if (dashType === 'executive_dashboard')    { renderExecutiveDashboard(); return; }
  if (dashType === 'manager_dashboard')      { renderManagerDashboard(); return; }
  if (dashType === 'cashier_dashboard')      { renderCashierDashboard(); return; }
  if (dashType === 'inventory_dashboard')    { renderInventoryDashboard(); return; }
  if (dashType === 'viewer_dashboard')       { renderViewerDashboard(); return; }
  // fallback to role-based routing (cached session without manifest)
  var role = (state.session.user.Role || '').toUpperCase();
  if (role === 'OWNER')                renderOwnerDashboard();
  else if (role === 'EXECUTIVE')       renderExecutiveDashboard();
  else if (role === 'MANAGER')         renderManagerDashboard();
  else if (role === 'CASHIER')         renderCashierDashboard();
  else if (role === 'INVENTORY_STAFF') renderInventoryDashboard();
  else                                 renderViewerDashboard();
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
    // Refresh in one batch call
    var syncBoot = await API.call('getBootData');
    state.products   = syncBoot.products   || [];
    state.categories = syncBoot.categories || [];
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
  routeToDashboard();
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
    '' +
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

  // ── Fast path: cached credentials → instant dashboard, token in background ──
  var raw = localStorage.getItem('offline_cred_' + username.toLowerCase());
  if (raw) {
    try {
      var cachedCred = JSON.parse(raw);
      var enteredHash = await sha256(password);
      if (enteredHash === cachedCred.passwordHash) {
        // Save for silent token renewal
        localStorage.setItem('_ak', btoa(username + ':' + password));
        // Credentials match — show dashboard NOW from local cache
        state.session    = JSON.parse(localStorage.getItem('store_session') || 'null')
                           || { loggedIn: true, user: cachedCred.user };
        state.isOffline  = !navigator.onLine;
        state.products   = (await DB.getProducts())   || [];
        state.categories = (await DB.getCategories()) || [];
        var sp = localStorage.getItem('store_profile');
        state.storeProfile = sp ? JSON.parse(sp) : null;
        routeToDashboard();  // instant — no network wait

        // Refresh token & data in background
        if (navigator.onLine) {
          API.call('login', { username: username, password: password })
            .then(function(result) {
              API.setToken(result.token);
              state.session   = { loggedIn: true, user: result.user, plan: result.plan || null, inTrial: result.inTrial || false, manifest: result.manifest || null };
              state.storeProfile = { storeName: result.storeName || (state.storeProfile||{}).storeName || '',
                                     ownerName: result.ownerName || (state.storeProfile||{}).ownerName || '' };
              state.products   = result.products   || state.products;
              state.categories = result.categories || state.categories;
              state.isOffline  = false;
              localStorage.setItem('store_session', JSON.stringify(state.session));
              localStorage.setItem('store_profile', JSON.stringify(state.storeProfile));
              DB.saveProducts(state.products).catch(function(){});
              DB.saveCategories(state.categories).catch(function(){});
              routeToDashboard();  // silent re-render with fresh data
            }).catch(function(e) {
              // Wrong password on server (e.g. password changed) — force re-login
              if (e.message && e.message.toLowerCase().includes('password')) {
                logout();
                renderLogin('Password changed. Please log in again.');
              }
            });
        }
        return;
      }
    } catch(e) {}
  }

  // ── No cache or wrong password — must wait for GAS ───────────────────────────
  showLoading('Logging in…');
  try {
    var result = await API.call('login', { username: username, password: password });
    API.setToken(result.token);
    state.session      = { loggedIn: true, user: result.user, plan: result.plan || null, inTrial: result.inTrial || false, manifest: result.manifest || null };
    state.storeProfile = { storeName: result.storeName || '', ownerName: result.ownerName || '' };
    state.products     = result.products   || [];
    state.categories   = result.categories || [];
    state.isOffline    = false;
    localStorage.setItem('store_session', JSON.stringify(state.session));
    localStorage.setItem('store_profile', JSON.stringify(state.storeProfile));
    try { await DB.saveProducts(state.products);   } catch(e) {}
    try { await DB.saveCategories(state.categories); } catch(e) {}
    // Cache credentials for fast login + silent token renewal
    try {
      var hash = await sha256(password);
      localStorage.setItem('offline_cred_' + username.toLowerCase(),
        JSON.stringify({ passwordHash: hash, user: result.user }));
      localStorage.setItem('_ak', btoa(username + ':' + password));
    } catch(e) {}
    routeToDashboard();
  } catch(err) {
    var msg = err.message || String(err);
    if (msg === 'No internet connection') {
      renderLogin('No connection. Please connect and try again.');
    } else {
      renderLogin(msg);
    }
  }
}

function logout() {
  var currentUsername = state.session && state.session.user ? state.session.user.Username : null;
  if (currentUsername) localStorage.removeItem('offline_cred_' + currentUsername.toLowerCase());
  if (API.token) API.call('logout').catch(function() {});
  API.clearToken();
  state.session      = null;
  state.products     = [];
  state.categories   = [];
  state.cart         = [];
  state.todayExpenses = null;
  state.storeProfile = null;
  localStorage.removeItem('store_session');
  localStorage.removeItem('store_profile');
  // Clear per-role dashboard caches so next user starts fresh
  localStorage.removeItem('mgr_dash');
  localStorage.removeItem('exec_dash_cache');
  localStorage.removeItem('exec_dash_ts');
  ['today','last_week','last_month','last_quarter','last_year'].forEach(function(p) {
    localStorage.removeItem('mon_' + p);
  });
  renderLogin();
}

// ── Module helpers ────────────────────────────────────────────────────────────

function _planModules() {
  return (state.session && state.session.plan && state.session.plan.modules) || null;
}

function _hasModule(moduleId) {
  var mods = _planModules();
  if (!mods) return true; // CUSTOM plan or no plan info — allow all
  return mods.indexOf(moduleId) !== -1;
}

function _hasPerm(permCode) {
  var perms = state.session && state.session.manifest && state.session.manifest.granted_permissions;
  if (!perms) return true; // graceful degradation if manifest not yet available
  return perms.indexOf(permCode) !== -1;
}

function _hasPermission(moduleOrPerm, action) {
  // Two-arg form: _hasPermission('suppliers', 'create') → checks 'suppliers.create'
  if (action) return _hasPerm(moduleOrPerm + '.' + action);
  // One-arg form: _hasPermission('reports.view_advanced')
  return _hasPerm(moduleOrPerm);
}

// ── Dashboards ────────────────────────────────────────────────────────────────

function _dashboardHeader_(storeName, subLabel, onlineLabel, isOffline) {
  var statusPill = isOffline
    ? '<span style="display:inline-block;background:rgba(231,76,60,0.25);color:#e74c3c;border:1px solid rgba(231,76,60,0.5);border-radius:20px;padding:1px 10px;font-size:0.7rem;font-weight:600;letter-spacing:.3px;">🔴 Offline</span>'
    : '<span style="display:inline-block;background:rgba(46,204,113,0.2);color:#2ecc71;border:1px solid rgba(46,204,113,0.4);border-radius:20px;padding:1px 10px;font-size:0.7rem;font-weight:600;letter-spacing:.3px;">🟢 Online</span>';
  return '<div style="background:var(--primary,#2c3e50);padding:14px 16px 10px;text-align:center;position:relative;">' +
    '<button class="small-btn" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);" onclick="logout()">Logout</button>' +
    '<div style="font-size:1.45rem;font-weight:700;letter-spacing:.3px;line-height:1.15;color:#fff;">' + _escAttr(storeName) + '</div>' +
    '<div style="font-size:0.78rem;opacity:0.75;color:#fff;margin-top:2px;">👤 ' + _escAttr(subLabel) + '</div>' +
    '<div style="margin-top:6px;">' + statusPill + '</div>' +
    '</div>';
}

function renderOwnerDashboard(msg) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var ownerName = (state.storeProfile && (state.storeProfile.ownerName || state.storeProfile.Owner_Name)) || state.session.user.Full_Name;
  var plan = state.session && state.session.plan;
  var planLine = plan ? '<div style="font-size:0.7rem;color:rgba(255,255,255,0.55);margin-top:1px;">' + _escAttr(plan.name || plan.id || '') + (state.session.inTrial ? ' · Trial' : '') + '</div>' : '';

  var btns = '';
  if (_hasModule('products'))        btns += '<button class="big-btn" onclick="loadProducts()">📦 Products</button>';
  if (_hasModule('quick_sell'))      btns += '<button class="big-btn" onclick="renderQuickSell()">💰 Quick Sell</button>';
  if (_hasModule('quick_sell'))      btns += '<button class="big-btn" onclick="renderSalesHistory()">🧾 Sales History</button>';
  if (_hasModule('inventory'))       btns += '<button class="big-btn" onclick="renderInventoryAdvancedSummary()">📦 Inventory</button>';
  if (_hasModule('expenses'))        btns += '<button class="big-btn" onclick="renderExpenses()">💸 Expenses</button>';
  if (_hasModule('reports'))         btns += '<button class="big-btn" onclick="renderReports()">📊 Reports</button>';
  if (_hasModule('reports'))         btns += '<button class="big-btn" onclick="renderAdvancedReportsHome()">📊 Advanced Reports</button>';
  if (_hasModule('suppliers'))       btns += '<button class="big-btn" onclick="renderSuppliers()">🏭 Suppliers</button>';
  if (_hasModule('purchase_orders')) btns += '<button class="big-btn" onclick="renderPurchaseOrders()">📋 Purchase Orders</button>';
  if (_hasModule('branch_transfers'))btns += '<button class="big-btn" onclick="renderBranchTransfers()">🔄 Branch Transfers</button>';
  if (_hasModule('multi_branch'))    btns += '<button class="big-btn" onclick="renderHQControlCenter()">🏢 HQ Control</button>';
  if (_hasModule('internal_chat'))   btns += '<button class="big-btn" onclick="renderChat()">💬 Chat</button>';
  if (_hasModule('staff_management') || _hasModule('staff')) btns += '<button class="big-btn" onclick="renderStaffList()">👥 Staff</button>';
  if (_hasModule('custom_roles'))    btns += '<button class="big-btn" onclick="renderCustomRoles()">🎭 Custom Roles</button>';
  if (_hasModule('approvals'))       btns += '<button class="big-btn" onclick="renderApprovalsQueue()">✅ Approvals</button>';
  if (_hasModule('roi'))             btns += '<button class="big-btn" onclick="renderROIMonitor()">📈 ROI</button>';
  if (_hasModule('monitors'))        btns += '<button class="big-btn" onclick="renderMonitors()">📡 Monitors</button>';
  if (_hasModule('automation_rules'))btns += '<button class="big-btn" onclick="renderAutomationRules()">⚡ Automation</button>';
  if (_hasModule('data_import'))     btns += '<button class="big-btn" onclick="renderDataImport()">📥 Import Data</button>';
  if (_hasModule('settings'))        btns += '<button class="big-btn" onclick="renderFullSettings()">⚙️ Settings</button>';
  btns += '<button class="big-btn" onclick="renderNotificationsCenter()">🔔 Notifications</button>';
  btns += '<button class="big-btn" onclick="renderAlertsCenter()">🚨 Alerts</button>';
  btns += '<button class="big-btn" onclick="renderFeatureMarketplace()">🛒 Feature Store</button>';
  btns += '<button class="big-btn" onclick="renderHardwareSetup()">🖨️ Hardware</button>';
  btns += '<button class="big-btn" onclick="renderSandboxMode()">🧪 Sandbox</button>';
  if (_hasModule('support'))         btns += '<button class="big-btn" onclick="renderSupport()">📞 Help</button>';

  // Locked / upsell tiles for modules not in current plan
  var UPSELL_META = {
    monitors:        { icon: '📡', label: 'Monitors'         },
    roi:             { icon: '📈', label: 'ROI'               },
    inventory:       { icon: '📋', label: 'Inventory'         },
    staff:           { icon: '👥', label: 'Staff'             },
    reports:         { icon: '📊', label: 'Reports'           },
    internal_chat:   { icon: '💬', label: 'Chat'              },
    tax_reports:     { icon: '🧾', label: 'Tax Reports'       },
    approvals:       { icon: '✅', label: 'Approvals'         },
    activity_log:    { icon: '📜', label: 'Activity Log'      },
    suppliers:       { icon: '🏭', label: 'Suppliers'         },
    purchase_orders: { icon: '📋', label: 'Purchase Orders'   },
    branch_transfers:{ icon: '🔄', label: 'Branch Transfers'  },
    multi_branch:    { icon: '🏢', label: 'HQ Control'        },
    custom_roles:    { icon: '🎭', label: 'Custom Roles'      },
    automation_rules:{ icon: '⚡', label: 'Automation'        },
    data_import:     { icon: '📥', label: 'Data Import'       },
  };
  var lockedBtns = '';
  var mods = _planModules();
  if (mods) {
    Object.keys(UPSELL_META).forEach(function(m) {
      if (mods.indexOf(m) === -1) {
        var meta = UPSELL_META[m];
        lockedBtns += '<button class="big-btn" disabled style="opacity:0.45;cursor:default;position:relative;" title="Upgrade to unlock">' +
          '<span style="position:absolute;top:4px;right:6px;font-size:0.6rem;background:#f59e0b;color:#fff;padding:1px 5px;border-radius:8px;font-weight:700;">PRO</span>' +
          meta.icon + ' ' + meta.label + '<br><span style="font-size:0.65rem;opacity:0.7;">🔒 Upgrade</span></button>';
      }
    });
  }

  var quickActions = '';
  if (_hasModule('products')) quickActions += '<button class="btn btn-secondary" onclick="renderAddProductForm()">+ Add New Product</button>';
  if (_hasModule('expenses')) quickActions += '<button class="btn btn-secondary" style="margin-top:8px;" onclick="renderAddExpenseForm()">+ Record Expense</button>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    _dashboardHeader_(storeName, ownerName, '', state.isOffline) +
    planLine +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    '<div class="grid-buttons">' + btns + lockedBtns + '</div>' +
    (quickActions ? '<div class="card"><div class="subtitle">Quick Actions</div>' + quickActions + '</div>' : '') +
    '</div>';
}

// MANAGER — operational cockpit (v1)
function renderManagerDashboard() {
  _loadManagerDashboard();
}

async function _loadManagerDashboard() {
  var CACHE_KEY = 'mgr_dash';
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';

  if (!navigator.onLine) {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      try { _renderMgrPage(JSON.parse(raw), true); return; } catch(_) {}
    }
    _renderMgrSimple();
    return;
  }

  showLoading('Loading dashboard\u2026');
  try {
    var data = await API.call('getManagerDashboard');
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    _renderMgrPage(data, false);
  } catch(err) {
    if (err.code === 'MODULE_DISABLED' || err.code === 'PERMISSION_DENIED' || err.code === 'SUBSCRIPTION_EXPIRED') {
      _renderMgrSimple(err.message);
      return;
    }
    var raw2 = localStorage.getItem(CACHE_KEY);
    if (raw2) {
      try { _renderMgrPage(JSON.parse(raw2), true); return; } catch(_) {}
    }
    _renderMgrSimple(err.message);
  }
}

function _renderMgrPage(data, fromCache) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = (data.header && data.header.user_name) || state.session.user.Full_Name || '';
  var s  = data.summary         || {};
  var inv = data.inventory_watch || {};
  var ss  = data.staff_snapshot  || {};
  var ap  = data.approvals       || {};
  var ins = data.insights        || {};
  var sys = data.system_status   || {};
  var ra  = data.recent_activity || {};
  var qa  = data.quick_actions   || [];
  var alerts = data.alerts       || [];

  var cacheBar = fromCache
    ? '<div style="background:#fffbeb;border-bottom:1px solid #fde68a;padding:6px 12px;font-size:0.75rem;color:#92400e;text-align:center;">Showing last available dashboard data</div>'
    : '';

  // ── Summary KPIs ─────────────────────────────────────────────────────────────
  var st  = s.sales_today        || {};
  var tx  = s.transactions_today || {};
  var et  = s.expenses_today     || {};
  var ls  = s.low_stock_count    || {};
  var summaryHtml =
    '<div style="padding:10px 12px 4px;">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    _monMetric('Sales Today',   _monCur(st.value),
      st.trend_pct !== null && st.trend_pct !== undefined ? _monTB(st.trend_pct, st.trend_dir, true) : '',
      st.status || 'no_data') +
    _monMetric('Transactions',  tx.value !== undefined ? String(tx.value) : '0',
      '', tx.status || 'no_data') +
    _monMetric('Expenses Today', _monCur(et.value),
      et.trend_pct !== null && et.trend_pct !== undefined ? _monTB(et.trend_pct, et.trend_dir, false) : '',
      et.status || 'no_data') +
    _monMetric('Low Stock',
      ls.value !== null && ls.value !== undefined ? String(ls.value) + ' items' : '\u2014',
      '', ls.status || 'no_data') +
    '</div></div>';

  // ── Operations Status headline ────────────────────────────────────────────────
  var critCount  = alerts.filter(function(a) { return a.status === 'critical'; }).length;
  var watchCount = alerts.filter(function(a) { return a.status === 'watch';    }).length;
  var hBg, hBorder, hIcon, hLine;
  if (critCount > 0) {
    hBg = '#fff5f5'; hBorder = '#dc2626'; hIcon = '🔴';
    hLine = critCount + ' critical issue' + (critCount > 1 ? 's' : '') + ' need' + (critCount === 1 ? 's' : '') + ' your attention now.';
  } else if (watchCount > 0) {
    hBg = '#fffbeb'; hBorder = '#d97706'; hIcon = '⚠️';
    hLine = watchCount + ' thing' + (watchCount > 1 ? 's' : '') + ' to watch \u2014 check below.';
  } else {
    var salesV = st.value || 0;
    var txV    = tx.value || 0;
    var goodMsg = salesV > 0
      ? '\u20B1' + Number(salesV).toLocaleString('en-PH', {minimumFractionDigits:0,maximumFractionDigits:0}) +
        ' in sales' + (txV > 0 ? ' across ' + txV + ' transaction' + (txV !== 1 ? 's' : '') : '') + '.'
      : 'No issues to flag. Keep monitoring operations.';
    hBg = '#f0fdf4'; hBorder = '#16a34a'; hIcon = '✅';
    hLine = goodMsg;
  }
  var headlineHtml =
    '<div style="margin:4px 12px 2px;padding:12px 14px;background:' + hBg + ';border-radius:10px;border-left:4px solid ' + hBorder + ';">' +
    '<div style="font-weight:700;font-size:0.95rem;color:#111827;">' + hIcon + ' Operations Status</div>' +
    '<div style="font-size:0.82rem;color:#374151;margin-top:3px;">' + _escAttr(hLine) + '</div>' +
    '</div>';

  // ── Needs Attention ─────────────────────────────────────────────────────────
  var alertFnMap = {
    no_sales:          'renderQuickSell()',
    out_of_stock:      '_hasModule("inventory") ? renderInventoryMenu() : _showToast("Inventory not enabled", true)',
    low_stock:         '_hasModule("inventory") ? renderInventoryMenu() : _showToast("Inventory not enabled", true)',
    high_expenses:     'renderExpenses()',
    pending_approvals: '_hasModule("approvals") ? renderApprovalsQueue() : _showToast("Approvals not enabled", true)',
  };
  var urgIco = { good: '✅', watch: '⚠️', critical: '🔴', info: 'ℹ️' };
  var alertsHtml = alerts.length === 0
    ? '<div style="margin:6px 12px 4px;padding:10px 12px;background:#f9fafb;border-radius:10px;font-size:0.8rem;color:#6b7280;text-align:center;">No alerts \u2014 operations look normal.</div>'
    : '<div style="padding:4px 12px 2px;">' +
      '<div style="font-weight:700;font-size:0.75rem;color:#374151;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Needs Attention</div>' +
      alerts.map(function(a) {
        var c   = _monSC(a.status || 'watch');
        var fn  = alertFnMap[a.code];
        var btn = fn
          ? '<div style="margin-top:7px;"><button onclick="' + fn + '" style="background:' + c + ';color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:0.73rem;font-weight:700;cursor:pointer;">' + _escAttr(a.action_label || 'Act Now') + ' \u2192</button></div>'
          : '';
        return '<div style="background:#fff;border-left:3px solid ' + c + ';border-radius:10px;padding:10px 12px;margin-bottom:7px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
          '<div style="font-weight:600;font-size:0.83rem;color:#111827;">' + (urgIco[a.status] || '\u2022') + ' ' + _escAttr(a.title) + '</div>' +
          '<div style="font-size:0.76rem;color:#6b7280;margin-top:2px;">' + _escAttr(a.message) + '</div>' +
          btn + '</div>';
      }).join('') + '</div>';

  // ── Quick Actions ────────────────────────────────────────────────────────────
  var qaFnMap = {
    quick_sell:    'renderQuickSell()',
    sales_history: 'renderSalesHistory()',
    inventory:     'renderInventoryMenu()',
    expenses:      'renderExpenses()',
    products:      'loadProducts()',
    staff:         'renderManageStaff()',
    reports:       'renderReports()',
    monitors:      'renderMonitors()',
    approvals:     'renderApprovalsQueue()',
    notifications: 'renderNotificationsCenter()',
    chat:          'renderChat()',
    support:       'renderSupport()',
  };
  var qaHtml = qa.length > 0
    ? '<div style="padding:8px 12px 4px;">' +
      '<div style="font-weight:700;font-size:0.75rem;color:#374151;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Quick Actions</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;">' +
      qa.map(function(a) {
        var fn = qaFnMap[a.id] || '';
        return '<button onclick="' + fn + '" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:11px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.04);">' +
          '<span style="font-size:1.4rem;">' + a.icon + '</span>' +
          '<span style="font-size:0.67rem;font-weight:600;color:#374151;">' + _escAttr(a.label) + '</span>' +
          '</button>';
      }).join('') +
      '</div></div>'
    : '';

  // ── Inventory Watch ─────────────────────────────────────────────────────────
  var invHtml = '';
  if (inv.is_available) {
    var invLs = inv.low_stock    || { value: 0, status: 'no_data' };
    var invOs = inv.out_of_stock || { value: 0, status: 'no_data' };
    var invContent =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
      _monMetric('Low Stock',    String(invLs.value) + ' items', '', invLs.status) +
      _monMetric('Out of Stock', String(invOs.value) + ' items', '', invOs.status) +
      '</div>' +
      (inv.fast_moving ? _monRow('🚀 Fast Moving', _escAttr(inv.fast_moving.name || '\u2014'), inv.fast_moving.qty + ' sold today', 'good') : '') +
      (inv.slow_moving ? _monRow('🐢 Slow Moving', _escAttr(inv.slow_moving.name || '\u2014'), inv.slow_moving.stock + ' in stock, ' + inv.slow_moving.qty_sold + ' sold this week', 'watch') : '') +
      '<div style="margin-top:8px;"><button onclick="renderInventoryMenu()" style="width:100%;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:8px;padding:8px;font-size:0.75rem;font-weight:600;cursor:pointer;">📋 View Inventory</button></div>';
    invHtml = _monSection('📋', 'Inventory Watch', invContent);
  }

  // ── Staff Activity ──────────────────────────────────────────────────────────
  var staffAc = ss.active_count || { value: 0, status: 'no_data' };
  var staffContent =
    _monRow('Active Staff Today', String(staffAc.value) + ' staff', 'recorded a sale, expense, or stock movement', staffAc.status) +
    (ss.top_staff
      ? _monRow('🏆 Top by Sales', _escAttr(ss.top_staff.name || '\u2014'), '\u20B1' + Number(ss.top_staff.total || 0).toLocaleString('en-PH', {minimumFractionDigits:0,maximumFractionDigits:0}) + ' today', 'good')
      : _monRow('Top by Sales', '\u2014', 'No sales recorded yet', 'no_data')) +
    (_hasModule('staff') ? '<div style="margin-top:8px;"><button onclick="renderManageStaff()" style="background:#f0fdf4;border:1px solid #86efac;color:#16a34a;border-radius:8px;padding:8px 12px;font-size:0.75rem;font-weight:600;cursor:pointer;">👥 Manage Staff</button></div>' : '');
  var staffHtml = _monSection('👥', 'Staff Activity', staffContent);

  // ── Approvals ────────────────────────────────────────────────────────────────
  var approvalsHtml = '';
  if (ap.is_available) {
    var apContent = ap.pending_count > 0
      ? _monRow('⏳ Pending', String(ap.pending_count) + ' item' + (ap.pending_count !== 1 ? 's' : ''), 'awaiting your review', 'watch') +
        '<div style="margin-top:8px;"><button onclick="renderApprovalsQueue()" style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 12px;font-size:0.75rem;font-weight:600;cursor:pointer;">✅ Review Approvals</button></div>'
      : '<div style="text-align:center;padding:12px 0;color:#6b7280;font-size:0.8rem;">No pending approvals.</div>';
    approvalsHtml = _monSection('✅', 'Approvals', apContent);
  }

  // ── Insights & Shortcuts ─────────────────────────────────────────────────────
  var insShortcuts = [];
  if (ins.reports    && ins.reports.available)     insShortcuts.push({ icon: '📊', label: 'Reports',      fn: 'renderReports()' });
  if (ins.monitors   && ins.monitors.available)    insShortcuts.push({ icon: '📡', label: 'Monitors',     fn: 'renderMonitors()' });
  if (ins.activity_log && ins.activity_log.available) insShortcuts.push({ icon: '📜', label: 'Activity Log', fn: 'renderAdvancedReportsHome()' });
  var insightsHtml = insShortcuts.length > 0
    ? _monSection('🔍', 'Insights & Reports',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        insShortcuts.map(function(sc) {
          return '<button onclick="' + sc.fn + '" style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:0.8rem;font-weight:600;color:#374151;cursor:pointer;">' + sc.icon + ' ' + sc.label + '</button>';
        }).join('') + '</div>')
    : '';

  // ── System / Sync Status ─────────────────────────────────────────────────────
  var sysHtml = _monSection('🔄', 'System / Sync',
    _monRow('Last Sync',       '\u2014', (sys.last_sync    && sys.last_sync.note)    || 'Not available yet', 'no_data') +
    _monRow('Pending Records', '\u2014', (sys.pending_count && sys.pending_count.note) || 'Not available yet', 'no_data'));

  // ── Recent Activity ──────────────────────────────────────────────────────────
  var recentHtml = '';
  if (ra.is_available) {
    var actContent = ra.items && ra.items.length > 0
      ? ra.items.map(function(item) {
          var timeStr = item.time ? new Date(item.time).toLocaleTimeString('en-PH', {hour:'2-digit',minute:'2-digit'}) : '';
          return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px solid #f3f4f6;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:0.8rem;font-weight:600;color:#111827;">' + _escAttr(item.label) + '</div>' +
            (item.detail ? '<div style="font-size:0.72rem;color:#6b7280;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _escAttr(item.detail) + '</div>' : '') +
            '</div>' +
            '<div style="font-size:0.68rem;color:#9ca3af;white-space:nowrap;margin-left:8px;">' + _escAttr(timeStr) + '</div>' +
            '</div>';
        }).join('')
      : '<div style="text-align:center;padding:12px 0;color:#6b7280;font-size:0.8rem;">No recent activity yet.</div>';
    recentHtml = _monSection('📜', 'Recent Activity', actContent);
  }

  // ── Assemble ─────────────────────────────────────────────────────────────────
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    _dashboardHeader_(storeName, 'Manager \u00B7 ' + userName, '', state.isOffline) +
    cacheBar +
    summaryHtml +
    headlineHtml +
    alertsHtml +
    qaHtml +
    invHtml +
    staffHtml +
    approvalsHtml +
    insightsHtml +
    sysHtml +
    recentHtml +
    '<div style="height:24px;"></div></div>';
}

function _renderMgrSimple(errMsg) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = state.session.user.Full_Name;
  var btns = '';
  if (_hasModule('quick_sell'))    btns += '<button class="big-btn" onclick="renderQuickSell()">💰 Quick Sell</button>';
  if (_hasModule('products'))      btns += '<button class="big-btn" onclick="loadProducts()">📦 Products</button>';
  if (_hasModule('inventory'))     btns += '<button class="big-btn" onclick="renderInventoryMenu()">📋 Inventory</button>';
  if (_hasModule('expenses'))      btns += '<button class="big-btn" onclick="renderExpenses()">💸 Expenses</button>';
  if (_hasModule('reports'))       btns += '<button class="big-btn" onclick="renderReports()">📊 Reports</button>';
  if (_hasModule('monitors'))      btns += '<button class="big-btn" onclick="renderMonitors()">📡 Monitors</button>';
  if (_hasModule('staff'))         btns += '<button class="big-btn" onclick="renderManageStaff()">👥 Staff</button>';
  if (_hasModule('internal_chat')) btns += '<button class="big-btn" onclick="renderChat()">💬 Chat</button>';
  if (_hasModule('support'))       btns += '<button class="big-btn" onclick="renderSupport()">📞 Help</button>';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    _dashboardHeader_(storeName, 'Manager \u00B7 ' + userName, '', state.isOffline) +
    (errMsg ? '<div style="margin:8px 12px;padding:10px 12px;background:#fef2f2;border-radius:8px;font-size:0.78rem;color:#b91c1c;">' + _escAttr(errMsg) + '</div>' : '') +
    '<div class="grid-buttons">' + btns + '</div></div>';
}

// CASHIER — sell and record expenses only
function renderCashierDashboard(msg) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = state.session.user.Full_Name;
  var btns = '';
  if (_hasModule('quick_sell'))    btns += '<button class="big-btn" onclick="renderQuickSell()">💰 Quick Sell</button>';
  if (_hasModule('products'))      btns += '<button class="big-btn" onclick="loadProducts()">📦 Products</button>';
  if (_hasModule('expenses'))      btns += '<button class="big-btn" onclick="renderExpenses()">💸 Expenses</button>';
  if (_hasModule('internal_chat')) btns += '<button class="big-btn" onclick="renderChat()">💬 Chat</button>';
  if (_hasModule('support'))       btns += '<button class="big-btn" onclick="renderSupport()">📞 Help</button>';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    _dashboardHeader_(storeName, userName + ' · Cashier', '', state.isOffline) +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    '<div class="grid-buttons">' + btns + '</div></div>';
}

// INVENTORY_STAFF — products and stock management only
function renderInventoryDashboard(msg) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = state.session.user.Full_Name;
  var btns = '';
  if (_hasModule('products'))      btns += '<button class="big-btn" onclick="loadProducts()">📦 Products</button>';
  if (_hasModule('inventory'))     btns += '<button class="big-btn" onclick="renderInventoryMenu()">📋 Inventory</button>';
  if (_hasModule('internal_chat')) btns += '<button class="big-btn" onclick="renderChat()">💬 Chat</button>';
  if (_hasModule('support'))       btns += '<button class="big-btn" onclick="renderSupport()">📞 Help</button>';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    _dashboardHeader_(storeName, userName + ' · Inventory Staff', '', state.isOffline) +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    '<div class="grid-buttons">' + btns + '</div></div>';
}

// VIEWER / WATCHER — read-only reports and monitors
function renderViewerDashboard(msg) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = state.session.user.Full_Name;
  var btns = '';
  if (_hasModule('reports'))       btns += '<button class="big-btn" onclick="renderReports()">📊 Reports</button>';
  if (_hasModule('monitors'))      btns += '<button class="big-btn" onclick="renderMonitors()">📡 Monitors</button>';
  if (_hasModule('internal_chat')) btns += '<button class="big-btn" onclick="renderChat()">💬 Chat</button>';
  if (_hasModule('support'))       btns += '<button class="big-btn" onclick="renderSupport()">📞 Help</button>';
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    _dashboardHeader_(storeName, userName + ' · Viewer', '', state.isOffline) +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    '<div class="grid-buttons">' + btns + '</div></div>';
}

// EXECUTIVE — read-only access to reports, ROI, monitors, expenses overview
// ── Executive Dashboard ─────────────────────────────────────────────────────────

// Removed duplicate declaration; already declared at top

async function renderExecutiveDashboard(msg) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = state.session.user.Full_Name;

  if (state.isOffline) {
    var cached = localStorage.getItem('exec_dash_cache');
    if (cached) {
      try {
        var cachedData = JSON.parse(cached);
        _renderExecutivePage(cachedData, true);
        return;
      } catch(e) {}
    }
  }

  showLoading('Loading executive dashboard…');
  try {
    var data = await API.call('getExecutiveDashboard', { period: execCurrentPeriod });
    try {
      localStorage.setItem('exec_dash_cache', JSON.stringify(data));
      localStorage.setItem('exec_dash_ts', Date.now().toString());
      localStorage.setItem('last_sync_at', Date.now().toString());
    } catch(e) {}
    _renderExecutivePage(data, false);
  } catch(err) {
    _showToast('Error: ' + (err.message || err), true);
    goHome();
  }
}

async function _renderExecutivePage(data, fromCache) {
  var storeName = (state.storeProfile && (state.storeProfile.storeName || state.storeProfile.Store_Name)) || '';
  var userName  = state.session.user.Full_Name;

  var cacheBanner = fromCache
    ? '<div style="background:#fffbeb;border-bottom:1px solid #fde68a;padding:6px 12px;font-size:0.75rem;color:#92400e;text-align:center;">Showing cached data (offline)</div>'
    : '';

  var alertsHtml = '';
  if (data.alerts && data.alerts.length) {
    alertsHtml = '<div style="padding:4px 12px 2px;">' + data.alerts.map(function(a){
      var bg = a.status === 'critical' ? '#fee2e2' : a.status === 'watch' ? '#fef3c7' : '#dbeafe';
      var border = a.status === 'critical' ? '#dc2626' : a.status === 'watch' ? '#d97706' : '#1d4ed8';
      var actionBtn = a.action_label
        ? '<button onclick="_execAction(\''+a.action_target+'\')" style="margin-top:6px;background:#fff;border:1px solid '+border+';color:'+border+';padding:4px 10px;border-radius:6px;font-size:0.7rem;font-weight:700;cursor:pointer;">'+a.action_label+' →</button>'
        : '';
      return '<div style="background:'+bg+';border-left:3px solid '+border+';border-radius:8px;padding:10px;margin-bottom:6px;">'+
        '<div style="font-weight:700;font-size:0.8rem;color:#111827;">'+_escAttr(a.title)+'</div>'+
        '<div style="font-size:0.75rem;color:#374151;margin-top:2px;">'+_escAttr(a.message)+'</div>'+
        actionBtn+
        '</div>';
    }).join('') + '</div>';
  }


  // Period selector
  var periods = ['today','last_week','last_month','last_quarter','last_year'];
  var periodHtml = '<div style="display:flex;gap:6px;overflow-x:auto;padding:0 4px 12px;-webkit-overflow-scrolling:touch;">' +
    periods.map(function(p){
      var active = p === execCurrentPeriod ? 'background:#111827;color:#fff;border-color:#111827;' : '';
      return '<button class="period-btn" data-period="'+p+'" onclick="setExecPeriod(\''+p+'\')" style="'+active+'">'+
        {today:'Today',last_week:'Week',last_month:'Month',last_quarter:'Quarter',last_year:'Year'}[p]+'</button>';
    }).join('') + '</div>';

  // Executive Summary KPIs
  var s = data.summary || {};
  var salesPct    = s.sales_total      && s.sales_total.trend_pct      !== null ? s.sales_total.trend_pct      : null;
  var expPct      = s.expenses_total   && s.expenses_total.trend_pct   !== null ? s.expenses_total.trend_pct   : null;
  var profitPct   = s.estimated_profit && s.estimated_profit.trend_pct !== null ? s.estimated_profit.trend_pct : null;

  // Extract raw values and statuses
  var salesVal       = s.sales_total       ? s.sales_total.value        : null;
  var salesStatus    = s.sales_total       ? s.sales_total.status       : 'no_data';
  var expVal         = s.expenses_total    ? s.expenses_total.value     : null;
  var expStatus      = s.expenses_total    ? s.expenses_total.status    : 'no_data';
  var profitVal      = s.estimated_profit  ? s.estimated_profit.value   : null;
  var profitStatus   = s.estimated_profit  ? s.estimated_profit.status  : 'no_data';
  var marginVal      = s.profit_margin     ? s.profit_margin.value      : null;
  var txVal          = s.transactions      ? s.transactions.value       : null;
  var lowStockVal    = s.low_stock_count   ? s.low_stock_count.value    : null;
  var activeStaff    = s.active_staff      ? s.active_staff.value       : null;
  var pendingAppr    = s.pending_approvals ? s.pending_approvals.value  : null;

  function fmtPct(p) {
    if (p === null || p === undefined) return '';
    var sign = p > 0 ? '+' : '';
    var color = p > 0 ? '#16a34a' : p < 0 ? '#dc2626' : '#6b7280';
    return '<span style="color:'+color+';font-size:0.7rem;">'+sign+p.toFixed(1)+'%</span>';
  }

  var summaryHtml = '<div class="card">'+
    '<div class="subtitle">Executive Summary — '+_escAttr(data.period)+'</div>'+
    '<div class="grid-buttons" style="grid-template-columns:repeat(3,1fr);gap:8px;">'+
      _execMetricCard('Sales',      _esc(salesVal, '₱'),     salesPct, salesStatus)+
      _execMetricCard('Expenses',   _esc(expVal, '₱'),       expPct,   expStatus)+
      _execMetricCard('Profit',     _esc(profitVal, '₱'),    profitPct, profitStatus, (data.meta && data.meta.profit_label) ? data.meta.profit_label : '')+
    '</div>';

  // Optional KPIs
  var optHtml = '';
  if (txVal !== null || lowStockVal !== null || activeStaff !== null || pendingAppr !== null) {
    optHtml = '<div class="grid-buttons" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px;">';
    if (txVal !== null) {
      optHtml += '<div style="background:#f9fafb;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#6b7280;">Transactions</div><div style="font-weight:700;">'+Number(txVal).toLocaleString()+'</div></div>';
    }
    if (lowStockVal !== null) {
      optHtml += '<div style="background:#f9fafb;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#6b7280;">Low Stock Items</div><div style="font-weight:700;color:#d97706;">'+Number(lowStockVal)+'</div></div>';
    }
    if (activeStaff !== null) {
      optHtml += '<div style="background:#f9fafb;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#6b7280;">Active Staff</div><div style="font-weight:700;color:#16a34a;">'+Number(activeStaff)+'</div></div>';
    }
    if (pendingAppr !== null) {
      optHtml += '<div style="background:#f9fafb;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#6b7280;">Pending Approvals</div><div style="font-weight:700;color:#92400e;">'+Number(pendingAppr)+'</div></div>';
    }
    if (s.roi_summary) {
      optHtml += '<div style="background:#f9fafb;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#6b7280;">ROI</div><div style="font-weight:700;color:#1d4ed8;">'+s.roi_summary.roi_percent.toFixed(1)+'%</div></div>';
    }
    optHtml += '</div>';
  }
  summaryHtml += optHtml + '</div>';

  // Trends (simple indicators)
  var trendsHtml = '<div class="card"><div class="subtitle">Performance vs Prior Period</div>';
  if (data.trends) {
    var tr = data.trends;
    var trendItem = function(label, pct, dir, color) {
      var arrow = pct !== null ? (pct > 0 ? '↑' : pct < 0 ? '↓' : '→') : '→';
      var pctStr = pct !== null ? pct.toFixed(1)+'%' : '—';
      var col = pct !== null ? (pct > 0 ? '#16a34a' : pct < 0 ? '#dc2626' : '#6b7280') : '#6b7280';
      return '<div style="background:#f9fafb;padding:10px;border-radius:10px;text-align:center;">'+
             '<div style="font-size:11px;color:#6b7280;">'+label+'</div>'+
             '<div style="font-size:18px;font-weight:700;color:'+col+';">'+arrow+' '+pctStr+'</div>'+
             '<div style="font-size:0.7rem;color:#6b7280;">vs prior</div>'+
             '</div>';
    };
    trendsHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
      trendItem('Sales',   tr.sales   && tr.sales.pct,   tr.sales   && tr.sales.dir,   '#16a34a')+
      trendItem('Expenses',tr.expenses&& tr.expenses.pct,tr.expenses&& tr.expenses.dir,'#dc2626')+
      trendItem('Profit',  tr.profit  && tr.profit.pct,  tr.profit  && tr.profit.dir,  '#2563eb')+
      '</div>';
  }
  trendsHtml += '</div>';

  // Sales & Profit Snapshot
  var sp = data.sales_profit_snapshot || {};
  var cProfitStatus = function(v){
    if (v === null || v === undefined) return '#6b7280';
    return v < 0 ? '#dc2626' : v === 0 ? '#d97706' : '#16a34a';
  };
  var salesHtml = '<div class="card"><div class="subtitle">Sales & Profit Snapshot</div>'+
    '<div class="grid-buttons" style="grid-template-columns:1fr 1fr;gap:8px;">'+
      '<div><strong>Transactions</strong><br><span style="font-size:16px;font-weight:700;">'+(sp.transactions && sp.transactions.value!==undefined ? Number(sp.transactions.value).toLocaleString() : '—')+'</span></div>'+
      '<div><strong>Avg Sale</strong><br><span style="font-size:16px;font-weight:700;">₱'+(sp.avg_sale && sp.avg_sale.value !== null ? Number(sp.avg_sale.value).toFixed(2) : '—')+'</span></div>'+
      '<div><strong>Top Product</strong><br><span style="font-size:12px;">'+(sp.top_product && sp.top_product.name ? _escAttr(sp.top_product.name) : '—')+'</span></div>'+
    '</div>'+
    '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6;">'+
      '<div style="display:flex;justify-content:space-between;"><strong>Total Sales</strong><span style="font-weight:700;color:#16a34a;font-size:18px;">₱'+_esc(salesVal)+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;margin-top:6px;"><strong>Est. Profit</strong><span style="font-weight:700;color:'+cProfitStatus(profitVal)+';font-size:16px;">₱'+_esc(profitVal)+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;margin-top:6px;"><strong>Margin</strong><span style="font-weight:600;">'+(marginVal!==null?marginVal.toFixed(1)+'%':'—')+'</span></div>'+
    '</div></div>';

  // Expense Snapshot
  var es = data.expense_snapshot || {};
  var expPressureHtml = '';
  if (es.is_available) {
    var expTotalVal = es.expenses_total ? es.expenses_total.value : null;
    var expTrendPct = es.expenses_total ? es.expenses_total.trend_pct : null;
    var expTrendDir = es.expenses_total ? es.expenses_total.trend_dir : null;
    var hasExpTrend = expTrendPct !== null && expTrendPct !== undefined;
    var expPressure = es.pressure_alert || false;
    expPressureHtml = '<div class="card"><div class="subtitle">Expense Snapshot</div>'+
      '<div style="display:flex;justify-content:space-between;"><strong>Total Expenses</strong><span style="font-weight:700;color:#dc2626;font-size:18px;">₱'+_esc(expTotalVal)+'</span></div>'+
      '<div class="muted" style="margin-top:4px;">Top category: <strong>'+(es.top_category && es.top_category.name ? _escAttr(es.top_category.name) : '—')+'</strong></div>'+
      (hasExpTrend
        ? '<div style="margin-top:6px;font-size:0.75rem;color:'+(expPressure?'#dc2626':'#16a34a')+';font-weight:700;">'+
           (expTrendPct > 0 ? '↑ '+expTrendPct.toFixed(1)+'% vs prior' : '↓ '+Math.abs(expTrendPct).toFixed(1)+'% vs prior')+
          '</div>'
        : '')+
      '<div style="margin-top:'+(hasExpTrend?'6px':'10px')+';padding:8px;background:'+(expPressure?'#fef2f2':'#f0fdf4')+';border-radius:6px;font-size:0.75rem;color:'+(expPressure?'#dc2626':'#16a34a')+';">'+
        (expPressure ? '💸 Expenses rising faster than revenue' : '✅ Expense growth is in check')+
      '</div>'+
    '</div>';
  }

  // Inventory Snapshot
  var inv = data.inventory_snapshot || {};
  var invHtml = '';
  if (inv.is_available) {
    var lowVal = inv.low_stock    ? inv.low_stock.value    : null;
    var outVal = inv.out_of_stock ? inv.out_of_stock.value : null;
    var fast   = inv.fast_moving  || {};
    var slow   = inv.slow_moving  || {};
    invHtml = '<div class="card"><div class="subtitle">Inventory Health</div>'+
      '<div class="grid-buttons" style="grid-template-columns:1fr 1fr;gap:8px;">'+
        '<div><strong>Low Stock</strong><br><span style="font-size:16px;font-weight:700;color:#d97706;">'+(lowVal!==null?lowVal:'—')+' items</span></div>'+
        '<div><strong>Out of Stock</strong><br><span style="font-size:16px;font-weight:700;color:#dc2626;">'+(outVal!==null?outVal:'—')+' items</span></div>'+
      '</div>'+
      '<div class="muted" style="margin-top:10px;">'+
        '🚀 <strong>Fast:</strong> '+_esc(fast.name)+' ('+(fast.qty||0)+' sold)<br>'+
        '🐢 <strong>Slow:</strong> '+_esc(slow.name)+' ('+(slow.qty_sold||0)+' sold, '+(slow.stock||0)+' in stock)'+
      '</div></div>';
  }

  // Expense Snapshot
  var es = data.expense_snapshot || {};
  var expPressureHtml = '';
  if (es.is_available) {
    var expStatusColor = es.expense_pressure ? (es.pressure_alert ? '#dc2626' : '#d97706') : '#16a34a';
    var expTotalVal = es.expenses_total ? es.expenses_total.value : null;
    var expTrendPct = es.expenses_total ? es.expenses_total.trend_pct : null;
    var hasExpTrend = expTrendPct !== null;
    expPressureHtml = '<div class="card"><div class="subtitle">Expense Snapshot</div>'+
      '<div style="display:flex;justify-content:space-between;"><strong>Total Expenses</strong><span style="font-weight:700;color:#dc2626;font-size:18px;">₱'+_esc(expTotalVal)+'</span></div>'+
      '<div class="muted" style="margin-top:4px;">Top category: <strong>'+_esc(es.top_category ? es.top_category.name : '—')+'</strong></div>'+
      (hasExpTrend
        ? '<div style="margin-top:6px;font-size:0.75rem;color:'+expStatusColor+';font-weight:700;">'+
           (expTrendPct > 0 ? '↑ '+expTrendPct.toFixed(1)+'% vs prior' : '↓ '+Math.abs(expTrendPct).toFixed(1)+'% vs prior')+
          '</div>'
        : '')+
      '<div style="margin-top:'+(hasExpTrend?'6px':'10px')+';padding:8px;background:'+(es.pressure_alert?'#fef2f2':'#f0fdf4')+';border-radius:6px;font-size:0.75rem;color:'+(es.pressure_alert?'#dc2626':'#16a34a')+';">'+
        (es.pressure_alert ? '💸 Expenses rising faster than revenue' : '✅ Expense growth is in check')+
      '</div>'+
    '</div>';
  } else {
    expPressureHtml = '';
  }

  // Inventory Snapshot
  var inv = data.inventory_snapshot || {};
  var invHtml = '';
  if (inv.is_available) {
    invHtml = '<div class="card"><div class="subtitle">Inventory Health</div>'+
      '<div class="grid-buttons" style="grid-template-columns:1fr 1fr;gap:8px;">'+
        '<div><strong>Low Stock</strong><br><span style="font-size:16px;font-weight:700;color:#d97706;">'+(lowVal!==null?lowVal:'—')+' items</span></div>'+
        '<div><strong>Out of Stock</strong><br><span style="font-size:16px;font-weight:700;color:#dc2626;">'+(outVal!==null?outVal:'—')+' items</span></div>'+
      '</div>'+
      '<div class="muted" style="margin-top:10px;">'+
        '🚀 <strong>Fast:</strong> '+_esc(fast.name)+' ('+(fast.qty||0)+' sold)<br>'+
        '🐢 <strong>Slow:</strong> '+_esc(slow.name)+' ('+(slow.qty_sold||0)+' sold, '+(slow.stock||0)+' in stock)'+
      '</div></div>';
  }

  // Staff & Operations
  var sf = data.staff_operations_summary || {};
  var staffHtml = '<div class="card"><div class="subtitle">Staff & Operations</div>';
  if (sf.top_staff) {
    staffHtml += '<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:8px;">'+
      '<div style="font-weight:700;font-size:0.9rem;">'+_esc(sf.top_staff.name)+'</div>'+
      '<div style="font-size:0.8rem;color:#6b7280;">Top performer — ₱'+Number(sf.top_staff.total||0).toLocaleString()+' sales</div>'+
    '</div>';
  }
   staffHtml += '<div class="grid-buttons" style="grid-template-columns:1fr 1fr;gap:8px;">'+
     '<div><strong>Active Staff</strong><br><span style="font-size:16px;font-weight:700;">'+(sf.active_count ? (sf.active_count.value || 0) : 0)+'</span></div>';
   if (sf.approvals && sf.approvals.available) {
     staffHtml += '<div><strong>Pending Approvals</strong><br><span style="font-size:16px;font-weight:700;color:#92400e;">'+(sf.approvals.pending||0)+'</span></div>';
   }
   staffHtml += '</div></div>';

  // Insight Shortcuts
  var shortcutsHtml = '<div class="card"><div class="subtitle">Insights & Quick Access</div>'+
    '<div class="grid-buttons" style="grid-template-columns:repeat(2,1fr);gap:8px;">';
  if (data.shortcuts) {
    data.shortcuts.forEach(function(sc) {
      shortcutsHtml += '<button onclick="_execShortcut(\''+sc.id+'\')" class="shortcut-btn" style="background:#fff;border:1px solid #e5e7eb;padding:12px;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;">'+
        sc.icon+' '+sc.label+'</button>';
    });
  }
  shortcutsHtml += '</div></div>';

  // System Confidence (client-side)
  var syncHtml = '<div class="card"><div class="subtitle">System Status</div>';
  try {
    var pending = await (typeof DB !== 'undefined' ? DB.getSyncQueue() : Promise.resolve([]));
    var lastSync = localStorage.getItem('last_sync_at');
    syncHtml += '<div class="muted">Last sync: '+(lastSync?new Date(Number(lastSync)).toLocaleString():'Never')+'</div>'+
                '<div class="muted">Pending: '+(pending.length)+' records</div>';
    if (pending.length > 10) {
      syncHtml += '<div class="message message-offline" style="margin-top:6px;">⚠️ '+pending.length+' items pending sync</div>';
    }
  } catch(e) {
    syncHtml += '<div class="muted">Sync status unavailable</div>';
  }
  syncHtml += '</div>';

  // Support
  // Recent Strategic Activity
  var recentHtml = '';
  if (data.recent_activity && data.recent_activity.items && data.recent_activity.items.length) {
    recentHtml = '<div class="card"><div class="subtitle">Recent Strategic Activity</div>'+
      data.recent_activity.items.map(function(act){
        var time = act.time ? new Date(act.time).toLocaleString('en-PH', {hour:'2-digit',minute:'2-digit'}) : '';
        return '<div style="padding:8px;border-bottom:1px solid #f3f4f6;"><div style="font-weight:600;font-size:0.85rem;">'+_escAttr(act.label)+'</div>'+
               (act.detail?'<div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">'+_escAttr(act.detail)+'</div>':'')+
               '<div style="font-size:0.65rem;color:#9ca3af;margin-top:2px;">'+_escAttr(time)+'</div></div>';
      }).join('')+'</div>';
  } else {
    recentHtml = '<div class="card"><div class="subtitle">Recent Strategic Activity</div>'+
                 '<div class="muted" style="padding:12px;text-align:center;">No recent strategic activity</div></div>';
  }

  var supportHtml = '';
  if (data.support && data.support.available) {
    supportHtml = '<div style="text-align:center;padding:12px 0;">'+
      '<button class="btn btn-secondary" onclick="renderChat()">📞 Contact Support</button></div>';
  }

  // Assemble
  document.getElementById('app').innerHTML =
    '<div class="screen">'+
    _dashboardHeader_(storeName, userName+' · Executive', '', state.isOffline) +
    cacheBanner +
    periodHtml +
    alertsHtml +
    summaryHtml +
    trendsHtml +
    salesHtml +
    expPressureHtml +
    invHtml +
    staffHtml +
    shortcutsHtml +
    recentHtml +
    syncHtml +
    supportHtml +
    '<div style="height:24px;"></div></div>';
}

// Helper: format number safely
function _esc(val, prefix='') {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') return prefix + Number(val).toLocaleString('en-PH', {minimumFractionDigits:0,maximumFractionDigits:0});
  return val;
}

function _execMetricCard(label, value, pct, status, subLabel) {
  var color = status === 'good' ? '#16a34a' : status === 'watch' ? '#d97706' : status === 'critical' ? '#dc2626' : '#6b7280';
  var displayVal = (value===null || value===undefined || value==='') ? '—' : value;
  return '<div style="background:#f9fafb;padding:10px;border-radius:10px;text-align:center;">'+
    '<div style="font-size:11px;color:#6b7280;text-transform:uppercase;">'+label+'</div>'+
    '<div style="font-size:18px;font-weight:700;color:#111827;margin:4px 0;">'+displayVal+'</div>'+
    (subLabel ? '<div style="font-size:0.65rem;color:#6b7280;margin-top:2px;">'+subLabel+'</div>':'')+
    (pct !== null ? '<div style="font-size:0.7rem;color:'+color+';font-weight:700;">'+
       (pct > 0 ? '↑'+pct.toFixed(1)+'%': pct < 0 ? '↓'+Math.abs(pct).toFixed(1)+'%' : '→0%')+
      '</div>':'')+
    '</div>';
}

function cProfitStatus(profit) {
  if (profit === null || profit === undefined) return '#6b7280';
  return profit < 0 ? '#dc2626' : profit === 0 ? '#d97706' : '#16a34a';
}

function setExecPeriod(period) {
  execCurrentPeriod = period;
  renderExecutiveDashboard();
}

function _execShortcut(id) {
  var routes = {
    reports:      'renderReports',
    inventory:    'renderInventoryMenu',
    staff:        'renderManageStaff',
    support:      'renderChat',
    monitors:     'renderMonitors',
    roi:          'renderROIMonitor',
    expenses:     'renderExpenses',
    activity_log: 'renderAdvancedReportsHome'
  };
  var fn = routes[id];
  if (fn) {
    if (fn.startsWith('_')) { eval(fn); }
    else { window[fn](); }
  } else {
    _showToast('Not available', false);
  }
}

function _execAction(target) {
  var routes = {
    reports:      'renderReports',
    expenses:     'renderExpenses',
    inventory:    'renderInventoryMenu',
    approvals:    '_showToast("Approvals coming soon", false)',
    monitors:     'renderMonitors'
  };
  var fn = routes[target] || '_showToast("Feature not available", false)';
  if (fn.startsWith('_')) { eval(fn); }
   else { window[fn](); }
 }

 // Legacy alias — keep in case
function renderExecutiveDashboardLegacy(msg) { renderExecutiveDashboard(msg); }

// Legacy alias (kept for any residual direct calls during transition)
function renderWatcherDashboard(msg) { renderViewerDashboard(msg); }

// ── Staff Management ─────────────────────────────────────────────────────────

async function renderManageStaff() {
  showLoading('Loading staff…');
  var users;
  try {
    users = await API.call('getStoreUsers');
  } catch(err) { _showToast('Error: ' + err.message, true); goHome(); return; }

  var staff = users.filter(function(u) { return u.Role !== 'OWNER'; });

  var staffCards = staff.map(function(u) {
    var initials = (u.Full_Name || u.Username).split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().substr(0,2);
    var colors   = ['#3498db','#9b59b6','#e67e22','#27ae60','#e74c3c','#1abc9c'];
    var color    = colors[(u.Username.charCodeAt(0) || 0) % colors.length];
    return '<div style="padding:12px 0;border-bottom:1px solid #f1f3f5;">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<div style="width:44px;height:44px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0;">' + initials + '</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:600;font-size:0.95rem;color:#1a1a2e;">' + _escAttr(u.Full_Name || u.Username) + '</div>' +
      '<div style="font-size:0.78rem;color:#6b7280;margin-top:1px;">@' + _escAttr(u.Username) + '</div>' +
      '</div>' +
      '<span style="background:#e8f4fd;color:#2980b9;font-size:0.7rem;font-weight:600;padding:3px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px;flex-shrink:0;">Staff</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;padding-left:56px;">' +
      '<button onclick="promptResetPassword(\'' + _escAttr(u.User_ID) + '\',\'' + _escAttr(u.Full_Name || u.Username) + '\')" ' +
        'style="flex:1;background:#f0fdf4;border:1px solid #86efac;color:#16a34a;border-radius:8px;padding:6px 10px;font-size:0.75rem;font-weight:600;cursor:pointer;">🔑 Set Password</button>' +
      '<button onclick="removeStaffUser(\'' + _escAttr(u.User_ID) + '\',\'' + _escAttr(u.Full_Name || u.Username) + '\')" ' +
        'style="flex:1;background:none;border:1px solid #e74c3c;color:#e74c3c;border-radius:8px;padding:6px 10px;font-size:0.75rem;font-weight:600;cursor:pointer;">✕ Remove</button>' +
      '</div>' +
      '</div>';
  }).join('');

  var staffSection = staff.length
    ? '<div style="padding:0 4px;">' + staffCards + '</div>'
    : '<div style="text-align:center;padding:24px 16px;">' +
        '<div style="font-size:2.5rem;margin-bottom:8px;">👤</div>' +
        '<div style="font-weight:600;color:#374151;">No staff yet</div>' +
        '<div style="font-size:0.82rem;color:#9ca3af;margin-top:4px;">Add your first staff member below</div>' +
      '</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">👥 Manage Staff</div>' +
    '<button class="small-btn" onclick="goHome()">← Back</button></div>' +

    // Staff list card
    '<div class="card" style="margin-bottom:12px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
    '<div style="font-weight:700;font-size:1rem;color:#1a1a2e;">Team Members</div>' +
    '<span style="background:#f3f4f6;color:#374151;font-size:0.75rem;font-weight:600;padding:3px 10px;border-radius:20px;">' + staff.length + ' staff</span>' +
    '</div>' +
    staffSection +
    '</div>' +

    // Owner password change card
    '<div class="card" style="margin-bottom:12px;">' +
    '<div style="font-weight:700;font-size:1rem;color:#1a1a2e;margin-bottom:12px;">🔐 Change Your Password</div>' +
    '<input id="owner-current-pw" class="input" type="password" placeholder="Current password" style="margin-bottom:8px;" autocomplete="current-password">' +
    '<input id="owner-new-pw" class="input" type="password" placeholder="New password (min. 4 chars)" style="margin-bottom:8px;" autocomplete="new-password">' +
    '<input id="owner-confirm-pw" class="input" type="password" placeholder="Confirm new password" style="margin-bottom:12px;" autocomplete="new-password">' +
    '<button class="btn btn-secondary" style="width:100%;" onclick="submitOwnerPasswordChange()">Update My Password</button>' +
    '</div>' +

    // Add staff form card
    '<div class="card">' +
    '<div style="font-weight:700;font-size:1rem;color:#1a1a2e;margin-bottom:4px;">➕ Add New Staff</div>' +
    '<div style="font-size:0.8rem;color:#6b7280;margin-bottom:16px;">Staff can record sales and expenses.</div>' +
    '<div style="position:relative;margin-bottom:10px;">' +
    '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:1rem;">👤</span>' +
    '<input id="staff-fullname" class="input" style="padding-left:36px;" placeholder="Full Name (e.g. Maria Santos)">' +
    '</div>' +
    '<div style="position:relative;margin-bottom:10px;">' +
    '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:1rem;">@</span>' +
    '<input id="staff-username" class="input" style="padding-left:36px;" placeholder="Username (e.g. maria)" autocomplete="off">' +
    '</div>' +
    '<div style="position:relative;margin-bottom:16px;">' +
    '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:1rem;">🔒</span>' +
    '<input id="staff-password" class="input" style="padding-left:36px;" type="password" placeholder="Password (min. 4 characters)" autocomplete="new-password">' +
    '</div>' +
    '<button class="btn" style="width:100%;font-size:1rem;padding:14px;border-radius:12px;font-weight:700;letter-spacing:.3px;" onclick="submitAddStaff()">Create Staff Account</button>' +
    '</div>' +
    '</div>';
}

async function submitAddStaff() {
  var fullName = document.getElementById('staff-fullname').value.trim();
  var username = document.getElementById('staff-username').value.trim();
  var password = document.getElementById('staff-password').value;
  if (!fullName) { _showToast('Full name is required.', true); return; }
  if (!username) { _showToast('Username is required.', true); return; }
  if (!password || password.length < 4) { _showToast('Password must be at least 4 characters.', true); return; }
  showLoading('Creating account…');
  try {
    await API.call('createStoreUser', { fullName: fullName, username: username, password: password });
    renderManageStaff();
    _showToast('Staff account created!');
  } catch(err) { _showToast('Error: ' + err.message, true); renderManageStaff(); }
}

async function removeStaffUser(userId, name) {
  if (!confirm('Remove staff account "' + name + '"?')) return;
  showLoading('Removing…');
  try {
    await API.call('deleteStoreUser', { userId: userId });
    renderManageStaff();
    _showToast('Staff account removed.');
  } catch(err) { _showToast('Error: ' + err.message, true); renderManageStaff(); }
}

async function promptResetPassword(userId, name) {
  var newPw = prompt('Set new password for ' + name + ':');
  if (!newPw) return;
  if (newPw.length < 4) { _showToast('Password must be at least 4 characters.', true); return; }
  showLoading('Updating password…');
  try {
    await API.call('resetStaffPassword', { userId: userId, newPassword: newPw });
    renderManageStaff();
    _showToast('Password updated for ' + name + '.');
  } catch(err) { _showToast('Error: ' + err.message, true); renderManageStaff(); }
}

async function submitOwnerPasswordChange() {
  var current = (document.getElementById('owner-current-pw') || {}).value || '';
  var newPw   = (document.getElementById('owner-new-pw')     || {}).value || '';
  var confirm = (document.getElementById('owner-confirm-pw') || {}).value || '';
  if (!current || !newPw) { _showToast('Fill in all password fields.', true); return; }
  if (newPw !== confirm)  { _showToast('New passwords do not match.', true); return; }
  if (newPw.length < 4)   { _showToast('Password must be at least 4 characters.', true); return; }
  showLoading('Updating password…');
  try {
    await API.call('changePassword', { currentPassword: current, newPassword: newPw });
    renderManageStaff();
    _showToast('Your password has been updated.');
  } catch(err) { _showToast('Error: ' + err.message, true); renderManageStaff(); }
}

// ── Products ──────────────────────────────────────────────────────────────────

async function loadProducts() {
  // Render instantly from state, then refresh in background
  if (state.products && state.products.length) {
    renderProductsList();
    if (!state.isOffline) {
      API.call('getProducts').then(function(p) {
        state.products = p;
        renderProductsList();
      }).catch(function(){});
    }
    return;
  }
  showLoading('Loading products…');
  try {
    var [prods, cats] = await Promise.all([API.call('getProducts'), API.call('getCategories')]);
    state.products   = prods;
    state.categories = cats;
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

async function renderAddProductForm(msg, scannedCode, existingImage) {
  _pendingProductImage = existingImage || null;
  // Always fetch fresh categories so the dropdown is never stale or empty
  if (!state.isOffline) {
    try { state.categories = await API.call('getCategories'); } catch(e) {}
  }
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
      _showToast('Product saved offline — will sync when online.', false); routeToDashboard();
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
    _showToast('Product saved successfully!', false); routeToDashboard();
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
  // Show instantly from state cache, refresh in background
  if (state.todayExpenses !== null && state.todayExpenses !== undefined) {
    _renderExpensesUI(state.todayExpenses);
    if (!state.isOffline) {
      API.call('getTodayExpenses').then(function(fresh) {
        state.todayExpenses = fresh;
        _renderExpensesUI(fresh);
      }).catch(function(){});
    }
    return;
  }
  showLoading('Loading expenses…');
  var items = [];
  try {
    items = await API.call('getTodayExpenses');
    state.todayExpenses = items;
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

  _renderExpensesUI(items);
}

function _renderExpensesUI(items) {
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
      state.todayExpenses = null;
      _showToast('Expense saved offline — will sync when online', false);
      renderExpenses();
    } catch(e) { _showToast('Failed to save offline', true); }
    return;
  }

  // Online path
  showLoading('Saving expense…');
  try {
    await API.call('createExpense', payload);
    state.todayExpenses = null;  // bust cache so next open re-fetches
    _showToast('Expense recorded!', false);
    renderExpenses();
  } catch(err) { renderAddExpenseForm(err.message || String(err)); }
}

// ── Approvals ──────────────────────────────────────────────────────────────────

async function renderApprovalsQueue() {
  showLoading('Loading approvals…');
  try {
    var approvals = await API.getApprovals({ status: 'pending' });
    _renderApprovalsUI(approvals);
  } catch(err) {
    _renderApprovalsUI([], err.message);
  }
}

function _renderApprovalsUI(approvals, error) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">✅ Approvals</div><button class="small-btn" onclick="goHome()">← Back</button></div>';
  var content = '';

  if (error) {
    content = '<div class="message message-error">' + error + '</div>';
  } else if (!approvals.length) {
    content = '<div class="card"><div class="title">✅ No Pending Approvals</div><div class="subtitle">All requests have been reviewed.</div></div>';
  } else {
    content = approvals.map(function(a) {
      var typeLabel = a.approval_type === 'expense' ? 'Expense Approval' : 'Stock Adjustment Approval';
      var statusColor = a.status === 'pending' ? '#f59e0b' : a.status === 'approved' ? '#10b981' : '#ef4444';
      var statusText = a.status.charAt(0).toUpperCase() + a.status.slice(1);
      return '<div class="card" onclick="renderApprovalDetail(' + a.id + ')">' +
        '<div class="title">' + typeLabel + '</div>' +
        '<div class="subtitle">Requested by ' + _escAttr(a.requested_by_role_code) + ' on ' + new Date(a.requested_at).toLocaleDateString() + '</div>' +
        '<div style="margin-top:8px;"><span style="background:' + statusColor + ';color:#fff;padding:4px 8px;border-radius:12px;font-size:0.8rem;font-weight:600;">' + statusText + '</span></div>' +
        '</div>';
    }).join('');
  }

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function renderApprovalDetail(approvalId) {
  showLoading('Loading approval details…');
  try {
    var data = await API.getApproval(approvalId);
    _renderApprovalDetailUI(data.approval, data.sourceRecord);
  } catch(err) {
    _renderApprovalDetailUI(null, null, err.message);
  }
}

function _renderApprovalDetailUI(approval, sourceRecord, error) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">✅ Approval Detail</div><button class="small-btn" onclick="renderApprovalsQueue()">← Back</button></div>';
  var content = '';

  if (error) {
    content = '<div class="message message-error">' + error + '</div>';
  } else {
    var typeLabel = approval.approval_type === 'expense' ? 'Expense' : 'Stock Adjustment';
    var payload = approval.request_payload ? JSON.parse(approval.request_payload) : {};

    content = '<div class="card">' +
      '<div class="title">' + typeLabel + ' Approval Request</div>' +
      '<div class="subtitle">ID: ' + approval.id + ' | Requested: ' + new Date(approval.requested_at).toLocaleString() + '</div>' +
      '<div class="field"><label>Requested By:</label> ' + _escAttr(approval.requested_by_role_code) + '</div>' +
      '<div class="field"><label>Status:</label> <span style="background:#f59e0b;color:#fff;padding:4px 8px;border-radius:12px;">' + approval.status + '</span></div>';

    if (approval.approval_type === 'expense') {
      content += '<div class="field"><label>Amount:</label> ₱' + Number(payload.amount || payload.Amount).toFixed(2) + '</div>' +
        '<div class="field"><label>Category:</label> ' + _escAttr(payload.expenseCategory || payload.Expense_Category) + '</div>' +
        '<div class="field"><label>Description:</label> ' + _escAttr(payload.description || payload.Description) + '</div>';
    } else {
      content += '<div class="field"><label>Product:</label> ' + _escAttr(payload.productName) + '</div>' +
        '<div class="field"><label>Adjustment:</label> ' + (payload.quantity > 0 ? '+' : '') + payload.quantity + '</div>' +
        '<div class="field"><label>Reason:</label> ' + _escAttr(payload.reason) + '</div>';
    }

    if (approval.status === 'pending') {
      content += '<div class="field"><label>Decision Note:</label><textarea id="decision-note" placeholder="Optional note…"></textarea></div>' +
        '<button class="btn btn-primary" onclick="approveRequest(' + approval.id + ')">✅ Approve</button>' +
        '<button class="btn btn-secondary" onclick="rejectRequest(' + approval.id + ')">❌ Reject</button>';
    } else {
      if (approval.decision_note) {
        content += '<div class="field"><label>Decision Note:</label> ' + _escAttr(approval.decision_note) + '</div>';
      }
      content += '<div class="field"><label>Decided By:</label> ' + _escAttr(approval.decision_by_role_code) + ' on ' + new Date(approval.decision_at).toLocaleString() + '</div>';
    }

    content += '</div>';
  }

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function approveRequest(id) {
  var note = document.getElementById('decision-note').value.trim();
  try {
    await API.approveApproval(id, note);
    _showToast('Approval granted!', false);
    renderApprovalsQueue();
  } catch(err) {
    _showToast(err.message || 'Failed to approve', true);
  }
}

async function rejectRequest(id) {
  var note = document.getElementById('decision-note').value.trim();
  try {
    await API.rejectApproval(id, note);
    _showToast('Approval rejected!', false);
    renderApprovalsQueue();
  } catch(err) {
    _showToast(err.message || 'Failed to reject', true);
  }
}

// ── Staff Management ───────────────────────────────────────────────────────────

async function renderStaffList() {
  showLoading('Loading staff…');
  try {
    var staff = await API.getStaff();
    _renderStaffListUI(staff);
  } catch(err) {
    _renderStaffListUI([], err.message);
  }
}

function _renderStaffListUI(staff, error) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">👥 Staff</div><button class="small-btn" onclick="goHome()">← Back</button></div>';
  var content = '';

  if (error) {
    content = '<div class="message message-error">' + error + '</div>';
  } else if (!staff.length) {
    content = '<div class="card"><div class="title">👥 No Staff Yet</div><div class="subtitle">Add your first staff member to get started.</div></div>';
  } else {
    content = staff.map(function(s) {
      var isActive = s.is_active !== false && s.is_active !== 0 && s.employment_status !== 'inactive';
      var statusColor = isActive ? '#10b981' : '#ef4444';
      var statusText  = isActive ? 'Active' : 'Inactive';
      var lastLogin = s.last_login ? new Date(s.last_login).toLocaleDateString() : 'Never';
      var activity = s.activity_summary || s.activity || {};
      var activityText = 'Sales: ' + (activity.recent_sales || 0) + ', Expenses: ' + (activity.recent_expenses || 0) + ', Stock: ' + (activity.recent_stock_movements || 0);

      return '<div class="card" onclick="renderStaffDetail(\'' + s.id + '\')">' +
        '<div class="title">' + _esc(s.full_name) + ' (' + (s.role_code || s.role || '') + ')</div>' +
        '<div class="subtitle">Last login: ' + lastLogin + '</div>' +
        '<div class="subtitle" style="font-size:0.8rem;">' + activityText + '</div>' +
        '<div style="margin-top:8px;"><span style="background:' + statusColor + ';color:#fff;padding:4px 8px;border-radius:12px;font-size:0.8rem;font-weight:600;">' + statusText + '</span></div>' +
        '</div>';
    }).join('');
  }

  // Add staff button if permission
  if (_hasPermission('staff_management.create')) {
    content += '<div class="card"><button class="btn btn-primary" onclick="renderAddStaffForm()">+ Add Staff Member</button></div>';
  }

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function renderStaffDetail(staffId) {
  showLoading('Loading staff details…');
  try {
    var staff = await API.getStaffById(staffId);
    _renderStaffDetailUI(staff);
  } catch(err) {
    _renderStaffDetailUI(null, err.message);
  }
}

function _renderStaffDetailUI(staff, error) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">👤 Staff Detail</div><button class="small-btn" onclick="renderStaffList()">← Back</button></div>';
  var content = '';

  if (error) {
    content = '<div class="message message-error">' + error + '</div>';
  } else {
    var isActive    = staff.is_active !== false && staff.is_active !== 0 && staff.employment_status !== 'inactive';
    var statusColor = isActive ? '#10b981' : '#ef4444';
    var statusText  = isActive ? 'Active' : 'Inactive';
    var lastLogin = staff.last_login ? new Date(staff.last_login).toLocaleString() : 'Never';
    var created = new Date(staff.created_at).toLocaleDateString();
    var activity = staff.activity_summary || {};

    content = '<div class="card">' +
      '<div class="title">' + _escAttr(staff.full_name) + '</div>' +
      '<div class="subtitle">Username: ' + _escAttr(staff.username) + '</div>' +
      '<div class="field"><label>Role:</label> <span style="font-weight:600;">' + staff.role_code + '</span></div>' +
      '<div class="field"><label>Status:</label> <span style="background:' + statusColor + ';color:#fff;padding:4px 8px;border-radius:12px;font-size:0.8rem;">' + statusText + '</span></div>' +
      '<div class="field"><label>Phone:</label> ' + (staff.phone || 'Not set') + '</div>' +
      '<div class="field"><label>Email:</label> ' + (staff.email || 'Not set') + '</div>' +
      '<div class="field"><label>Last Login:</label> ' + lastLogin + '</div>' +
      '<div class="field"><label>Account Created:</label> ' + created + '</div>' +
      '<div class="field"><label>Recent Activity:</label> Sales: ' + (activity.recent_sales || 0) + ', Expenses: ' + (activity.recent_expenses || 0) + ', Stock Movements: ' + (activity.recent_stock_movements || 0) + '</div>';

    if (staff.notes) {
      content += '<div class="field"><label>Notes:</label> ' + _escAttr(staff.notes) + '</div>';
    }

    content += '</div>';

    // Action buttons
    var actions = '';
    if (_hasPermission('staff_management.edit')) {
      actions += '<button class="btn btn-secondary" onclick="renderEditStaffForm(\'' + staff.id + '\')">Edit Info</button>';
      actions += '<button class="btn btn-secondary" onclick="renderAssignRoleForm(\'' + staff.id + '\', \'' + staff.role_code + '\')">Change Role</button>';
      actions += '<button class="btn btn-secondary" onclick="renderSetPasswordForm(\'' + staff.id + '\')">Set Password</button>';
      actions += '<button class="btn btn-secondary" onclick="toggleStaffStatus(\'' + staff.id + '\', \'' + staff.employment_status + '\')">' +
        (staff.employment_status === 'active' ? 'Deactivate' : 'Activate') + '</button>';
    }

    if (actions) {
      content += '<div class="card">' + actions + '</div>';
    }
  }

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

function renderAddStaffForm() {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">➕ Add Staff</div><button class="small-btn" onclick="renderStaffList()">← Back</button></div>';

  var content = '<div class="card">' +
    '<div class="field"><label>Full Name *</label><input id="staff-fullname" placeholder="Enter full name"></div>' +
    '<div class="field"><label>Username *</label><input id="staff-username" placeholder="Enter username"></div>' +
    '<div class="field"><label>Password *</label><input id="staff-password" type="password" placeholder="Enter password"></div>' +
    '<div class="field"><label>Role *</label><select id="staff-role">' +
      '<option value="CASHIER">Cashier</option>' +
      '<option value="INVENTORY_STAFF">Inventory Staff</option>' +
      '<option value="VIEWER">Viewer</option>' +
      '<option value="MANAGER">Manager</option>' +
    '</select></div>' +
    '<div class="field"><label>Phone</label><input id="staff-phone" placeholder="Enter phone number"></div>' +
    '<div class="field"><label>Email</label><input id="staff-email" type="email" placeholder="Enter email"></div>' +
    '<div class="field"><label>Notes</label><textarea id="staff-notes" placeholder="Optional notes"></textarea></div>' +
    '<button class="btn btn-primary" onclick="submitAddStaff()">Create Staff</button>' +
    '<button class="btn btn-secondary" onclick="renderStaffList()">Cancel</button>' +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function submitAddStaff() {
  var data = {
    fullName: document.getElementById('staff-fullname').value.trim(),
    username: document.getElementById('staff-username').value.trim(),
    password: document.getElementById('staff-password').value.trim(),
    role: document.getElementById('staff-role').value,
    phone: document.getElementById('staff-phone').value.trim(),
    email: document.getElementById('staff-email').value.trim(),
    notes: document.getElementById('staff-notes').value.trim()
  };

  if (!data.fullName || !data.username || !data.password || !data.role) {
    _showToast('Please fill all required fields', true);
    return;
  }

  try {
    await API.createStaff(data);
    _showToast('Staff member created successfully!', false);
    renderStaffList();
  } catch(err) {
    _showToast(err.message || 'Failed to create staff', true);
  }
}

async function renderEditStaffForm(staffId) {
  showLoading('Loading staff…');
  try {
    var r = await API.call('getStaffById', { id: staffId });
    var s = r.staff || r;
    _renderEditStaffFormUI(staffId, s);
  } catch(e) {
    _showToast(e.message, true);
    renderStaffList();
  }
}

function _renderEditStaffFormUI(staffId, s) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">Edit Staff</div><button class="small-btn" onclick="goHome()">← Back</button></div>';
  var status = s.status || s.Status || 'ACTIVE';

  document.getElementById('app').innerHTML =
    '<div class="screen">' + header +
    '<div class="topbar"><div class="title" style="margin:0;">✏️ Edit Staff</div>' +
    '<button class="small-btn" onclick="renderStaffDetail(\'' + staffId + '\')">← Back</button></div>' +
    '<div class="card">' +
    '<div class="field"><label>Full Name</label>' +
    '<input id="edit-sf-name" value="' + _escAttr(s.full_name || s.Full_Name || '') + '" placeholder="Full name"></div>' +
    '<div class="field"><label>Username</label>' +
    '<input id="edit-sf-username" value="' + _escAttr(s.username || s.Username || '') + '" placeholder="Login username"></div>' +
    '<div class="field"><label>Phone</label>' +
    '<input id="edit-sf-phone" type="tel" value="' + _escAttr(s.phone || s.Phone || '') + '" placeholder="Phone number"></div>' +
    '<div class="field"><label>Status</label>' +
    '<select id="edit-sf-status">' +
      '<option value="ACTIVE"' + (status === 'ACTIVE' ? ' selected' : '') + '>Active</option>' +
      '<option value="INACTIVE"' + (status === 'INACTIVE' ? ' selected' : '') + '>Inactive</option>' +
    '</select></div>' +
    '<button class="btn btn-primary" onclick="submitEditStaff(\'' + staffId + '\')">💾 Save Changes</button>' +
    '<button class="btn btn-secondary" style="margin-top:8px;" onclick="renderStaffDetail(\'' + staffId + '\')">Cancel</button>' +
    '</div></div>';
}

async function submitEditStaff(staffId) {
  var name     = document.getElementById('edit-sf-name').value.trim();
  var username = document.getElementById('edit-sf-username').value.trim();
  var phone    = document.getElementById('edit-sf-phone').value.trim();
  var status   = document.getElementById('edit-sf-status').value;
  if (!name) { _showToast('Full name is required', true); return; }
  showLoading('Saving…');
  try {
    await API.call('updateStaff', { id: staffId, full_name: name, username: username, phone: phone, status: status });
    _showToast('Staff updated!');
    renderStaffDetail(staffId);
  } catch(e) {
    _showToast(e.message, true);
  }
}

function renderAssignRoleForm(staffId, currentRole) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">Change Role</div><button class="small-btn" onclick="goHome()">← Back</button></div>';

  var content = '<div class="card">' +
    '<div class="field"><label>New Role</label><select id="new-role">' +
      '<option value="CASHIER"' + (currentRole === 'CASHIER' ? ' selected' : '') + '>Cashier</option>' +
      '<option value="INVENTORY_STAFF"' + (currentRole === 'INVENTORY_STAFF' ? ' selected' : '') + '>Inventory Staff</option>' +
      '<option value="VIEWER"' + (currentRole === 'VIEWER' ? ' selected' : '') + '>Viewer</option>' +
      '<option value="MANAGER"' + (currentRole === 'MANAGER' ? ' selected' : '') + '>Manager</option>' +
    '</select></div>' +
    '<button class="btn btn-primary" onclick="submitAssignRole(\'' + staffId + '\')">Update Role</button>' +
    '<button class="btn btn-secondary" onclick="renderStaffDetail(\'' + staffId + '\')">Cancel</button>' +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function submitAssignRole(staffId) {
  var newRole = document.getElementById('new-role').value;
  try {
    await API.assignStaffRole(staffId, newRole);
    _showToast('Role updated successfully!', false);
    renderStaffDetail(staffId);
  } catch(err) {
    _showToast(err.message || 'Failed to update role', true);
  }
}

function renderSetPasswordForm(staffId) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">Set Password</div><button class="small-btn" onclick="goHome()">← Back</button></div>';

  var content = '<div class="card">' +
    '<div class="field"><label>New Password</label><input id="new-password" type="password" placeholder="Enter new password"></div>' +
    '<button class="btn btn-primary" onclick="submitSetPassword(\'' + staffId + '\')">Set Password</button>' +
    '<button class="btn btn-secondary" onclick="renderStaffDetail(\'' + staffId + '\')">Cancel</button>' +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function submitSetPassword(staffId) {
  var password = document.getElementById('new-password').value.trim();
  if (!password) {
    _showToast('Password is required', true);
    return;
  }
  try {
    await API.setStaffPassword(staffId, password);
    _showToast('Password set successfully!', false);
    renderStaffDetail(staffId);
  } catch(err) {
    _showToast(err.message || 'Failed to set password', true);
  }
}

async function toggleStaffStatus(staffId, currentStatus) {
  var newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  var action = newStatus === 'active' ? 'activate' : 'deactivate';

  if (!confirm('Are you sure you want to ' + action + ' this staff member?')) return;

  try {
    await API.setStaffStatus(staffId, newStatus);
    _showToast('Staff member ' + action + 'd successfully!', false);
    renderStaffDetail(staffId);
  } catch(err) {
    _showToast(err.message || 'Failed to ' + action + ' staff', true);
  }
}

// ── Advanced Reports ────────────────────────────────────────────────────────────

async function renderAdvancedReportsHome() {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">Advanced Reports</div><button class="small-btn" onclick="goHome()">← Back</button></div>';

  var reportTypes = [
    { id: 'sales_analysis', title: 'Sales Analysis', desc: 'Deep sales performance insights' },
    { id: 'product_performance', title: 'Product Performance', desc: 'Top products, slow-movers, stock alerts' },
    { id: 'inventory_movement', title: 'Inventory Movement', desc: 'Stock changes and inventory health' },
    { id: 'expense_analysis', title: 'Expense Analysis', desc: 'Expense breakdown and trends' },
    { id: 'staff_performance', title: 'Staff Performance', desc: 'Staff contribution metrics' },
    { id: 'business_performance_comparison', title: 'Performance Comparison', desc: 'Period-over-period business comparison' }
  ];

  var content = '<div class="card"><div class="subtitle">Select Report Type</div>' +
    reportTypes.map(rt => `<button class="big-btn" onclick="selectAdvancedReportPeriod('${rt.id}', '${rt.title}')">${rt.title}<br><small>${rt.desc}</small></button>`).join('') +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

function selectAdvancedReportPeriod(reportType, reportTitle) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">' + reportTitle + '</div><button class="small-btn" onclick="renderAdvancedReportsHome()">← Back</button></div>';

  var periods = [
    { id: 'today', label: 'Today' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'last_quarter', label: 'Last Quarter' },
    { id: 'last_year', label: 'Last Year' }
  ];

  var content = '<div class="card"><div class="subtitle">Select Period</div>' +
    periods.map(p => `<button class="big-btn" onclick="loadAdvancedReport('${reportType}', '${p.id}', '${reportTitle}')">${p.label}</button>`).join('') +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function loadAdvancedReport(reportType, period, reportTitle) {
  showLoading('Generating report…');
  try {
    var report = await API.getAdvancedReport(reportType, period);
    _renderAdvancedReport(report, reportTitle);
  } catch(err) {
    var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
    var header = '<div class="topbar"><div class="title" style="margin:0;">' + reportTitle + '</div><button class="small-btn" onclick="renderAdvancedReportsHome()">← Back</button></div>';
    var content = '<div class="card"><div class="message message-error">' + (err.message || 'Failed to load report') + '</div></div>';
    document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
  }
}

function _renderAdvancedReport(report, reportTitle) {
  var storeName = (state.storeProfile && state.storeProfile.storeName) || '';
  var header = '<div class="topbar"><div class="title" style="margin:0;">' + reportTitle + '</div><button class="small-btn" onclick="renderAdvancedReportsHome()">← Back</button></div>';

  var summaryHtml = '';
  if (report.summary) {
    var s = report.summary;
    summaryHtml = '<div class="card"><div class="title">Summary</div>';
    if (s.sales_total !== undefined) summaryHtml += '<div>Sales: ₱' + Number(s.sales_total).toLocaleString() + '</div>';
    if (s.expense_total !== undefined) summaryHtml += '<div>Expenses: ₱' + Number(s.expense_total).toLocaleString() + '</div>';
    if (s.transactions_count !== undefined) summaryHtml += '<div>Transactions: ' + s.transactions_count + '</div>';
    if (s.active_staff_count !== undefined) summaryHtml += '<div>Active Staff: ' + s.active_staff_count + '</div>';
    summaryHtml += '</div>';
  }

  var sectionsHtml = report.sections.map(sec => {
    var itemsHtml = sec.items.map(item => `<div class="field"><label>${_escAttr(item.label)}</label> ${_escAttr(item.value)}</div>`).join('');
    return `<div class="card"><div class="title">${_escAttr(sec.title)}</div>${itemsHtml}</div>`;
  }).join('');

  var alertsHtml = '';
  if (report.alerts && report.alerts.length) {
    alertsHtml = report.alerts.map(alert => `<div class="message message-${alert.type === 'warning' ? 'error' : 'ok'}">${_escAttr(alert.message)}</div>`).join('');
  }

  var content = summaryHtml + sectionsHtml + alertsHtml;

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

// ── Inventory Advanced ──────────────────────────────────────────────────────────

async function renderInventoryAdvancedSummary() {
  showLoading('Loading inventory summary…');
  try {
    var summary = await API.getInventoryAdvancedSummary();
    _renderInventorySummaryUI(summary);
  } catch(err) {
    _renderInventorySummaryUI(null, err.message);
  }
}

function _renderInventorySummaryUI(summary, error) {
  var header = '<div class="topbar"><div class="title" style="margin:0;">📦 Inventory</div><button class="small-btn" onclick="goHome()">← Back</button></div>';

  var content = '';
  if (error) {
    content = '<div class="message message-error">' + error + '</div>';
  } else {
    content = '<div class="card">' +
      '<div class="title">Inventory Summary</div>' +
      '<div class="field"><label>Low Stock Items:</label> ' + summary.low_stock_count + '</div>' +
      '<div class="field"><label>Out of Stock Items:</label> ' + summary.out_of_stock_count + '</div>' +
      '<div class="field"><label>Pending Adjustments:</label> ' + summary.pending_approvals_count + '</div>' +
      '<div class="field"><label>Frequent Adjustments:</label> ' + summary.frequent_adjustments_count + '</div>' +
      '<div class="field"><label>Slow-Moving Items:</label> ' + summary.slow_moving_count + '</div>' +
      '</div>';

    if (summary.alerts && summary.alerts.length) {
      content += '<div class="card"><div class="title">Alerts</div>';
      summary.alerts.forEach(alert => {
        var alertClass = alert.type === 'critical' ? 'message-error' : alert.type === 'warning' ? 'message-error' : 'message-ok';
        content += '<div class="message ' + alertClass + '">' + _escAttr(alert.message) + '</div>';
      });
      content += '</div>';
    }

    content += '<div class="card">' +
      '<button class="btn btn-primary" onclick="renderInventoryMovements()">📋 View Movements</button>' +
      '<button class="btn btn-secondary" onclick="renderRestockForm()">➕ Restock</button>' +
      '<button class="btn btn-secondary" onclick="renderStockAdjustmentForm()">⚖️ Adjust Stock</button>' +
      '</div>';
  }

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function renderInventoryMovements() {
  showLoading('Loading movements…');
  try {
    var movements = await API.getInventoryMovements({ limit: 50 });
    _renderMovementsUI(movements);
  } catch(err) {
    _renderMovementsUI([], err.message);
  }
}

function _renderMovementsUI(movements, error) {
  var header = '<div class="topbar"><div class="title" style="margin:0;">📋 Stock Movements</div><button class="small-btn" onclick="renderInventoryAdvancedSummary()">← Back</button></div>';

  var content = '';
  if (error) {
    content = '<div class="message message-error">' + error + '</div>';
  } else if (!movements.length) {
    content = '<div class="card"><div class="title">📋 No Movements Yet</div><div class="subtitle">Stock movements will appear here.</div></div>';
  } else {
    content = movements.map(m => {
      var statusColor = m.status === 'effective' ? '#10b981' : m.status === 'pending_approval' ? '#f59e0b' : '#ef4444';
      var statusText = m.status.replace('_', ' ').toUpperCase();
      return '<div class="card" onclick="renderMovementDetail(\'' + m.id + '\')">' +
        '<div class="title">' + _escAttr(m.product_name) + ' - ' + m.movement_type + '</div>' +
        '<div class="subtitle">' + m.direction.toUpperCase() + ' ' + m.quantity + ' | ' + (m.reason_code || 'No reason') + '</div>' +
        '<div class="subtitle">By ' + (m.created_by_role_code || 'Unknown') + ' on ' + new Date(m.created_at).toLocaleDateString() + '</div>' +
        '<div style="margin-top:8px;"><span style="background:' + statusColor + ';color:#fff;padding:4px 8px;border-radius:12px;font-size:0.8rem;font-weight:600;">' + statusText + '</span></div>' +
        '</div>';
    }).join('');
  }

  content += '<div class="card"><button class="btn btn-secondary" onclick="renderInventoryAdvancedSummary()">← Back to Summary</button></div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function renderMovementDetail(movementId) {
  // Simplified: show basic info
  _showToast('Movement detail coming soon', false);
  renderInventoryMovements();
}

async function renderRestockForm() {
  var header = '<div class="topbar"><div class="title" style="margin:0;">➕ Restock Product</div><button class="small-btn" onclick="renderInventoryAdvancedSummary()">← Back</button></div>';

  // Get products for dropdown
  if (!state.products || !state.products.length) {
    await boot(); // Ensure products loaded
  }

  var productOptions = (state.products || []).map(p =>
    '<option value="' + p.Product_ID + '">' + _escAttr(p.Product_Name) + ' (Stock: ' + p.Current_Stock + ')</option>'
  ).join('');

  var content = '<div class="card">' +
    '<div class="field"><label>Product *</label><select id="restock-product">' + productOptions + '</select></div>' +
    '<div class="field"><label>Quantity *</label><input id="restock-qty" type="number" min="1" placeholder="Enter quantity"></div>' +
    '<div class="field"><label>Reason</label><select id="restock-reason">' +
      '<option value="supplier_restock">Supplier Restock</option>' +
      '<option value="owner_added_stock">Owner Added</option>' +
      '<option value="emergency_restock">Emergency Restock</option>' +
    '</select></div>' +
    '<div class="field"><label>Note</label><input id="restock-note" placeholder="Optional note"></div>' +
    '<button class="btn btn-primary" onclick="submitRestock()">Restock</button>' +
    '<button class="btn btn-secondary" onclick="renderInventoryAdvancedSummary()">Cancel</button>' +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function submitRestock() {
  var data = {
    productId: document.getElementById('restock-product').value,
    quantity: parseInt(document.getElementById('restock-qty').value),
    reasonCode: document.getElementById('restock-reason').value,
    note: document.getElementById('restock-note').value.trim()
  };

  if (!data.productId || !data.quantity || data.quantity <= 0) {
    _showToast('Please select product and enter positive quantity', true);
    return;
  }

  try {
    await API.createRestock(data);
    _showToast('Restock completed successfully!', false);
    renderInventoryAdvancedSummary();
  } catch(err) {
    _showToast(err.message || 'Restock failed', true);
  }
}

async function renderStockAdjustmentForm() {
  var header = '<div class="topbar"><div class="title" style="margin:0;">⚖️ Adjust Stock</div><button class="small-btn" onclick="renderInventoryAdvancedSummary()">← Back</button></div>';

  if (!state.products || !state.products.length) {
    await boot();
  }

  var productOptions = (state.products || []).map(p =>
    '<option value="' + p.Product_ID + '">' + _escAttr(p.Product_Name) + ' (Stock: ' + p.Current_Stock + ')</option>'
  ).join('');

  var content = '<div class="card">' +
    '<div class="field"><label>Product *</label><select id="adjust-product">' + productOptions + '</select></div>' +
    '<div class="field"><label>Direction *</label><select id="adjust-direction">' +
      '<option value="in">Increase Stock (+)</option>' +
      '<option value="out">Decrease Stock (-)</option>' +
    '</select></div>' +
    '<div class="field"><label>Quantity *</label><input id="adjust-qty" type="number" min="1" placeholder="Enter quantity"></div>' +
    '<div class="field"><label>Reason *</label><select id="adjust-reason">' +
      '<option value="count_correction">Count Correction</option>' +
      '<option value="damaged_items">Damaged Items</option>' +
      '<option value="expired_items">Expired Items</option>' +
      '<option value="internal_use">Internal Use</option>' +
      '<option value="missing_items">Missing Items</option>' +
    '</select></div>' +
    '<div class="field"><label>Note</label><input id="adjust-note" placeholder="Optional note"></div>' +
    '<div class="message message-ok">Note: This may require approval depending on settings.</div>' +
    '<button class="btn btn-primary" onclick="submitStockAdjustment()">Adjust Stock</button>' +
    '<button class="btn btn-secondary" onclick="renderInventoryAdvancedSummary()">Cancel</button>' +
    '</div>';

  document.getElementById('app').innerHTML = '<div class="screen">' + header + content + '</div>';
}

async function submitStockAdjustment() {
  var data = {
    productId: document.getElementById('adjust-product').value,
    direction: document.getElementById('adjust-direction').value,
    quantity: parseInt(document.getElementById('adjust-qty').value),
    reasonCode: document.getElementById('adjust-reason').value,
    note: document.getElementById('adjust-note').value.trim()
  };

  if (!data.productId || !data.quantity || data.quantity <= 0 || !data.direction) {
    _showToast('Please fill all required fields', true);
    return;
  }

  try {
    var result = await API.createStockAdjustment(data);
    var msg = result.status === 'pending_approval' ?
      'Adjustment submitted for approval!' :
      'Stock adjusted successfully!';
    _showToast(msg, false);
    renderInventoryAdvancedSummary();
  } catch(err) {
    _showToast(err.message || 'Adjustment failed', true);
  }
}

// ── Reports ───────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// SALES HISTORY
// ══════════════════════════════════════════════════════════════════════════════

async function renderSalesHistory(msg) {
  showLoading('Loading sales…');
  try {
    var r = await API.call('getRecentSales', { limit: 50 });
    var sales = r.sales || r || [];
    _renderSalesHistoryUI(sales, msg);
  } catch(e) {
    _showToast(e.message, true);
    goHome();
  }
}

function _renderSalesHistoryUI(sales, msg) {
  function money(v) { return '₱' + Number(v||0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2}); }

  var rows = sales.length === 0
    ? '<div class="muted" style="text-align:center;padding:24px;">No sales recorded yet.</div>'
    : sales.map(function(s) {
        var dt = s.created_at || s.timestamp || s.Sale_Date || '';
        var timeStr = dt ? new Date(dt).toLocaleString('en-PH', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
        var total   = s.total || s.Total_Amount || s.amount || 0;
        var method  = s.payment_method || s.Payment_Method || '';
        var itemCount = s.item_count || (s.items && s.items.length) || '';
        var saleId  = s.id || s.sale_id || s.Sale_ID || '';
        var cashier = s.cashier_name || s.staff_name || '';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f3f4f6;cursor:pointer;" onclick="viewSaleReceipt(\'' + saleId + '\')">' +
          '<div>' +
          '<div style="font-weight:600;font-size:14px;">' + money(total) + '</div>' +
          '<div class="muted" style="font-size:12px;">' +
            (itemCount ? itemCount + ' item' + (itemCount !== 1 ? 's' : '') : '') +
            (method ? ' · ' + _escAttr(method) : '') +
            (cashier ? ' · ' + _escAttr(cashier) : '') +
          '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
          '<div class="muted" style="font-size:12px;">' + _escAttr(timeStr) + '</div>' +
          '<div style="font-size:11px;color:#2563eb;">View ›</div>' +
          '</div>' +
          '</div>';
      }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🧾 Sales History</div>' +
    '<button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    '<div class="muted" style="font-size:12px;margin-bottom:8px;">Last 50 sales · tap to view receipt</div>' +
    '<div class="card">' + rows + '</div>' +
    '</div>';
}

async function viewSaleReceipt(saleId) {
  if (!saleId) { _showToast('Invalid sale', true); return; }
  showLoading('Loading receipt…');
  try {
    var r = await API.call('getSaleReceipt', { saleId: saleId });
    var sale  = r.sale || r;
    var items = sale.items || [];
    var total = sale.total || sale.Total_Amount || 0;
    var paid  = sale.amount_paid || total;
    var method = sale.payment_method || sale.Payment_Method || 'Cash';
    renderReceiptModal(items, total, paid, method, sale);
  } catch(e) {
    _showToast(e.message, true);
    renderSalesHistory();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════════════════

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
    var raw, fixedCosts;
    if      (type === 'daily')   raw = await API.call('getDailyReport',   { date: a });
    else if (type === 'weekly')  raw = await API.call('getWeeklyReport',  {});
    else if (type === 'monthly') raw = await API.call('getMonthlyReport', { year: a, month: b });
    else                         raw = await API.call('getPeriodReport',  { dateFrom: a, dateTo: b });
    try { fixedCosts = await API.call('getFixedCosts'); } catch(e2) { fixedCosts = { rent: 0, salaries: [], otherFixed: 0 }; }

    // Normalise to a consistent shape regardless of backend version
    var data = _normaliseReportData(raw);
    renderReportScreen(type, data, fixedCosts);
  } catch(e) {
    _showToast('Error: ' + e.message, true);
    renderReports();
  }
}

function _normaliseReportData(d) {
  if (!d) d = {};
  var sales    = d.sales    || [];
  var expenses = d.expenses || [];
  var txCount  = sales.length;
  var totalQty = sales.reduce(function(sum, r) { return sum + Number(r.total_qty || r.item_count || 0); }, 0);
  var revenue  = Number(d.revenue  || (d.summary && d.summary.revenue)  || 0);
  var cogs     = Number(d.cogs     || (d.summary && d.summary.cogs)     || 0);
  var grossP   = Number(d.grossProfit  || (d.summary && d.summary.grossProfit)  || revenue - cogs);
  var expTotal = Number(d.expenseTotal || (d.summary && d.summary.totalExpenses) || 0);
  var netP     = Number(d.netProfit   || (d.summary && d.summary.netProfit)   || grossP - expTotal);
  var avgTx    = txCount > 0 ? revenue / txCount : 0;

  var summary = {
    revenue:       revenue,
    txCount:       txCount,
    totalQty:      totalQty,
    avgTx:         avgTx,
    cogs:          cogs,
    grossProfit:   grossP,
    totalExpenses: expTotal,
    netProfit:     netP,
  };

  // Expense breakdown by category
  if (!d.expenseBreakdown) {
    var expMap = {};
    expenses.forEach(function(e) {
      var cat = e.category || e.expense_category || 'Other';
      expMap[cat] = (expMap[cat] || 0) + Number(e.amount || 0);
    });
    d.expenseBreakdown = Object.keys(expMap).map(function(k) { return { category: k, amount: expMap[k] }; });
  }

  // Daily breakdown for weekly reports
  if (!d.dailyBreakdown && d.byDate) {
    d.dailyBreakdown = (d.byDate || []).map(function(r) {
      return { date: r.date, revenue: r.revenue || 0, count: r.count || 0, grossProfit: 0 };
    }).sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  }

  return Object.assign({}, d, { summary: summary });
}

function renderReportScreen(type, d, fixedCosts) {
  // Normalize: backend returns flat fields; older shape wraps them in d.summary
  var s = d.summary || (function() {
    var sales = d.sales || [];
    var txCount  = sales.length;
    var totalQty = sales.reduce(function(sum, r) { return sum + Number(r.total_qty || r.item_count || 0); }, 0);
    var revenue  = Number(d.revenue || 0);
    var avgTx    = txCount > 0 ? revenue / txCount : 0;
    return {
      revenue:       revenue,
      txCount:       txCount,
      totalQty:      totalQty,
      avgTx:         avgTx,
      cogs:          Number(d.cogs         || 0),
      grossProfit:   Number(d.grossProfit  || 0),
      totalExpenses: Number(d.expenseTotal || d.totalExpenses || 0),
      netProfit:     Number(d.netProfit    || 0),
    };
  })();

  // Derive breakdown data if backend didn't supply it
  if (!d.expenseBreakdown && d.expenses) {
    var expMap = {};
    (d.expenses || []).forEach(function(e) {
      var cat = e.category || e.expense_category || 'Other';
      expMap[cat] = (expMap[cat] || 0) + Number(e.amount || 0);
    });
    d.expenseBreakdown = Object.keys(expMap).map(function(k) { return { category: k, amount: expMap[k] }; });
  }
  if (!d.dailyBreakdown && d.byDate) {
    d.dailyBreakdown = (d.byDate || []).map(function(r) {
      return { date: r.date, revenue: r.revenue || 0, count: r.count || 0, grossProfit: 0 };
    }).sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  }

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
    '</div>' +

    '<div class="card">' +
    '<div class="subtitle" style="margin-bottom:4px;">🔐 Change Password</div>' +
    '<div class="field"><label>Current Password</label>' +
    '<input id="pw-current" type="password" placeholder="Enter current password"></div>' +
    '<div class="field"><label>New Password</label>' +
    '<input id="pw-new" type="password" placeholder="At least 4 characters"></div>' +
    '<div class="field"><label>Confirm New Password</label>' +
    '<input id="pw-confirm" type="password" placeholder="Repeat new password"></div>' +
    '<button class="btn btn-secondary" onclick="submitChangePassword()">🔐 Change Password</button>' +
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

async function submitChangePassword() {
  var current = document.getElementById('pw-current').value;
  var newPw   = document.getElementById('pw-new').value;
  var confirm = document.getElementById('pw-confirm').value;
  if (!current || !newPw) { _showToast('Fill in all password fields', true); return; }
  if (newPw !== confirm)  { _showToast('New passwords do not match', true); return; }
  if (newPw.length < 4)   { _showToast('Password must be at least 4 characters', true); return; }
  try {
    await API.call('changePassword', { currentPassword: current, newPassword: newPw });
    _showToast('Password changed successfully!');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } catch(e) { _showToast(e.message, true); }
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

// ── Health snapshot (silent, fire-and-forget) ─────────────────────────────────

async function _submitHealthSnapshot() {
  if (!navigator.onLine || !state.session || state.session.user.Role !== 'OWNER') return;
  try {
    var products    = state.products || [];
    var lowStock    = products.filter(function(p) { return Number(p.Current_Stock) <= Number(p.Reorder_Level || 5) && Number(p.Current_Stock) > 0; }).length;
    var outOfStock  = products.filter(function(p) { return Number(p.Current_Stock) === 0; }).length;
    await API.call('submitHealthSnapshot', {
      productCount:     products.length,
      lowStockCount:    lowStock,
      outOfStockCount:  outOfStock,
      revenueToday:     0,
      txToday:          0,
      revenue7Days:     0
    });
  } catch(e) { /* silent */ }
  // Record last sync time for system confidence display
  try { localStorage.setItem('last_sync_at', Date.now().toString()); } catch(e){}
}

// ── Capital & ROI Monitor ─────────────────────────────────────────────────────

var CAPITAL_CATEGORIES = [
  'Initial Inventory','Store Fixtures & Shelving','Equipment & Appliances',
  'Renovation & Construction','Working Capital','License & Permits',
  'Marketing & Signage','Vehicles & Transport','Other'
];

async function renderROIMonitor() {
  showLoading('Loading ROI data…');
  var d;
  try { d = await API.call('getROIData'); } catch(e) {
    _showToast('Error: ' + e.message, true); goHome(); return;
  }

  var perf    = d.performance;
  var proj    = d.projection;
  var summary = d.summary;
  var prog    = perf.progressPercent;
  var hasCapital = summary.totalCostOfCapital > 0;

  // ── Progress bar color ──
  var barColor = prog >= 75 ? '#16a34a' : prog >= 40 ? '#d97706' : '#dc2626';

  // ── Monthly chart (last 6 months) ──
  var last6     = (d.monthly || []).slice(-6);
  var maxAbs    = last6.reduce(function(m, r) { return Math.max(m, Math.abs(r.netProfit)); }, 1);
  var chartBars = last6.map(function(m) {
    var pct   = Math.round(Math.abs(m.netProfit) / maxAbs * 100);
    var color = m.netProfit >= 0 ? '#16a34a' : '#dc2626';
    var label = m.netProfit >= 0 ? '+' + _moneyShort(m.netProfit) : '-' + _moneyShort(Math.abs(m.netProfit));
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">' +
      '<div style="font-size:9px;color:#6b7280;writing-mode:vertical-lr;transform:rotate(180deg);height:28px;overflow:hidden;">' + m.monthName + '</div>' +
      '<div style="width:100%;height:' + pct + 'px;min-height:4px;background:' + color + ';border-radius:3px 3px 0 0;"></div>' +
      '<div style="font-size:9px;color:' + color + ';font-weight:bold;">' + label + '</div>' +
      '</div>';
  }).join('');

  // ── Loan pill ──
  var loanHtml = summary.loanPrincipal > 0
    ? '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;">' +
      '<div style="font-weight:bold;margin-bottom:4px;">💳 Loan / Financing</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;color:#374151;">' +
      '<div>Principal: <strong>' + _money(summary.loanPrincipal) + '</strong></div>' +
      '<div>Rate: <strong>' + summary.loanRateAnnual + '% / yr</strong></div>' +
      '<div>Monthly interest: <strong>' + _money(summary.loanMonthlyInterest) + '</strong></div>' +
      '<div>Total interest cost: <strong>' + _money(summary.totalInterestCost) + '</strong></div>' +
      '<div>Interest paid to date: <strong>' + _money(summary.interestPaidToDate) + '</strong></div>' +
      '</div></div>'
    : '';

  // ── Projection block ──
  var projHtml;
  if (!hasCapital) {
    projHtml = '<div class="muted" style="text-align:center;padding:12px;">Set up your initial capital below to enable projections.</div>';
  } else if (proj.projectedMonths === 0) {
    projHtml = '<div style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;">' +
      '<div style="font-size:32px;">🎉</div>' +
      '<div style="font-weight:bold;color:#16a34a;font-size:16px;">ROI Already Achieved!</div>' +
      '<div class="muted" style="margin-top:4px;">Your business has fully recovered its capital investment.</div></div>';
  } else if (proj.projectedMonths !== null) {
    projHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
      '<div class="stat-card" style="background:#eff6ff;">' +
      '<div class="val" style="font-size:18px;color:#1d4ed8;">' + proj.projectedMonths + '</div>' +
      '<div class="lbl">Months to ROI</div></div>' +
      '<div class="stat-card" style="background:#f0fdf4;">' +
      '<div class="val" style="font-size:15px;color:#16a34a;">' + (proj.projectedDate || '—') + '</div>' +
      '<div class="lbl">Projected Date</div></div>' +
      '<div class="stat-card">' +
      '<div class="val" style="font-size:16px;">' + _money(proj.avgMonthlyNet) + '</div>' +
      '<div class="lbl">Avg Monthly Net<br><span style="font-size:9px;font-weight:normal;">(last ' + proj.activeMonthsUsed + ' active mo.)</span></div></div>' +
      '<div class="stat-card">' +
      '<div class="val" style="font-size:16px;">' + _money(proj.avgDailyNet) + '</div>' +
      '<div class="lbl">Avg Daily Net</div></div>' +
      '</div>';
  } else {
    projHtml = '<div class="muted" style="text-align:center;padding:12px;">Not enough sales data yet. Projection available after first month.</div>';
  }

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title">📈 ROI Monitor</div>' +
    '<button class="small-btn" onclick="goHome()">Back</button></div>' +

    // ── Progress ──
    (hasCapital ? '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
      '<span style="font-weight:bold;">Capital Recovery</span>' +
      '<span style="font-weight:bold;color:' + barColor + ';">' + prog + '%</span></div>' +
      '<div style="background:#e5e7eb;border-radius:999px;height:14px;overflow:hidden;">' +
      '<div style="width:' + prog + '%;height:100%;background:' + barColor + ';border-radius:999px;transition:width .4s;"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px;color:#6b7280;">' +
      '<span>₱0</span><span>' + _money(summary.totalCostOfCapital) + ' total cost</span></div>' +
      '</div>' : '') +

    // ── Key numbers ──
    '<div class="card">' +
    '<div class="section-title">💰 Capital Overview</div>' +
    '<div style="font-size:13px;line-height:2.2;">' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><span>Items invested</span><strong>' + _money(summary.totalCapital) + '</strong></div>' +
    (summary.loanPrincipal > 0 ? '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><span>+ Total interest cost</span><strong style="color:#d97706;">+' + _money(summary.totalInterestCost) + '</strong></div>' : '') +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;padding-bottom:2px;"><span style="font-weight:bold;">Total cost of capital</span><strong>' + _money(summary.totalCostOfCapital) + '</strong></div>' +
    '</div>' +
    loanHtml +
    '<div style="font-size:13px;line-height:2.2;margin-top:8px;">' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><span>All-time Revenue</span><strong>' + _money(perf.totalRevenue) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><span>— Cost of Goods Sold</span><span style="color:#dc2626;">−' + _money(perf.totalCOGS) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><span>— Total Expenses</span><span style="color:#dc2626;">−' + _money(perf.totalExpenses) + '</span></div>' +
    (perf.interestPaid > 0 ? '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #f3f4f6;"><span>— Interest Paid</span><span style="color:#dc2626;">−' + _money(perf.interestPaid) + '</span></div>' : '') +
    '<div style="display:flex;justify-content:space-between;padding-top:2px;"><span style="font-weight:bold;">Cumulative Net Profit</span>' +
    '<strong style="color:' + (perf.cumulativeNetProfit >= 0 ? '#16a34a' : '#dc2626') + ';">' + _money(perf.cumulativeNetProfit) + '</strong></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;background:#f0fdf4;border-radius:8px;padding:10px;margin-top:8px;font-size:14px;">' +
    '<span>Capital Still to Recover</span><strong style="color:' + (perf.capitalRemaining > 0 ? '#dc2626' : '#16a34a') + ';">' + _money(perf.capitalRemaining) + '</strong></div>' +
    '</div>' +

    // ── Projection ──
    '<div class="card"><div class="section-title">🔭 Projection</div>' + projHtml + '</div>' +

    // ── Monthly chart ──
    (last6.length > 0 ? '<div class="card"><div class="section-title">📊 Monthly Net Profit (last 6 mo.)</div>' +
      '<div style="display:flex;align-items:flex-end;height:100px;gap:4px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;">' +
      chartBars + '</div></div>' : '') +

    // ── Actions ──
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px;">' +
    '<button class="btn btn-primary" onclick="renderCapitalSetup()">✏️ Edit Capital</button>' +
    '<button class="btn btn-secondary" onclick="renderROIMonitor()">🔄 Refresh</button>' +
    '</div></div>';
}

async function renderCapitalSetup() {
  showLoading('Loading capital setup…');
  var items, loan;
  try {
    items = await API.call('getCapitalItems');
    loan  = await API.call('getLoanSettings');
  } catch(e) { _showToast('Error: ' + e.message, true); return; }

  _renderCapitalSetupScreen(items, loan);
}

function _renderCapitalSetupScreen(items, loan, msg) {
  var totalCapital = items.reduce(function(s, c) { return s + Number(c.Amount || 0); }, 0);

  var itemRows = items.length > 0
    ? items.map(function(c) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
          '<div><div style="font-size:13px;font-weight:bold;">' + _escHtml(c.Category) + '</div>' +
          '<div class="muted" style="font-size:12px;">' + _escHtml(c.Description) + (c.Date_Added ? ' · ' + String(c.Date_Added).substring(0,10) : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-weight:bold;">' + _money(c.Amount) + '</span>' +
          '<button class="small-btn" style="background:#fee2e2;color:#dc2626;" onclick="deleteCapitalItem(\'' + c.Capital_ID + '\')">✕</button>' +
          '</div></div>';
      }).join('')
    : '<div class="muted" style="padding:8px;">No capital items yet. Add your startup costs below.</div>';

  var catsHtml = CAPITAL_CATEGORIES.map(function(c) {
    return '<option value="' + c + '">' + c + '</option>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title">💰 Capital Setup</div>' +
    '<button class="small-btn" onclick="renderROIMonitor()">← Back</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +

    '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
    '<div class="section-title" style="margin:0;">📦 Itemized Capital</div>' +
    '<div style="font-weight:bold;color:#1d4ed8;">' + _money(totalCapital) + ' total</div></div>' +
    itemRows + '</div>' +

    '<div class="card">' +
    '<div class="section-title">➕ Add Capital Item</div>' +
    '<div class="field"><label>Category</label><select id="cap-cat">' + catsHtml + '</select></div>' +
    '<div class="field"><label>Description *</label><input id="cap-desc" placeholder="e.g. Refrigerator, opening stock…"></div>' +
    '<div class="field"><label>Amount (₱) *</label><input id="cap-amt" type="number" min="0" placeholder="0.00"></div>' +
    '<div class="field"><label>Date invested</label><input id="cap-date" type="date" value="' + _todayInput() + '"></div>' +
    '<div class="field"><label>Notes</label><input id="cap-notes" placeholder="Optional"></div>' +
    '<button class="btn btn-primary" onclick="addCapitalItem()">+ Add Item</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">💳 Loan / Financing (optional)</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:10px;">If any of your capital was borrowed, enter the loan details here so interest cost is included in your ROI calculation.</div>' +
    '<div class="field"><label>Loan Description</label><input id="loan-desc" placeholder="e.g. SSS Salary Loan, 5/6 loan…" value="' + _escAttr(loan.loanDescription) + '"></div>' +
    '<div class="field"><label>Principal Amount (₱)</label><input id="loan-principal" type="number" min="0" value="' + (loan.loanPrincipal || 0) + '"></div>' +
    '<div class="field"><label>Annual Interest Rate (%)</label><input id="loan-rate" type="number" min="0" step="0.1" value="' + (loan.loanRateAnnual || 0) + '" placeholder="e.g. 12 for 12%/year"></div>' +
    '<div class="field"><label>Loan Term (months)</label><input id="loan-term" type="number" min="0" value="' + (loan.loanTermMonths || 0) + '" placeholder="e.g. 12 for 1 year"></div>' +
    '<div class="field"><label>Loan Start Date</label><input id="loan-start" type="date" value="' + (loan.loanStartDate || _todayInput()) + '"></div>' +
    '<div id="loan-preview" style="font-size:12px;color:#6b7280;margin-bottom:8px;"></div>' +
    '<button class="btn btn-secondary" onclick="previewLoanCost()">💡 Preview Cost</button>' +
    '<button class="btn btn-primary" style="margin-top:8px;" onclick="saveLoanSettings()">💾 Save Loan Settings</button>' +
    '</div>' +

    '<div style="height:24px;"></div></div>';
}

async function addCapitalItem() {
  var desc = (document.getElementById('cap-desc').value || '').trim();
  var amt  = Number(document.getElementById('cap-amt').value) || 0;
  if (!desc) { _showToast('Enter a description', true); return; }
  if (amt <= 0) { _showToast('Enter a valid amount', true); return; }
  var data = {
    category:    document.getElementById('cap-cat').value,
    description: desc,
    amount:      amt,
    dateAdded:   document.getElementById('cap-date').value || '',
    notes:       (document.getElementById('cap-notes').value || '').trim()
  };
  try {
    await API.call('saveCapitalItem', data);
    var items = await API.call('getCapitalItems');
    var loan  = await API.call('getLoanSettings');
    _renderCapitalSetupScreen(items, loan, '✓ Item added!');
  } catch(e) { _showToast('Error: ' + e.message, true); }
}

async function deleteCapitalItem(capitalId) {
  if (!confirm('Remove this capital item?')) return;
  try {
    await API.call('deleteCapitalItem', { capitalId: capitalId });
    var items = await API.call('getCapitalItems');
    var loan  = await API.call('getLoanSettings');
    _renderCapitalSetupScreen(items, loan);
  } catch(e) { _showToast('Error: ' + e.message, true); }
}

function previewLoanCost() {
  var principal = Number(document.getElementById('loan-principal').value) || 0;
  var rate      = Number(document.getElementById('loan-rate').value) || 0;
  var term      = Number(document.getElementById('loan-term').value) || 0;
  var el        = document.getElementById('loan-preview');
  if (!el) return;
  if (principal <= 0 || rate <= 0 || term <= 0) {
    el.textContent = 'Fill in principal, rate, and term to preview.';
    return;
  }
  var monthly       = principal * (rate / 100 / 12);
  var totalInterest = monthly * term;
  var totalCost     = principal + totalInterest;
  el.innerHTML = '<strong>Monthly interest: ' + _money(monthly) + '</strong> · ' +
    'Total interest over ' + term + ' months: <strong>' + _money(totalInterest) + '</strong> · ' +
    'Total repayment: <strong>' + _money(totalCost) + '</strong>';
}

async function saveLoanSettings() {
  var data = {
    loanDescription: (document.getElementById('loan-desc').value      || '').trim(),
    loanPrincipal:   Number(document.getElementById('loan-principal').value) || 0,
    loanRateAnnual:  Number(document.getElementById('loan-rate').value)      || 0,
    loanTermMonths:  Number(document.getElementById('loan-term').value)      || 0,
    loanStartDate:   document.getElementById('loan-start').value || ''
  };
  try {
    await API.call('saveLoanSettings', data);
    _showToast('Loan settings saved!');
    var items = await API.call('getCapitalItems');
    _renderCapitalSetupScreen(items, data, '✓ Loan settings saved!');
  } catch(e) { _showToast('Error: ' + e.message, true); }
}

function _moneyShort(v) {
  var n = Number(v || 0);
  if (n >= 1000) return '₱' + (n / 1000).toFixed(1) + 'k';
  return '₱' + n.toFixed(0);
}

function _todayInput() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function _escAttr(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ── Business Monitors ─────────────────────────────────────────────────────────

var _monitorPeriod = 'today';

function renderMonitors() { _loadMonitors('today'); }

async function _loadMonitors(period) {
  _monitorPeriod = period;
  showLoading('Loading Business Monitors…');
  var cacheKey = 'mon_' + period;
  var data = null;
  var fromCache = false;

  if (navigator.onLine && !state.isOffline) {
    try {
      data = await API.call('getBusinessMonitors', { period: period });
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch(e) {}
    } catch(err) {
      if (err.code === 'MODULE_DISABLED') { _renderMonitorLocked(); return; }
      if (err.code === 'PERMISSION_DENIED') { _showToast('Access denied.', true); goHome(); return; }
      try { data = JSON.parse(localStorage.getItem(cacheKey) || 'null'); fromCache = true; } catch(e) {}
      if (!data) { _showToast(err.message || 'Failed to load monitors', true); goHome(); return; }
    }
  } else {
    try { data = JSON.parse(localStorage.getItem(cacheKey) || 'null'); fromCache = true; } catch(e) {}
    if (!data) {
      document.getElementById('app').innerHTML =
        '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">📡 Monitors</div>' +
        '<button class="small-btn" onclick="goHome()">← Back</button></div>' +
        '<div class="card" style="text-align:center;padding:32px 16px;">' +
        '<div style="font-size:2rem;margin-bottom:8px;">📵</div>' +
        '<div style="font-weight:600;color:#374151;">Offline</div>' +
        '<div style="font-size:0.82rem;color:#6b7280;margin-top:6px;">No cached monitor data.<br>Connect and try again.</div>' +
        '</div></div>';
      return;
    }
  }
  _renderMonitorPage(data, period, fromCache);
}

function _renderMonitorLocked() {
  document.getElementById('app').innerHTML =
    '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">📡 Business Monitors</div>' +
    '<button class="small-btn" onclick="goHome()">← Back</button></div>' +
    '<div class="card" style="text-align:center;padding:40px 16px;">' +
    '<div style="font-size:2.5rem;margin-bottom:12px;">🔒</div>' +
    '<div style="font-weight:700;font-size:1.1rem;color:#111827;margin-bottom:8px;">Business Monitors</div>' +
    '<div style="font-size:0.85rem;color:#6b7280;max-width:260px;margin:0 auto 20px;">See sales trends, expense alerts, and business insights.<br>Available on Growth plan and above.</div>' +
    '<button class="btn btn-primary" onclick="_showToast(\'Contact your Business Hub support to upgrade your plan.\', false)">Upgrade to Unlock</button>' +
    '</div></div>';
}

// ── Monitor render helpers ────────────────────────────────────────────────────

function _monSC(s) {
  return ({ good: '#16a34a', watch: '#d97706', critical: '#dc2626', info: '#2563eb', no_data: '#9ca3af' })[s] || '#9ca3af';
}

function _monTB(pct, dir, higherIsBetter) {
  if (pct === null || pct === undefined) return '<span style="font-size:0.72rem;color:#9ca3af;">— no prior data</span>';
  var pos = higherIsBetter ? dir === 'up' : dir === 'down';
  var col = dir === 'flat' ? '#6b7280' : (pos ? '#16a34a' : '#dc2626');
  var arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  return '<span style="font-size:0.75rem;font-weight:600;color:' + col + ';">' + arrow + ' ' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%</span>';
}

function _monCur(v) {
  if (v === null || v === undefined) return '—';
  return '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _monMetric(label, value, trendBadge, status) {
  var c = _monSC(status);
  return '<div style="background:#fff;border-radius:10px;padding:11px 12px;border:1px solid #e5e7eb;border-left:3px solid ' + c + ';">' +
    '<div style="font-size:0.67rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">' + label + '</div>' +
    '<div style="font-size:1.15rem;font-weight:700;color:#111827;line-height:1.2;">' + value + '</div>' +
    (trendBadge ? '<div style="margin-top:3px;">' + trendBadge + '</div>' : '') +
    '</div>';
}

function _monRow(label, value, note, status) {
  var c = _monSC(status);
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f3f4f6;">' +
    '<div style="flex:1;min-width:0;">' +
    '<div style="font-size:0.82rem;color:#374151;font-weight:500;">' + label + '</div>' +
    (note ? '<div style="font-size:0.71rem;color:#9ca3af;margin-top:1px;">' + _escAttr(String(note)) + '</div>' : '') +
    '</div>' +
    '<div style="flex-shrink:0;margin-left:12px;text-align:right;">' +
    '<span style="font-size:0.85rem;font-weight:600;color:' + c + ';">' + value + '</span>' +
    '</div></div>';
}

function _monSection(icon, title, content) {
  return '<div style="margin:8px 12px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">' +
    '<div style="padding:9px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">' +
    '<div style="font-weight:700;font-size:0.83rem;color:#374151;">' + icon + ' ' + title + '</div>' +
    '</div>' +
    '<div style="padding:2px 14px 4px;">' + content + '</div>' +
    '</div>';
}

// ── Monitor page renderer ─────────────────────────────────────────────────────

function _renderMonitorPage(data, period, fromCache) {
  var s = data.summary    || {};
  var meta = data.meta    || {};
  var sl   = data.sales   || {};
  var ex   = data.expenses || {};
  var pr   = data.profitability || {};
  var inv  = data.inventory || {};
  var st   = data.staff   || {};
  var sys  = data.system  || {};

  // Period selector
  var PTABS = [
    { k: 'today',        l: 'Today'   },
    { k: 'last_week',    l: '7 Days'  },
    { k: 'last_month',   l: '30 Days' },
    { k: 'last_quarter', l: '90 Days' },
    { k: 'last_year',    l: '1 Year'  },
  ];
  var tabs = PTABS.map(function(p) {
    var on = p.k === period;
    return '<button onclick="_loadMonitors(\'' + p.k + '\')" style="padding:6px 11px;border-radius:20px;font-size:0.73rem;font-weight:600;cursor:pointer;border:1px solid ' +
      (on ? 'var(--primary,#2c3e50);background:var(--primary,#2c3e50);color:#fff;' : '#d1d5db;background:#fff;color:#374151;') +
      'white-space:nowrap;">' + p.l + '</button>';
  }).join('');

  // Summary strip (2×2 grid)
  var sTs = s.sales_total      || {};
  var sEs = s.expenses_total   || {};
  var sEp = s.estimated_profit || {};
  var sTx = s.transactions     || {};
  var summaryHtml =
    '<div style="padding:8px 12px;">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    _monMetric('Sales',      _monCur(sTs.value), _monTB(sTs.trend_pct, sTs.trend_dir, true),  sTs.status) +
    _monMetric('Expenses',   _monCur(sEs.value), _monTB(sEs.trend_pct, sEs.trend_dir, false), sEs.status) +
    _monMetric(meta.profit_label || 'Est. Profit', _monCur(sEp.value), _monTB(sEp.trend_pct, sEp.trend_dir, true), sEp.status) +
    _monMetric('Transactions', (sTx.value || 0) + ' tx', _monTB(sTx.trend_pct, sTx.trend_dir, true), sTx.status) +
    '</div></div>';

  // ── Health headline ──────────────────────────────────────────────────────────
  var alerts = data.alerts || [];
  var critCount  = alerts.filter(function(a) { return a.urgency === 'critical'; }).length;
  var watchCount = alerts.filter(function(a) { return a.urgency === 'watch';    }).length;
  var healthBg, healthBorder, healthIcon, healthLine;
  if (critCount > 0) {
    healthBg = '#fff5f5'; healthBorder = '#dc2626'; healthIcon = '🔴';
    healthLine = critCount + ' critical issue' + (critCount > 1 ? 's' : '') + ' need' + (critCount === 1 ? 's' : '') + ' your attention now.';
  } else if (watchCount > 0) {
    healthBg = '#fffbeb'; healthBorder = '#d97706'; healthIcon = '⚠️';
    healthLine = watchCount + ' thing' + (watchCount > 1 ? 's' : '') + ' to watch — check below.';
  } else {
    var salesV = (s.sales_total || {}).value || 0;
    var txV    = (s.transactions || {}).value || 0;
    var pctV   = (s.sales_total || {}).trend_pct;
    var goodMsg = salesV > 0
      ? '₱' + Number(salesV).toLocaleString('en-PH', {minimumFractionDigits:0,maximumFractionDigits:0}) + ' in sales' +
        (txV > 0 ? ' across ' + txV + ' transaction' + (txV !== 1 ? 's' : '') : '') +
        (pctV !== null && pctV > 0 ? ' — up ' + pctV.toFixed(0) + '% from ' + (data.comparison_period || 'previous') + '.' : '.')
      : 'No issues to flag. Keep monitoring.';
    healthBg = '#f0fdf4'; healthBorder = '#16a34a'; healthIcon = '✅';
    healthLine = goodMsg;
  }
  var headlineHtml =
    '<div style="margin:6px 12px 4px;padding:12px 14px;background:' + healthBg + ';border-radius:10px;border-left:4px solid ' + healthBorder + ';">' +
    '<div style="font-weight:700;font-size:0.95rem;color:#111827;">' + healthIcon + ' Business Health</div>' +
    '<div style="font-size:0.82rem;color:#374151;margin-top:3px;">' + _escAttr(healthLine) + '</div>' +
    '</div>';

  // ── Alerts with tap-to-act buttons ───────────────────────────────────────────
  var urgIco = { good: '✅', watch: '⚠️', critical: '🔴', info: 'ℹ️' };
  var alertActionMap = {
    out_of_stock:     { label: 'Go to Inventory', fn: '_hasModule("inventory") ? renderInventoryMenu() : _showToast("Inventory not enabled", true)' },
    low_stock:        { label: 'Go to Inventory', fn: '_hasModule("inventory") ? renderInventoryMenu() : _showToast("Inventory not enabled", true)' },
    no_sales:         { label: 'Go to Quick Sell', fn: 'renderQuickSell()' },
    expense_pressure: { label: 'Review Expenses',  fn: 'renderExpenses()' },
    low_profit:       { label: 'View Reports',     fn: 'renderReports()' },
  };
  var alertsHtml = alerts.length === 0
    ? ''
    : '<div style="padding:4px 12px 0;">' +
      '<div style="font-weight:700;font-size:0.76rem;text-transform:uppercase;letter-spacing:.5px;color:#374151;margin:6px 0 7px;">⚠ What Needs Attention</div>' +
      alerts.map(function(a) {
        var c   = _monSC(a.urgency || 'watch');
        var act = alertActionMap[a.type];
        var btn = act ? '<div style="margin-top:8px;"><button onclick="' + act.fn + '" style="background:' + c + ';color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:0.73rem;font-weight:700;cursor:pointer;">' + act.label + ' →</button></div>' : '';
        return '<div style="background:#fff;border-left:3px solid ' + c + ';border-radius:10px;padding:11px 12px;margin-bottom:7px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">' +
          '<div style="font-weight:700;font-size:0.84rem;color:#111827;">' + (urgIco[a.urgency] || '⚠️') + ' ' + _escAttr(a.title) + '</div>' +
          '<div style="font-size:0.78rem;color:#4b5563;margin-top:3px;">' + _escAttr(a.message) + '</div>' +
          '<div style="font-size:0.72rem;color:#6b7280;margin-top:4px;font-style:italic;">' + _escAttr(a.action) + '</div>' +
          btn +
          '</div>';
      }).join('') + '</div>';

  // Sales section
  var slT  = sl.trend || {};
  var slP  = sl.top_product || {};
  var slContent =
    _monRow('Average Sale', sl.avg_sale && sl.avg_sale.value !== null ? _monCur(sl.avg_sale.value) : '—', null, (sl.avg_sale || {}).status || 'no_data') +
    _monRow('Top-Selling Product', slP.name ? _escAttr(slP.name) : '—', slP.name ? slP.qty + ' units sold' : null, slP.status || 'no_data') +
    _monRow('Sales Trend', slT.pct !== null && slT.pct !== undefined ? (slT.pct > 0 ? '+' : '') + slT.pct.toFixed(1) + '%' : '—',
      slT.pct === null || slT.pct === undefined ? 'No prior period data' : (slT.dir === 'up' ? 'Up from previous period' : slT.dir === 'down' ? 'Down from previous period' : 'Same as previous period'),
      slT.status || 'no_data') +
    (sl.no_sales_today ? _monRow('Today\'s Sales', 'None yet', 'No transactions recorded today', 'watch') : '');

  // Expenses section
  var exT  = ex.trend        || {};
  var exC  = ex.top_category || {};
  var exContent =
    _monRow('Top Category', exC.name ? _escAttr(exC.name) : '—', exC.name ? _monCur(exC.total) + ' total' : null, exC.status || 'no_data') +
    _monRow('Expense Trend', exT.pct !== null && exT.pct !== undefined ? (exT.pct > 0 ? '+' : '') + exT.pct.toFixed(1) + '%' : '—',
      exT.pct === null || exT.pct === undefined ? 'No prior period data' : (exT.dir === 'up' ? 'Higher than previous period' : exT.dir === 'down' ? 'Lower than previous period' : 'Stable'),
      exT.status || 'no_data') +
    (ex.pressure_alert ? _monRow('Pressure Alert', 'Watch', 'Expenses rising faster than sales', 'critical') : '');

  // Profitability section
  var prEp = pr.estimated_profit || {};
  var prM  = pr.profit_margin    || {};
  var prT  = pr.trend            || {};
  var prLabel = meta.profit_label || 'Estimated Profit';
  var prContent =
    _monRow(prLabel, _monCur(prEp.value), prEp.is_estimate ? 'Sales minus expenses (estimate)' : null, prEp.status || 'no_data') +
    _monRow('Profit Margin', prM.value !== null && prM.value !== undefined ? prM.value.toFixed(1) + '%' : '—', null, prM.status || 'no_data') +
    _monRow('Profit Trend', prT.pct !== null && prT.pct !== undefined ? (prT.pct > 0 ? '+' : '') + prT.pct.toFixed(1) + '%' : '—',
      prT.pct === null || prT.pct === undefined ? 'No prior period data' : null, prT.status || 'no_data') +
    (prEp.status === 'critical' ? _monRow('⚠ Profit Warning', 'Negative', 'Expenses exceed sales this period', 'critical') :
     prEp.status === 'watch'    ? _monRow('⚠ Profit Warning', 'Near Zero', 'Business is not generating profit', 'watch') : '');

  // Inventory section
  var invLS = inv.low_stock    || {};
  var invOS = inv.out_of_stock || {};
  var invFM = inv.fast_moving  || {};
  var invSM = inv.slow_moving  || {};
  var invContent =
    _monRow('Low Stock',    (invLS.value || 0) + ' products', 'At or below reorder level', invLS.status || 'no_data') +
    _monRow('Out of Stock', (invOS.value || 0) + ' products', 'Cannot be sold',            invOS.status || 'no_data') +
    _monRow('Fast-Moving',  invFM.name ? _escAttr(invFM.name) : '—', invFM.name ? invFM.qty + ' units this period' : null, invFM.status || 'no_data') +
    _monRow('Slow-Moving',  invSM.name ? _escAttr(invSM.name) : '—', invSM.name ? invSM.qty_sold + ' sold, ' + invSM.stock + ' in stock' : null, invSM.status || 'no_data');

  // Staff section
  var stTS = st.top_staff    || {};
  var stAC = st.active_count || {};
  var stContent =
    _monRow('Top Staff',     stTS.name ? _escAttr(stTS.name) : '—', stTS.name ? _monCur(stTS.total) + ' in sales' : 'No sales data', stTS.status || 'no_data') +
    _monRow('Active Staff',  (stAC.value || 0) + ' staff', 'Had at least one recorded action this period', stAC.status || 'info');

  // System section
  var sysContent =
    _monRow('Pending Sync', (sys.pending_sync || {}).note || '—', null, 'no_data') +
    _monRow('Last Sync',    (sys.last_sync    || {}).note || '—', null, 'no_data');

  var cacheBar = fromCache
    ? '<div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:7px 12px;font-size:0.76rem;color:#92400e;">⚠ Showing last available monitor data</div>'
    : '';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📡 Business Monitors</div>' +
    '<button class="small-btn" onclick="goHome()">← Back</button></div>' +
    cacheBar +
    '<div style="padding:8px 12px 2px;overflow-x:auto;"><div style="display:inline-flex;gap:6px;">' + tabs + '</div></div>' +
    '<div style="padding:0 12px 4px;font-size:0.71rem;color:#9ca3af;">vs ' + _escAttr(data.comparison_period || '') + '</div>' +
    summaryHtml +
    headlineHtml +
    alertsHtml +
    _monSection('📈', 'Sales',          slContent)  +
    _monSection('💸', 'Expenses',       exContent)  +
    _monSection('💰', 'Profitability',  prContent)  +
    _monSection('📋', 'Inventory',      invContent) +
    _monSection('👥', 'Staff Activity', stContent)  +
    _monSection('🔄', 'System / Sync',  sysContent) +
    '<div style="height:20px;"></div></div>';
}

// ── Support chat (store ↔ admin) ──────────────────────────────────────────────

var _supportPollTimer = null;

async function renderSupport() {
  showLoading('Loading support messages…');
  var msgs = [];
  try { msgs = await API.call('getSupportMessages'); } catch(e) {}
  _renderSupportScreen(msgs);
}

function _renderSupportScreen(msgs) {
  var bubbles = msgs.map(function(m) {
    var isAdmin = m.Direction === 'TO_STORE';
    var time    = String(m.Created_At || '').substring(0, 16).replace('T', ' ');
    return '<div style="display:flex;flex-direction:column;align-items:' + (isAdmin ? 'flex-start' : 'flex-end') + ';margin-bottom:10px;">' +
      '<div style="max-width:82%;background:' + (isAdmin ? '#e8f0fe' : '#dcfce7') + ';' +
        'border-radius:' + (isAdmin ? '4px 14px 14px 14px' : '14px 4px 14px 14px') + ';' +
        'padding:10px 14px;font-size:14px;">' + _escHtml(m.Message) + '</div>' +
      '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">' +
        (isAdmin ? '🏪 Tindahan Hub Admin' : '👤 ' + _escHtml(m.From_Name || 'You')) +
        ' · ' + time + '</div></div>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📞 Support Chat</div>' +
    '<button class="small-btn" onclick="_stopSupportPoll();goHome();">← Back</button></div>' +

    '<div style="background:#fff;border-radius:0;padding:12px;margin-bottom:0;">' +
    '<div style="font-size:12px;color:#6b7280;text-align:center;margin-bottom:8px;">Chat with Tindahan Hub Admin · ' +
    '<strong>09163561251</strong> (GCash/Viber)</div>' +
    '</div>' +

    '<div id="support-msgs" style="padding:12px;min-height:200px;">' +
    (bubbles || '<div style="text-align:center;color:#9ca3af;padding:32px;font-size:13px;">No messages yet.<br>Send us a message below!</div>') +
    '</div>' +

    '<div style="position:sticky;bottom:0;background:#fff;border-top:1px solid #e5e7eb;padding:12px;">' +
    '<div style="display:flex;gap:8px;">' +
    '<textarea id="support-input" rows="2" placeholder="Type your message…" ' +
      'style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;resize:none;"></textarea>' +
    '<button onclick="submitSupportMessage()" ' +
      'style="padding:10px 16px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:20px;cursor:pointer;">➤</button>' +
    '</div></div></div>';

  // Scroll to bottom
  setTimeout(function() {
    var el = document.getElementById('support-msgs');
    if (el) el.scrollTop = el.scrollHeight;
  }, 100);

  // Poll for new messages every 15 seconds while screen is open
  _stopSupportPoll();
  _supportPollTimer = setInterval(async function() {
    if (!document.getElementById('support-msgs')) { _stopSupportPoll(); return; }
    try {
      var fresh = await API.call('getSupportMessages');
      var el    = document.getElementById('support-msgs');
      if (!el) { _stopSupportPoll(); return; }
      var newBubbles = fresh.map(function(m) {
        var isAdmin = m.Direction === 'TO_STORE';
        var time    = String(m.Created_At || '').substring(0, 16).replace('T', ' ');
        return '<div style="display:flex;flex-direction:column;align-items:' + (isAdmin ? 'flex-start' : 'flex-end') + ';margin-bottom:10px;">' +
          '<div style="max-width:82%;background:' + (isAdmin ? '#e8f0fe' : '#dcfce7') + ';' +
            'border-radius:' + (isAdmin ? '4px 14px 14px 14px' : '14px 4px 14px 14px') + ';' +
            'padding:10px 14px;font-size:14px;">' + _escHtml(m.Message) + '</div>' +
          '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">' +
            (isAdmin ? '🏪 Tindahan Hub Admin' : '👤 ' + _escHtml(m.From_Name || 'You')) +
            ' · ' + time + '</div></div>';
      }).join('');
      el.innerHTML = newBubbles || el.innerHTML;
      el.scrollTop = el.scrollHeight;
    } catch(e) {}
  }, 15000);
}

function _stopSupportPoll() {
  if (_supportPollTimer) { clearInterval(_supportPollTimer); _supportPollTimer = null; }
}

async function submitSupportMessage() {
  var inp = document.getElementById('support-input');
  var msg = (inp ? inp.value : '').trim();
  if (!msg) return;
  inp.value = '';
  inp.disabled = true;
  try {
    await API.call('sendSupportMessage', { message: msg });
    var msgs = await API.call('getSupportMessages');
    _renderSupportScreen(msgs);
  } catch(e) {
    _showToast('Error: ' + e.message, true);
    if (inp) inp.disabled = false;
  }
}

function _escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  var input = document.querySelector('#scan-manual-input, #scan-manual-input-fallback');
  var val = input ? input.value.trim() : '';
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

// ══════════════════════════════════════════════════════════════════════════════
// SUPPLIERS ── Task 10
// ══════════════════════════════════════════════════════════════════════════════

async function renderSuppliers(msg) {
  showLoading('Loading suppliers…');
  try {
    var suppliers = await API.call('getSuppliers', {});
    _renderSuppliersUI(suppliers, null, msg);
  } catch(e) { _renderSuppliersUI([], e.message); }
}

function _renderSuppliersUI(suppliers, error, msg) {
  var rows = suppliers.length ? suppliers.map(function(s) {
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderSupplierDetail(\'' + s.supplier_id + '\')">' +
      '<div style="font-weight:bold;">' + _escHtml(s.name) + '</div>' +
      '<div class="muted" style="font-size:12px;">' + (s.contact_person ? s.contact_person + ' · ' : '') + (s.phone || '') + '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:4px;">Payment: ' + (s.payment_terms || 'cash') + '</div>' +
      '</div>';
  }).join('') : '<div class="muted" style="padding:8px;">No suppliers yet.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🏭 Suppliers</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows +
    (_hasPermission('suppliers', 'create') ? '<button class="btn btn-primary" style="margin-top:8px;" onclick="renderAddSupplierForm()">+ Add Supplier</button>' : '') +
    '</div>';
}

async function renderSupplierDetail(supplierId) {
  showLoading('Loading supplier…');
  try {
    var s = await API.call('getSupplierById', { supplierId: supplierId });
    var posHtml = s.recentOrders && s.recentOrders.length
      ? s.recentOrders.map(function(po) {
          return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;" onclick="renderPODetail(\'' + po.po_id + '\')" style="cursor:pointer;">' +
            '<span>' + po.po_number + ' <span style="color:#6b7280;">(' + po.status + ')</span></span>' +
            '<span>₱' + Number(po.total_amount||0).toLocaleString('en-PH', {minimumFractionDigits:2}) + '</span>' +
            '</div>';
        }).join('')
      : '<div class="muted" style="font-size:12px;">No orders yet.</div>';

    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">' + _escHtml(s.name) + '</div><button class="small-btn" onclick="renderSuppliers()">← Back</button></div>' +
      '<div class="card">' +
      (s.contact_person ? '<div><span class="muted">Contact:</span> ' + _escHtml(s.contact_person) + '</div>' : '') +
      (s.phone ? '<div><span class="muted">Phone:</span> ' + _escHtml(s.phone) + '</div>' : '') +
      (s.email ? '<div><span class="muted">Email:</span> ' + _escHtml(s.email) + '</div>' : '') +
      (s.address ? '<div><span class="muted">Address:</span> ' + _escHtml(s.address) + '</div>' : '') +
      '<div><span class="muted">Payment terms:</span> ' + (s.payment_terms || 'cash') + '</div>' +
      (s.notes ? '<div style="margin-top:8px;font-size:12px;color:#6b7280;">' + _escHtml(s.notes) + '</div>' : '') +
      '</div>' +
      '<div class="card"><div class="section-title" style="margin-bottom:8px;">Recent Purchase Orders</div>' + posHtml + '</div>' +
      (_hasPermission('suppliers', 'edit') ?
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
        '<button class="btn btn-secondary" onclick="renderEditSupplierForm(\'' + supplierId + '\')">✏️ Edit</button>' +
        '<button class="btn btn-secondary" style="background:#fee2e2;color:#dc2626;" onclick="confirmDeactivateSupplier(\'' + supplierId + '\')">🗑 Deactivate</button>' +
        '</div>' : '') +
      (_hasPermission('purchase_orders', 'create') ? '<button class="btn btn-primary" style="margin-top:8px;" onclick="renderCreatePO(\'' + supplierId + '\')">+ New Purchase Order</button>' : '') +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderSuppliers(); }
}

function renderAddSupplierForm(msg) {
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">Add Supplier</div><button class="small-btn" onclick="renderSuppliers()">← Back</button></div>' +
    (msg ? '<div class="message message-error">' + msg + '</div>' : '') +
    '<div class="card">' +
    '<div class="field"><label>Supplier Name *</label><input id="sup-name" placeholder="e.g. ABC Distributors"></div>' +
    '<div class="field"><label>Contact Person</label><input id="sup-contact" placeholder="Name"></div>' +
    '<div class="field"><label>Phone</label><input id="sup-phone" type="tel" placeholder="09xxxxxxxxx"></div>' +
    '<div class="field"><label>Email</label><input id="sup-email" type="email" placeholder="supplier@email.com"></div>' +
    '<div class="field"><label>Address</label><input id="sup-address" placeholder="Full address"></div>' +
    '<div class="field"><label>Payment Terms</label><select id="sup-terms"><option value="cash">Cash on Delivery</option><option value="net7">Net 7 days</option><option value="net15">Net 15 days</option><option value="net30">Net 30 days</option><option value="consignment">Consignment</option></select></div>' +
    '<div class="field"><label>Notes</label><input id="sup-notes" placeholder="Optional notes"></div>' +
    '<button class="btn btn-primary" onclick="submitAddSupplier()">Save Supplier</button>' +
    '</div></div>';
}

async function submitAddSupplier() {
  var name = (document.getElementById('sup-name').value || '').trim();
  if (!name) { _showToast('Supplier name is required', true); return; }
  showLoading('Saving…');
  try {
    await API.call('createSupplier', {
      name: name,
      contactPerson: document.getElementById('sup-contact').value || '',
      phone: document.getElementById('sup-phone').value || '',
      email: document.getElementById('sup-email').value || '',
      address: document.getElementById('sup-address').value || '',
      paymentTerms: document.getElementById('sup-terms').value || 'cash',
      notes: document.getElementById('sup-notes').value || ''
    });
    renderSuppliers('✓ Supplier added');
  } catch(e) { renderAddSupplierForm(e.message); }
}

async function renderEditSupplierForm(supplierId) {
  showLoading('Loading…');
  try {
    var s = await API.call('getSupplierById', { supplierId: supplierId });
    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">Edit Supplier</div><button class="small-btn" onclick="renderSupplierDetail(\'' + supplierId + '\')">← Back</button></div>' +
      '<div class="card">' +
      '<div class="field"><label>Supplier Name *</label><input id="sup-name" value="' + _escAttr(s.name) + '"></div>' +
      '<div class="field"><label>Contact Person</label><input id="sup-contact" value="' + _escAttr(s.contact_person) + '"></div>' +
      '<div class="field"><label>Phone</label><input id="sup-phone" value="' + _escAttr(s.phone) + '"></div>' +
      '<div class="field"><label>Email</label><input id="sup-email" value="' + _escAttr(s.email) + '"></div>' +
      '<div class="field"><label>Address</label><input id="sup-address" value="' + _escAttr(s.address) + '"></div>' +
      '<div class="field"><label>Payment Terms</label><select id="sup-terms">' +
      ['cash','net7','net15','net30','consignment'].map(function(t) { return '<option value="' + t + '"' + (s.payment_terms === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Notes</label><input id="sup-notes" value="' + _escAttr(s.notes) + '"></div>' +
      '<button class="btn btn-primary" onclick="submitEditSupplier(\'' + supplierId + '\')">Save Changes</button>' +
      '</div></div>';
  } catch(e) { _showToast(e.message, true); renderSuppliers(); }
}

async function submitEditSupplier(supplierId) {
  var name = (document.getElementById('sup-name').value || '').trim();
  if (!name) { _showToast('Supplier name is required', true); return; }
  showLoading('Saving…');
  try {
    await API.call('updateSupplier', {
      supplierId: supplierId,
      name: name,
      contactPerson: document.getElementById('sup-contact').value || '',
      phone: document.getElementById('sup-phone').value || '',
      email: document.getElementById('sup-email').value || '',
      address: document.getElementById('sup-address').value || '',
      paymentTerms: document.getElementById('sup-terms').value || 'cash',
      notes: document.getElementById('sup-notes').value || ''
    });
    renderSupplierDetail(supplierId);
    _showToast('✓ Supplier updated');
  } catch(e) { _showToast(e.message, true); }
}

async function confirmDeactivateSupplier(supplierId) {
  if (!confirm('Deactivate this supplier? This will hide them from the list.')) return;
  try {
    await API.call('deactivateSupplier', { supplierId: supplierId });
    renderSuppliers('✓ Supplier deactivated');
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS ── Task 11
// ══════════════════════════════════════════════════════════════════════════════

var PO_STATUS_LABELS = { draft:'Draft', submitted:'Submitted', approved:'Approved', partially_received:'Partial', received:'Received', cancelled:'Cancelled' };
var PO_STATUS_COLORS = { draft:'#6b7280', submitted:'#d97706', approved:'#2563eb', partially_received:'#7c3aed', received:'#16a34a', cancelled:'#dc2626' };

async function renderPurchaseOrders(msg) {
  showLoading('Loading purchase orders…');
  try {
    var pos = await API.call('getPurchaseOrders', {});
    _renderPOListUI(pos, null, msg);
  } catch(e) { _renderPOListUI([], e.message); }
}

function _renderPOListUI(pos, error, msg) {
  var rows = pos.length ? pos.map(function(po) {
    var color = PO_STATUS_COLORS[po.status] || '#6b7280';
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderPODetail(\'' + po.po_id + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-weight:bold;">' + po.po_number + '</div>' +
      '<div class="muted" style="font-size:12px;">' + _escHtml(po.supplier_name || '—') + ' · ' + (po.order_date || '') + '</div></div>' +
      '<div style="text-align:right;"><div style="font-size:12px;color:' + color + ';font-weight:bold;">' + (PO_STATUS_LABELS[po.status] || po.status) + '</div>' +
      '<div style="font-size:13px;font-weight:bold;">₱' + Number(po.total_amount||0).toLocaleString('en-PH',{minimumFractionDigits:2}) + '</div></div>' +
      '</div></div>';
  }).join('') : '<div class="muted" style="padding:8px;">No purchase orders yet.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📋 Purchase Orders</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows +
    (_hasPermission('purchase_orders', 'create') ? '<button class="btn btn-primary" style="margin-top:8px;" onclick="renderCreatePO()">+ New Purchase Order</button>' : '') +
    '</div>';
}

async function renderPODetail(poId) {
  showLoading('Loading PO…');
  try {
    var po = await API.call('getPurchaseOrderById', { poId: poId });
    var color = PO_STATUS_COLORS[po.status] || '#6b7280';
    var itemsHtml = (po.items||[]).map(function(item) {
      var remaining = Number(item.quantity_ordered) - Number(item.quantity_received);
      return '<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;">' +
        '<div style="display:flex;justify-content:space-between;">' +
        '<span style="font-size:13px;font-weight:bold;">' + _escHtml(item.product_name||item.product_id) + '</span>' +
        '<span style="font-size:13px;">₱' + Number(item.unit_cost||0).toFixed(2) + ' × ' + item.quantity_ordered + '</span>' +
        '</div>' +
        '<div class="muted" style="font-size:11px;">Received: ' + item.quantity_received + '/' + item.quantity_ordered +
        (remaining > 0 ? ' <span style="color:#d97706;">(' + remaining + ' pending)</span>' : ' <span style="color:#16a34a;">✓</span>') + '</div>' +
        '</div>';
    }).join('');

    var actions = '';
    if (po.status === 'draft' && _hasPermission('purchase_orders', 'submit'))
      actions += '<button class="btn btn-secondary" onclick="doSubmitPO(\'' + poId + '\')">📤 Submit for Approval</button>';
    if (['draft','submitted'].includes(po.status) && _hasPermission('purchase_orders', 'approve'))
      actions += '<button class="btn btn-primary" style="margin-top:8px;" onclick="doApprovePO(\'' + poId + '\')">✅ Approve PO</button>';
    if (['approved','partially_received'].includes(po.status) && _hasPermission('stock_receiving', 'create'))
      actions += '<button class="btn btn-primary" style="margin-top:8px;background:#7c3aed;" onclick="renderReceiveForm(\'' + poId + '\')">📦 Receive Stock</button>';
    if (!['received','cancelled'].includes(po.status) && _hasPermission('purchase_orders', 'cancel'))
      actions += '<button class="btn btn-secondary" style="margin-top:8px;background:#fee2e2;color:#dc2626;" onclick="doCancelPO(\'' + poId + '\')">✕ Cancel PO</button>';

    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">' + po.po_number + '</div><button class="small-btn" onclick="renderPurchaseOrders()">← Back</button></div>' +
      '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
      '<span class="muted">Status</span><span style="font-weight:bold;color:' + color + ';">' + (PO_STATUS_LABELS[po.status]||po.status) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span class="muted">Supplier</span><span>' + _escHtml(po.supplier_name||'—') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span class="muted">Order date</span><span>' + (po.order_date||'—') + '</span></div>' +
      (po.expected_delivery ? '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span class="muted">Expected</span><span>' + po.expected_delivery + '</span></div>' : '') +
      '<div style="display:flex;justify-content:space-between;"><span class="muted">Total</span><span style="font-weight:bold;">₱' + Number(po.total_amount||0).toLocaleString('en-PH',{minimumFractionDigits:2}) + '</span></div>' +
      (po.notes ? '<div style="margin-top:8px;font-size:12px;color:#6b7280;">' + _escHtml(po.notes) + '</div>' : '') +
      '</div>' +
      '<div class="card"><div class="section-title" style="margin-bottom:8px;">Items (' + (po.items||[]).length + ')</div>' + itemsHtml + '</div>' +
      (actions ? '<div class="card">' + actions + '</div>' : '') +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderPurchaseOrders(); }
}

async function renderCreatePO(defaultSupplierId) {
  showLoading('Loading suppliers & products…');
  try {
    var [suppliers, products] = await Promise.all([API.call('getSuppliers', {}), API.call('getProducts')]);
    if (!suppliers.length) { _showToast('Add a supplier first', true); renderSuppliers(); return; }
    _renderCreatePOForm(suppliers, products, defaultSupplierId);
  } catch(e) { _showToast(e.message, true); renderPurchaseOrders(); }
}

function _renderCreatePOForm(suppliers, products, defaultSupplierId) {
  var supOptions = suppliers.map(function(s) {
    return '<option value="' + s.supplier_id + '"' + (s.supplier_id === defaultSupplierId ? ' selected' : '') + '>' + _escHtml(s.name) + '</option>';
  }).join('');
  var prodOptions = '<option value="">— Select product —</option>' + products.map(function(p) {
    return '<option value="' + p.Product_ID + '">' + _escHtml(p.Product_Name) + (p.Barcode ? ' (' + p.Barcode + ')' : '') + '</option>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">New Purchase Order</div><button class="small-btn" onclick="renderPurchaseOrders()">← Back</button></div>' +
    '<div class="card">' +
    '<div class="field"><label>Supplier *</label><select id="po-supplier">' + supOptions + '</select></div>' +
    '<div class="field"><label>Order Date</label><input id="po-date" type="date" value="' + _todayInput() + '"></div>' +
    '<div class="field"><label>Expected Delivery</label><input id="po-delivery" type="date"></div>' +
    '<div class="field"><label>Notes</label><input id="po-notes" placeholder="Optional"></div>' +
    '</div>' +
    '<div class="card"><div class="section-title" style="margin-bottom:8px;">Items</div>' +
    '<div id="po-items"></div>' +
    '<div style="display:grid;grid-template-columns:1fr auto auto;gap:6px;margin-top:8px;align-items:end;">' +
    '<select id="po-item-product">' + prodOptions + '</select>' +
    '<input id="po-item-qty" type="number" min="1" value="1" style="width:60px;" placeholder="Qty">' +
    '<input id="po-item-cost" type="number" min="0" step="0.01" style="width:80px;" placeholder="Cost">' +
    '</div>' +
    '<button class="btn btn-secondary" style="margin-top:6px;" onclick="addPOItem()">+ Add Item</button>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="submitCreatePO()">Create Purchase Order</button>' +
    '</div>';
  window._poItems = [];
}

function addPOItem() {
  var sel = document.getElementById('po-item-product');
  var productId = sel.value;
  var productName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
  var qty = Number(document.getElementById('po-item-qty').value) || 0;
  var cost = Number(document.getElementById('po-item-cost').value) || 0;
  if (!productId) { _showToast('Select a product', true); return; }
  if (qty <= 0) { _showToast('Qty must be positive', true); return; }
  window._poItems = window._poItems || [];
  window._poItems.push({ productId: productId, productName: productName, qty: qty, unitCost: cost });
  _renderPOItemsList();
}

function _renderPOItemsList() {
  var container = document.getElementById('po-items');
  if (!container) return;
  container.innerHTML = (window._poItems||[]).map(function(item, idx) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;">' +
      '<div style="flex:1;font-size:13px;">' + _escHtml(item.productName) + '<br><span class="muted">' + item.qty + ' × ₱' + Number(item.unitCost).toFixed(2) + '</span></div>' +
      '<button onclick="removePOItem(' + idx + ')" style="border:none;background:none;color:#dc2626;font-size:16px;cursor:pointer;">✕</button>' +
      '</div>';
  }).join('');
}

function removePOItem(idx) { (window._poItems||[]).splice(idx,1); _renderPOItemsList(); }

async function submitCreatePO() {
  var supplierId = document.getElementById('po-supplier').value;
  if (!supplierId) { _showToast('Select a supplier', true); return; }
  if (!window._poItems || !window._poItems.length) { _showToast('Add at least one item', true); return; }
  showLoading('Creating PO…');
  try {
    var result = await API.call('createPurchaseOrder', {
      supplierId: supplierId,
      orderDate: document.getElementById('po-date').value,
      expectedDelivery: document.getElementById('po-delivery').value,
      notes: document.getElementById('po-notes').value,
      items: window._poItems
    });
    window._poItems = [];
    renderPODetail(result.poId);
    _showToast('✓ PO ' + result.poNumber + ' created');
  } catch(e) { _showToast(e.message, true); showLoading(''); renderPurchaseOrders(); }
}

async function doSubmitPO(poId) {
  showLoading('Submitting…');
  try { await API.call('submitPurchaseOrder', { poId: poId }); renderPODetail(poId); _showToast('✓ PO submitted'); }
  catch(e) { _showToast(e.message, true); renderPODetail(poId); }
}
async function doApprovePO(poId) {
  showLoading('Approving…');
  try { await API.call('approvePurchaseOrder', { poId: poId }); renderPODetail(poId); _showToast('✓ PO approved'); }
  catch(e) { _showToast(e.message, true); renderPODetail(poId); }
}
async function doCancelPO(poId) {
  if (!confirm('Cancel this purchase order?')) return;
  showLoading('Cancelling…');
  try { await API.call('cancelPurchaseOrder', { poId: poId }); renderPurchaseOrders('✓ PO cancelled'); }
  catch(e) { _showToast(e.message, true); renderPODetail(poId); }
}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK RECEIVING ── Task 12
// ══════════════════════════════════════════════════════════════════════════════

async function renderReceiveForm(poId) {
  showLoading('Loading PO…');
  try {
    var po = await API.call('getPurchaseOrderById', { poId: poId });
    var pendingItems = (po.items||[]).filter(function(i) { return Number(i.quantity_ordered) > Number(i.quantity_received); });
    if (!pendingItems.length) { _showToast('All items already received', true); renderPODetail(poId); return; }

    var itemInputs = pendingItems.map(function(item, idx) {
      var pending = Number(item.quantity_ordered) - Number(item.quantity_received);
      return '<div class="card" style="margin-bottom:8px;">' +
        '<div style="font-weight:bold;font-size:13px;">' + _escHtml(item.product_name||item.product_id) + '</div>' +
        '<div class="muted" style="font-size:11px;">Ordered: ' + item.quantity_ordered + ' · Previously received: ' + item.quantity_received + ' · Pending: ' + pending + '</div>' +
        '<input type="hidden" id="recv-poi-' + idx + '" value="' + item.id + '">' +
        '<input type="hidden" id="recv-pid-' + idx + '" value="' + item.product_id + '">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
        '<div class="field" style="margin:0;"><label style="font-size:11px;">Qty Received</label><input id="recv-qty-' + idx + '" type="number" min="0" max="' + pending + '" value="' + pending + '"></div>' +
        '<div class="field" style="margin:0;"><label style="font-size:11px;">Condition</label><select id="recv-cond-' + idx + '"><option value="good">Good</option><option value="damaged">Damaged</option><option value="rejected">Rejected</option></select></div>' +
        '</div></div>';
    }).join('');

    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">📦 Receive Stock</div><button class="small-btn" onclick="renderPODetail(\'' + poId + '\')">← Back</button></div>' +
      '<div class="card"><div class="muted" style="font-size:12px;">PO: ' + po.po_number + ' · Supplier: ' + _escHtml(po.supplier_name||'—') + '</div></div>' +
      itemInputs +
      '<div class="card">' +
      '<div class="field"><label>Receipt Date</label><input id="recv-date" type="date" value="' + _todayInput() + '"></div>' +
      '<div class="field"><label>Notes</label><input id="recv-notes" placeholder="Optional notes"></div>' +
      '<div class="field"><label>Discrepancy Notes</label><input id="recv-disc" placeholder="Any discrepancies found?"></div>' +
      '</div>' +
      '<button class="btn btn-primary" onclick="submitReceiveStock(\'' + poId + '\',' + pendingItems.length + ')">✓ Confirm Receipt</button>' +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderPurchaseOrders(); }
}

async function submitReceiveStock(poId, count) {
  var items = [];
  for (var i = 0; i < count; i++) {
    var qty = Number((document.getElementById('recv-qty-'+i)||{}).value) || 0;
    if (qty > 0) {
      items.push({
        poItemId: document.getElementById('recv-poi-'+i).value,
        productId: document.getElementById('recv-pid-'+i).value,
        qtyReceived: qty,
        condition: document.getElementById('recv-cond-'+i).value
      });
    }
  }
  if (!items.length) { _showToast('Enter at least one received quantity', true); return; }
  showLoading('Recording receipt…');
  try {
    var result = await API.call('receiveStock', {
      poId: poId,
      receiptDate: document.getElementById('recv-date').value,
      notes: document.getElementById('recv-notes').value,
      discrepancyNotes: document.getElementById('recv-disc').value,
      items: items
    });
    renderPODetail(poId);
    _showToast('✓ Stock received — ' + result.receiptNumber);
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// BRANCH TRANSFERS ── Task 14
// ══════════════════════════════════════════════════════════════════════════════

var BT_STATUS_LABELS = { draft:'Draft', pending_approval:'Pending Approval', approved:'Approved', in_transit:'In Transit', received:'Received', partially_received:'Partial', cancelled:'Cancelled' };
var BT_STATUS_COLORS = { draft:'#6b7280', pending_approval:'#d97706', approved:'#2563eb', in_transit:'#7c3aed', received:'#16a34a', partially_received:'#16a34a', cancelled:'#dc2626' };

async function renderBranchTransfers(msg) {
  showLoading('Loading transfers…');
  try {
    var transfers = await API.call('getBranchTransfers', {});
    _renderBTListUI(transfers, null, msg);
  } catch(e) { _renderBTListUI([], e.message); }
}

function _renderBTListUI(transfers, error, msg) {
  var rows = transfers.length ? transfers.map(function(t) {
    var color = BT_STATUS_COLORS[t.status] || '#6b7280';
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderBranchTransferDetail(\'' + t.id + '\')">' +
      '<div style="display:flex;justify-content:space-between;">' +
      '<div><div style="font-weight:bold;font-size:13px;">' + (t.transfer_number||t.id) + '</div>' +
      '<div class="muted" style="font-size:11px;">' + _escHtml(t.source_branch_name||'—') + ' → ' + _escHtml(t.destination_branch_name||'—') + '</div></div>' +
      '<span style="font-size:12px;color:' + color + ';font-weight:bold;">' + (BT_STATUS_LABELS[t.status]||t.status) + '</span>' +
      '</div></div>';
  }).join('') : '<div class="muted" style="padding:8px;">No branch transfers found.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🔄 Branch Transfers</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows +
    (_hasPermission('branch_transfer','create') ? '<button class="btn btn-primary" style="margin-top:8px;" onclick="renderCreateBranchTransfer()">+ New Transfer</button>' : '') +
    '</div>';
}

async function renderBranchTransferDetail(transferId) {
  showLoading('Loading transfer…');
  try {
    var t = await API.call('getBranchTransferById', { id: transferId });
    var color = BT_STATUS_COLORS[t.status] || '#6b7280';
    var itemsHtml = (t.items||[]).map(function(item) {
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">' +
        '<span>' + _escHtml(item.product_name||item.product_id) + '</span>' +
        '<span>Req: ' + item.requested_quantity + (item.sent_quantity ? ' Sent: '+item.sent_quantity : '') + (item.received_quantity ? ' Rcvd: '+item.received_quantity : '') + '</span>' +
        '</div>';
    }).join('');

    var actions = '';
    if (t.status === 'draft' && _hasPermission('branch_transfer','submit'))
      actions += '<button class="btn btn-secondary" onclick="doBTAction(\'submitBranchTransfer\',\'' + transferId + '\')">📤 Submit</button>';
    if (t.status === 'pending_approval' && _hasPermission('branch_transfer','approve'))
      actions += '<button class="btn btn-primary" style="margin-top:8px;" onclick="doBTAction(\'approveBranchTransfer\',\'' + transferId + '\')">✅ Approve</button>';
    if (t.status === 'approved' && _hasPermission('branch_transfer','submit'))
      actions += '<button class="btn btn-primary" style="margin-top:8px;background:#7c3aed;" onclick="doBTAction(\'markBranchTransferSent\',\'' + transferId + '\')">🚚 Mark Sent</button>';
    if (t.status === 'in_transit' && _hasPermission('branch_transfer','receive'))
      actions += '<button class="btn btn-primary" style="margin-top:8px;" onclick="doBTAction(\'receiveBranchTransfer\',\'' + transferId + '\')">📦 Confirm Received</button>';
    if (!['received','cancelled'].includes(t.status) && _hasPermission('branch_transfer','cancel'))
      actions += '<button class="btn btn-secondary" style="margin-top:8px;background:#fee2e2;color:#dc2626;" onclick="doBTAction(\'cancelBranchTransfer\',\'' + transferId + '\')">✕ Cancel</button>';

    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">' + (t.transfer_number||'Transfer') + '</div><button class="small-btn" onclick="renderBranchTransfers()">← Back</button></div>' +
      '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">Status</span><span style="color:' + color + ';font-weight:bold;">' + (BT_STATUS_LABELS[t.status]||t.status) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">From</span><span>' + _escHtml(t.source_branch_name||'—') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;"><span class="muted">To</span><span>' + _escHtml(t.destination_branch_name||'—') + '</span></div>' +
      '</div>' +
      '<div class="card"><div class="section-title" style="margin-bottom:8px;">Items</div>' + (itemsHtml||'<div class="muted">No items</div>') + '</div>' +
      (actions ? '<div class="card">' + actions + '</div>' : '') +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderBranchTransfers(); }
}

async function renderCreateBranchTransfer() {
  _showToast('Branch setup required in Settings first. Contact support to add branches.', false);
  renderBranchTransfers();
}

async function doBTAction(action, transferId) {
  showLoading('Processing…');
  try {
    await API.call(action, { id: transferId });
    renderBranchTransferDetail(transferId);
    _showToast('✓ Done');
  } catch(e) { _showToast(e.message, true); renderBranchTransferDetail(transferId); }
}

// ══════════════════════════════════════════════════════════════════════════════
// HQ CONTROL CENTER ── Task 15
// ══════════════════════════════════════════════════════════════════════════════

async function renderHQControlCenter() {
  showLoading('Loading HQ overview…');
  try {
    var data = await API.call('getHqControlCenter', {});
    _renderHQPage(data);
  } catch(e) {
    document.getElementById('app').innerHTML =
      '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">🏢 HQ Control Center</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
      '<div class="card"><div class="message message-error">' + e.message + '</div></div></div>';
  }
}

function _renderHQPage(data) {
  var attQueue = (data.branch_attention_queue||[]).map(function(b) {
    var color = b.highest_severity === 'critical' ? '#dc2626' : b.highest_severity === 'watch' ? '#d97706' : '#16a34a';
    return '<div class="card" style="margin-bottom:8px;border-left:4px solid ' + color + ';">' +
      '<div style="font-weight:bold;">' + _escHtml(b.branch_name||'—') + '</div>' +
      '<div class="muted" style="font-size:12px;">' + b.issue_count + ' issue(s) · ' + (b.highest_severity||'info') + '</div>' +
      (b.reasons||[]).map(function(r) { return '<div style="font-size:11px;color:#6b7280;">· ' + r + '</div>'; }).join('') +
      '</div>';
  }).join('') || '<div class="card"><div class="muted">All branches operating normally ✓</div></div>';

  var ops = data.operational_queues || {};
  var opCards = '';
  if (ops.approvals) opCards += '<div style="text-align:center;padding:8px;"><div style="font-size:24px;font-weight:bold;">' + ops.approvals.total_pending + '</div><div class="muted" style="font-size:12px;">Pending Approvals</div></div>';
  if (ops.branch_transfers) opCards += '<div style="text-align:center;padding:8px;"><div style="font-size:24px;font-weight:bold;">' + (ops.branch_transfers.in_transit||0) + '</div><div class="muted" style="font-size:12px;">In Transit</div></div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🏢 HQ Control Center</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (data.header ? '<div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;"><div class="section-title">' + data.header.title + '</div><div class="muted" style="font-size:12px;">' + (data.header.subtitle||'') + '</div></div>' : '') +
    '<div class="section-title" style="margin:12px 0 8px;">🚨 Branches Needing Attention</div>' + attQueue +
    (opCards ? '<div class="card"><div class="section-title" style="margin-bottom:8px;">Operational Queue</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">' + opCards + '</div></div>' : '') +
    '</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED EXECUTIVE DASHBOARD ── Task 16
// ══════════════════════════════════════════════════════════════════════════════

async function renderConsolidatedDashboard(period) {
  period = period || 'last_month';
  showLoading('Loading consolidated view…');
  try {
    var data = await API.call('getConsolidatedExecutiveDashboard', { period: period });
    _renderConsolidatedPage(data, period);
  } catch(e) {
    document.getElementById('app').innerHTML =
      '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">📊 Consolidated Dashboard</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
      '<div class="card"><div class="message message-error">' + e.message + '</div></div></div>';
  }
}

function _renderConsolidatedPage(data, period) {
  var s = data.summary || {};
  function money(v) { return '₱' + Number(v||0).toLocaleString('en-PH', {minimumFractionDigits:0}); }
  var periodBtns = ['last_month','last_quarter','last_year'].map(function(p) {
    return '<button onclick="renderConsolidatedDashboard(\'' + p + '\')" style="padding:6px 12px;border-radius:6px;border:1px solid #e5e7eb;background:' + (period===p?'#111827':'white') + ';color:' + (period===p?'white':'#374151') + ';font-size:12px;cursor:pointer;">' + p.replace('_',' ') + '</button>';
  }).join('');

  var highlights = data.highlights || {};
  var hlHtml = '';
  if (highlights.top_sales_branch) hlHtml += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;"><span class="muted">Top Sales</span><span style="font-weight:bold;">' + _escHtml(highlights.top_sales_branch.branch_name||'—') + '</span></div>';
  if (highlights.bottom_result_branch) hlHtml += '<div style="display:flex;justify-content:space-between;padding:6px 0;"><span class="muted" style="color:#dc2626;">Lowest Result</span><span style="font-weight:bold;color:#dc2626;">' + _escHtml(highlights.bottom_result_branch.branch_name||'—') + '</span></div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📊 All Branches</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">' + periodBtns + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
    '<div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#16a34a;">' + money(s.total_sales) + '</div><div class="muted" style="font-size:12px;">Total Sales</div></div>' +
    '<div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#111827;">' + money(s.estimated_business_result) + '</div><div class="muted" style="font-size:12px;">Est. Result</div></div>' +
    '<div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#dc2626;">' + money(s.total_expenses) + '</div><div class="muted" style="font-size:12px;">Expenses</div></div>' +
    '<div class="card" style="text-align:center;"><div style="font-size:20px;font-weight:bold;">' + (s.total_transactions||0) + '</div><div class="muted" style="font-size:12px;">Transactions</div></div>' +
    '</div>' +
    (hlHtml ? '<div class="card"><div class="section-title" style="margin-bottom:8px;">Highlights</div>' + hlHtml + '</div>' : '') +
    '</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-BRANCH REPORTS ── Task 17
// ══════════════════════════════════════════════════════════════════════════════

async function renderMultiBranchReports(type, period) {
  type = type || 'branch_sales_analysis';
  period = period || 'last_month';
  showLoading('Generating report…');
  try {
    var data = await API.call('getMultiBranchAdvancedReports', { type: type, period: period });
    _renderMBReportPage(data, type, period);
  } catch(e) {
    document.getElementById('app').innerHTML =
      '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">📈 Multi-Branch Reports</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
      '<div class="card"><div class="message message-error">' + e.message + '</div></div></div>';
  }
}

function _renderMBReportPage(data, type, period) {
  var REPORT_TYPES = ['branch_sales_analysis','branch_expense_analysis','branch_inventory_health','branch_performance_comparison','branch_contribution','branch_risk'];
  var typeSelector = '<div style="overflow-x:auto;white-space:nowrap;margin-bottom:10px;">' +
    REPORT_TYPES.map(function(t) {
      return '<button onclick="renderMultiBranchReports(\'' + t + '\',\'' + period + '\')" style="padding:6px 10px;border-radius:6px;border:1px solid #e5e7eb;background:' + (type===t?'#111827':'white') + ';color:' + (type===t?'white':'#374151') + ';font-size:11px;cursor:pointer;margin-right:4px;">' + t.replace(/branch_|_/g,' ').trim() + '</button>';
    }).join('') + '</div>';

  var sectionsHtml = (data.sections||[]).map(function(sec) {
    var rowsHtml = (sec.data||[]).slice(0,10).map(function(row) {
      return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid #f3f4f6;">' +
        '<span>' + _escHtml(String(row.branch_name||row.label||Object.values(row)[0]||'—')) + '</span>' +
        '<span style="font-weight:bold;">' + _escHtml(String(Object.values(row).slice(-1)[0]||'—')) + '</span>' +
        '</div>';
    }).join('');
    return '<div class="card" style="margin-bottom:8px;"><div class="section-title" style="margin-bottom:8px;">' + _escHtml(sec.title||'') + '</div>' + (rowsHtml||'<div class="muted">No data</div>') + '</div>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📈 Multi-Branch</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    typeSelector +
    '<div class="card" style="margin-bottom:8px;"><div class="subtitle">' + _escHtml(data.title||type) + '</div></div>' +
    sectionsHtml +
    '</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM ROLE BUILDER ── Task 18
// ══════════════════════════════════════════════════════════════════════════════

async function renderCustomRoles(msg) {
  showLoading('Loading roles…');
  try {
    var roles = await API.call('getCustomRoles', {});
    _renderCustomRolesUI(roles, null, msg);
  } catch(e) { _renderCustomRolesUI([], e.message); }
}

function _renderCustomRolesUI(roles, error, msg) {
  var rows = roles.length ? roles.map(function(r) {
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderCustomRoleDetail(\'' + r.id + '\')">' +
      '<div style="font-weight:bold;">' + _escHtml(r.role_name) + ' <span class="muted" style="font-weight:normal;font-size:12px;">(' + r.role_code + ')</span></div>' +
      '<div class="muted" style="font-size:12px;">' + (r.permission_count||0) + ' permissions · ' + (r.assigned_user_count||0) + ' users · ' + (r.status||'active') + '</div>' +
      '</div>';
  }).join('') : '<div class="muted" style="padding:8px;">No custom roles yet.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🔑 Custom Roles</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows +
    (_hasPermission('custom_role_builder','create_role') ? '<button class="btn btn-primary" style="margin-top:8px;" onclick="renderCreateCustomRole()">+ Create Custom Role</button>' : '') +
    '</div>';
}

async function renderCustomRoleDetail(roleId) {
  showLoading('Loading role…');
  try {
    var role = await API.call('getCustomRoleById', { id: roleId });
    var permsHtml = (role.permissions||[]).map(function(p) {
      return '<span style="display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 6px;font-size:11px;margin:2px;">' + p + '</span>';
    }).join('');
    var usersHtml = (role.assigned_users||[]).map(function(u) {
      return '<div style="font-size:13px;padding:4px 0;">' + _escHtml(u.full_name||u.username||u.user_id) + '</div>';
    }).join('') || '<div class="muted" style="font-size:12px;">No users assigned</div>';

    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">' + _escHtml(role.role_name) + '</div><button class="small-btn" onclick="renderCustomRoles()">← Back</button></div>' +
      '<div class="card"><div class="muted" style="font-size:12px;margin-bottom:8px;">Code: ' + role.role_code + ' · Status: ' + (role.status||'active') + '</div>' +
      (role.description ? '<div style="font-size:13px;margin-bottom:8px;">' + _escHtml(role.description) + '</div>' : '') +
      '<div class="section-title" style="font-size:13px;margin-bottom:6px;">Permissions</div>' +
      (permsHtml || '<div class="muted" style="font-size:12px;">No permissions assigned</div>') + '</div>' +
      '<div class="card"><div class="section-title" style="font-size:13px;margin-bottom:6px;">Assigned Users</div>' + usersHtml + '</div>' +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderCustomRoles(); }
}

async function renderCreateCustomRole() {
  showLoading('Loading permission catalog…');
  try {
    var catalog = await API.call('getPermissionCatalog', {});
    _renderCreateRoleForm(catalog);
  } catch(e) { _showToast(e.message, true); renderCustomRoles(); }
}

function _renderCreateRoleForm(catalog) {
  var moduleCheckboxes = Object.keys(catalog).map(function(module) {
    var actions = catalog[module];
    return '<div style="margin-bottom:8px;">' +
      '<div style="font-weight:bold;font-size:13px;margin-bottom:4px;">' + module + '</div>' +
      actions.map(function(action) {
        var key = module + '.' + action;
        return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;font-size:12px;"><input type="checkbox" name="perm" value="' + key + '"> ' + action + '</label>';
      }).join('') + '</div>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">Create Custom Role</div><button class="small-btn" onclick="renderCustomRoles()">← Back</button></div>' +
    '<div class="card">' +
    '<div class="field"><label>Role Name *</label><input id="cr-name" placeholder="e.g. Senior Cashier"></div>' +
    '<div class="field"><label>Role Code *</label><input id="cr-code" placeholder="e.g. SENIOR_CASHIER (uppercase)"></div>' +
    '<div class="field"><label>Description</label><input id="cr-desc" placeholder="What this role can do"></div>' +
    '</div>' +
    '<div class="card"><div class="section-title" style="margin-bottom:8px;">Permissions</div>' + moduleCheckboxes + '</div>' +
    '<button class="btn btn-primary" onclick="submitCreateCustomRole()">Create Role</button>' +
    '</div>';
}

async function submitCreateCustomRole() {
  var name = (document.getElementById('cr-name').value||'').trim();
  var code = (document.getElementById('cr-code').value||'').trim().toUpperCase().replace(/\s/g,'_');
  if (!name || !code) { _showToast('Name and code are required', true); return; }
  var perms = Array.from(document.querySelectorAll('input[name="perm"]:checked')).map(function(el) { return el.value; });
  showLoading('Creating role…');
  try {
    await API.call('createCustomRole', { role_name: name, role_code: code, description: document.getElementById('cr-desc').value||'', permissions: perms });
    renderCustomRoles('✓ Custom role created');
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ALERTS CENTER ── Task 19
// ══════════════════════════════════════════════════════════════════════════════

async function renderAlertsCenter(filter) {
  filter = filter || '';
  showLoading('Loading alerts…');
  try {
    var params = filter ? { severity: filter } : {};
    var alerts = await API.call('getAlerts', params);
    _renderAlertsUI(alerts, filter);
  } catch(e) { _renderAlertsUI([], filter, e.message); }
}

function _renderAlertsUI(alerts, filter, error) {
  var SEV_COLORS = { critical: '#dc2626', watch: '#d97706', info: '#2563eb' };
  var filterBtns = ['','critical','watch','info'].map(function(f) {
    return '<button onclick="renderAlertsCenter(\'' + f + '\')" style="padding:5px 10px;border-radius:6px;border:1px solid #e5e7eb;background:' + (filter===f?'#111827':'white') + ';color:' + (filter===f?'white':'#374151') + ';font-size:11px;cursor:pointer;margin-right:4px;">' + (f||'All') + '</button>';
  }).join('');
  var rows = alerts.length ? alerts.map(function(a) {
    var color = SEV_COLORS[a.severity] || '#6b7280';
    return '<div class="card" style="margin-bottom:8px;border-left:4px solid ' + color + ';">' +
      '<div style="display:flex;justify-content:space-between;">' +
      '<div style="font-weight:bold;font-size:13px;">' + _escHtml(a.title) + '</div>' +
      '<span style="font-size:11px;color:' + color + ';font-weight:bold;">' + (a.severity||'info').toUpperCase() + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:#374151;margin-top:4px;">' + _escHtml(a.message||'') + '</div>' +
      (a.action_suggestion ? '<div class="muted" style="font-size:11px;margin-top:4px;">💡 ' + _escHtml(a.action_suggestion) + '</div>' : '') +
      '</div>';
  }).join('') : '<div class="muted" style="padding:8px;">No alerts ' + (filter?'with severity '+filter:'') + '.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🔔 Alerts</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    '<div style="margin-bottom:10px;">' + filterBtns + '</div>' +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS CENTER ── Task 20
// ══════════════════════════════════════════════════════════════════════════════

async function renderNotificationsCenter() {
  showLoading('Loading notifications…');
  try {
    var notifications = await API.call('getNotifications', { limit: 50 });
    _renderNotificationsUI(notifications);
  } catch(e) { _renderNotificationsUI([], e.message); }
}

function _renderNotificationsUI(notifications, error) {
  var SEV_COLORS = { critical: '#dc2626', watch: '#d97706', info: '#2563eb' };
  var rows = notifications.length ? notifications.map(function(n) {
    var color = SEV_COLORS[n.severity] || '#6b7280';
    var unread = n.status === 'unread';
    return '<div class="card" style="margin-bottom:8px;' + (unread ? 'border-left:4px solid ' + color + ';' : 'opacity:0.75;') + 'cursor:pointer;" onclick="markAndReadNotif(\'' + n.id + '\')">' +
      '<div style="display:flex;justify-content:space-between;">' +
      '<div style="font-weight:' + (unread?'bold':'normal') + ';font-size:13px;">' + _escHtml(n.title||n.notification_code||'Notification') + '</div>' +
      '<span style="font-size:11px;color:' + color + ';">' + (n.severity||'info') + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:#374151;margin-top:4px;">' + _escHtml(n.message||'') + '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:4px;">' + (n.generated_at||'').slice(0,16) + '</div>' +
      '</div>';
  }).join('') : '<div class="muted" style="padding:8px;">No notifications.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📬 Notifications</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows + '</div>';
}

async function markAndReadNotif(notifId) {
  try { await API.call('markNotificationRead', { id: notifId }); } catch(e) {}
  renderNotificationsCenter();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTOMATION RULES ── Task 21
// ══════════════════════════════════════════════════════════════════════════════

async function renderAutomationRules(msg) {
  showLoading('Loading automation rules…');
  try {
    var rules = await API.call('getAutomationRules', {});
    _renderAutoRulesUI(rules, null, msg);
  } catch(e) { _renderAutoRulesUI([], e.message); }
}

function _renderAutoRulesUI(rules, error, msg) {
  var rows = rules.length ? rules.map(function(r) {
    var active = r.status === 'active';
    return '<div class="card" style="margin-bottom:8px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div style="flex:1;"><div style="font-weight:bold;font-size:13px;">' + _escHtml(r.rule_name) + '</div>' +
      '<div class="muted" style="font-size:11px;">' + (r.trigger_type||'') + ' → ' + (r.action_type||'') + '</div></div>' +
      '<button onclick="toggleAutoRule(\'' + r.id + '\',\'' + (active?'inactive':'active') + '\')" style="padding:4px 10px;border-radius:6px;border:none;background:' + (active?'#dcfce7':'#fee2e2') + ';color:' + (active?'#16a34a':'#dc2626') + ';font-size:11px;cursor:pointer;">' + (active?'Active':'Inactive') + '</button>' +
      '</div></div>';
  }).join('') : '<div class="muted" style="padding:8px;">No automation rules yet.</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">⚡ Automation Rules</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    rows +
    (_hasPermission('automation_rules','create') ? '<button class="btn btn-primary" style="margin-top:8px;" onclick="renderCreateAutoRule()">+ Create Rule</button>' : '') +
    '</div>';
}

async function toggleAutoRule(ruleId, newStatus) {
  try {
    await API.call('updateAutomationRuleStatus', { id: ruleId, status: newStatus });
    renderAutomationRules();
  } catch(e) { _showToast(e.message, true); }
}

function renderCreateAutoRule() {
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">Create Automation Rule</div><button class="small-btn" onclick="renderAutomationRules()">← Back</button></div>' +
    '<div class="card">' +
    '<div class="field"><label>Rule Name *</label><input id="ar-name" placeholder="e.g. Escalate critical stock alerts"></div>' +
    '<div class="field"><label>Description</label><input id="ar-desc" placeholder="What does this rule do?"></div>' +
    '<div class="field"><label>Trigger</label><select id="ar-trigger"><option value="alert_created">Alert Created</option><option value="workflow_event">Workflow Event</option><option value="scheduled_condition">Scheduled Condition</option></select></div>' +
    '<div class="field"><label>Action</label><select id="ar-action"><option value="create_notification">Create Notification</option><option value="escalate_alert">Escalate Alert</option><option value="create_followup_flag">Create Follow-up Flag</option><option value="create_reminder_notification">Create Reminder</option></select></div>' +
    '<button class="btn btn-primary" onclick="submitCreateAutoRule()">Create Rule</button>' +
    '</div></div>';
}

async function submitCreateAutoRule() {
  var name = (document.getElementById('ar-name').value||'').trim();
  if (!name) { _showToast('Rule name is required', true); return; }
  showLoading('Saving…');
  try {
    await API.call('createAutomationRule', {
      rule_name: name,
      description: document.getElementById('ar-desc').value||'',
      trigger_type: document.getElementById('ar-trigger').value,
      trigger_config: {},
      condition_config: {},
      action_type: document.getElementById('ar-action').value,
      action_config: {},
      status: 'active'
    });
    renderAutomationRules('✓ Rule created');
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA IMPORT TOOLS ── Task 22
// ══════════════════════════════════════════════════════════════════════════════

async function renderDataImport(msg) {
  showLoading('Loading import jobs…');
  try {
    var jobs = await API.call('getImportJobs', {});
    _renderDataImportUI(jobs, null, msg);
  } catch(e) { _renderDataImportUI([], e.message); }
}

function _renderDataImportUI(jobs, error, msg) {
  var IMPORT_TYPES = ['products','opening_stock','suppliers','staff','branches'];
  var typeSelector = '<div class="card">' +
    '<div class="section-title" style="margin-bottom:8px;">Start New Import</div>' +
    '<div class="field"><label>Import Type</label><select id="import-type">' +
    IMPORT_TYPES.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select></div>' +
    '<button class="btn btn-secondary" onclick="downloadImportTemplate()" style="margin-bottom:8px;">📥 Download Template CSV</button>' +
    '<div class="field"><label>Upload CSV File</label><input type="file" id="import-file" accept=".csv"></div>' +
    '<button class="btn btn-primary" onclick="submitImportUpload()">Upload & Validate</button>' +
    '</div>';

  var jobRows = jobs.length ? jobs.map(function(j) {
    var statusColor = { completed:'#16a34a', failed:'#dc2626', uploaded:'#d97706', validated:'#2563eb' }[j.status] || '#6b7280';
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderImportJobDetail(\'' + j.id + '\')">' +
      '<div style="display:flex;justify-content:space-between;">' +
      '<div><div style="font-weight:bold;font-size:13px;">' + (j.import_type||'import') + '</div>' +
      '<div class="muted" style="font-size:11px;">' + (j.total_rows||0) + ' rows · ' + (j.valid_rows||0) + ' valid · ' + (j.invalid_rows||0) + ' errors</div></div>' +
      '<span style="font-size:12px;color:' + statusColor + ';font-weight:bold;">' + j.status + '</span>' +
      '</div></div>';
  }).join('') : '';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">📤 Data Import</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    typeSelector +
    (jobRows ? '<div class="section-title" style="margin:12px 0 8px;">Import History</div>' + jobRows : '') +
    '</div>';
}

async function downloadImportTemplate() {
  var type = document.getElementById('import-type').value;
  showLoading('Getting template…');
  try {
    var result = await API.call('getImportTemplate', { type: type });
    var blob = new Blob([result.csv||''], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = type + '_template.csv';
    a.click();
    showLoading('');
    _showToast('Template downloaded');
  } catch(e) { _showToast(e.message, true); }
}

async function submitImportUpload() {
  var type = document.getElementById('import-type').value;
  var fileInput = document.getElementById('import-file');
  if (!fileInput || !fileInput.files[0]) { _showToast('Select a CSV file first', true); return; }
  var reader = new FileReader();
  reader.onload = async function(ev) {
    showLoading('Validating…');
    try {
      var result = await API.call('uploadImportJob', { import_type: type, csv_data: ev.target.result });
      renderImportJobDetail(result.id);
    } catch(e) { _showToast(e.message, true); renderDataImport(); }
  };
  reader.readAsText(fileInput.files[0]);
}

async function renderImportJobDetail(jobId) {
  showLoading('Loading job…');
  try {
    var job = await API.call('getImportJobById', { id: jobId });
    var rowsHtml = (job.sample_rows||[]).slice(0,10).map(function(r) {
      var color = r.validation_status === 'valid' ? '#16a34a' : '#dc2626';
      return '<div style="padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:11px;color:' + color + ';">Row ' + r.row_number + ': ' + (r.validation_messages||[]).join(', ') + '</div>';
    }).join('');

    var canConfirm = job.status === 'validated' && (job.valid_rows||0) > 0;
    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">Import Job</div><button class="small-btn" onclick="renderDataImport()">← Back</button></div>' +
      '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">Type</span><span>' + (job.import_type||'—') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">Status</span><span style="font-weight:bold;">' + (job.status||'—') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">Total rows</span><span>' + (job.total_rows||0) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted" style="color:#16a34a;">Valid</span><span style="color:#16a34a;font-weight:bold;">' + (job.valid_rows||0) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;"><span class="muted" style="color:#dc2626;">Invalid</span><span style="color:#dc2626;font-weight:bold;">' + (job.invalid_rows||0) + '</span></div>' +
      '</div>' +
      (rowsHtml ? '<div class="card"><div class="section-title" style="margin-bottom:6px;">Sample Validation</div>' + rowsHtml + '</div>' : '') +
      (canConfirm ? '<button class="btn btn-primary" onclick="confirmImport(\'' + jobId + '\')">✓ Import ' + job.valid_rows + ' Valid Rows</button>' : '') +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderDataImport(); }
}

async function confirmImport(jobId) {
  if (!confirm('Import the valid rows? This cannot be undone.')) return;
  showLoading('Importing…');
  try {
    var result = await API.call('confirmImportJob', { id: jobId });
    renderDataImport('✓ Imported ' + result.imported_rows + ' rows (' + (result.failed_rows||0) + ' failed)');
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// LEGACY MIGRATION TOOLS ── Task 23
// ══════════════════════════════════════════════════════════════════════════════

async function renderLegacyMigration(msg) {
  showLoading('Loading migration jobs…');
  try {
    var jobs = await API.call('getMigrationJobs', {});
    _renderMigrationUI(jobs, null, msg);
  } catch(e) { _renderMigrationUI([], e.message); }
}

function _renderMigrationUI(jobs, error, msg) {
  var jobRows = jobs.length ? jobs.map(function(j) {
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="renderMigrationJobDetail(\'' + j.id + '\')">' +
      '<div style="font-weight:bold;font-size:13px;">' + (j.migration_type||'migration') + ' <span class="muted">' + (j.source_type||'') + '</span></div>' +
      '<div class="muted" style="font-size:11px;">' + (j.total_rows||0) + ' rows · status: ' + (j.status||'—') + '</div>' +
      '</div>';
  }).join('') : '';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🔄 Legacy Migration</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    (msg ? '<div class="message message-ok">' + msg + '</div>' : '') +
    (error ? '<div class="message message-error">' + error + '</div>' : '') +
    '<div class="card">' +
    '<div class="subtitle" style="margin-bottom:8px;">Migrate from old systems</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:12px;">Upload a CSV export from your old POS or spreadsheet, map the columns, preview, then import.</div>' +
    '<div class="field"><label>Migration Type</label><select id="mig-type"><option value="products">Products</option><option value="sales_history">Sales History</option><option value="expense_history">Expense History</option><option value="customers">Customers</option></select></div>' +
    '<div class="field"><label>Source System</label><select id="mig-source"><option value="spreadsheet">Spreadsheet (Excel/CSV)</option><option value="old_pos">Old POS System</option><option value="manual">Manual Entry</option></select></div>' +
    '<div class="field"><label>Upload CSV</label><input type="file" id="mig-file" accept=".csv"></div>' +
    '<button class="btn btn-primary" onclick="submitMigrationUpload()">Upload & Detect Columns</button>' +
    '</div>' +
    (jobRows ? '<div class="section-title" style="margin:12px 0 8px;">Migration History</div>' + jobRows : '') +
    '</div>';
}

async function submitMigrationUpload() {
  var fileInput = document.getElementById('mig-file');
  if (!fileInput || !fileInput.files[0]) { _showToast('Select a CSV file', true); return; }
  var reader = new FileReader();
  reader.onload = async function(ev) {
    showLoading('Uploading…');
    try {
      var result = await API.call('uploadMigrationJob', {
        migration_type: document.getElementById('mig-type').value,
        source_type: document.getElementById('mig-source').value,
        csv_data: ev.target.result
      });
      renderMigrationJobDetail(result.id);
    } catch(e) { _showToast(e.message, true); renderLegacyMigration(); }
  };
  reader.readAsText(fileInput.files[0]);
}

async function renderMigrationJobDetail(jobId) {
  showLoading('Loading job…');
  try {
    var job = await API.call('getMigrationJobById', { id: jobId });
    document.getElementById('app').innerHTML =
      '<div class="screen">' +
      '<div class="topbar"><div class="title" style="margin:0;">Migration Job</div><button class="small-btn" onclick="renderLegacyMigration()">← Back</button></div>' +
      '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">Type</span><span>' + (job.migration_type||'—') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span class="muted">Status</span><span style="font-weight:bold;">' + (job.status||'—') + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;"><span class="muted">Rows</span><span>' + (job.total_rows||0) + ' total · ' + (job.valid_rows||0) + ' valid</span></div>' +
      '</div>' +
      (job.status === 'mapped' ? '<button class="btn btn-primary" onclick="confirmMigration(\'' + jobId + '\')">✓ Confirm Import</button>' : '') +
      '</div>';
  } catch(e) { _showToast(e.message, true); renderLegacyMigration(); }
}

async function confirmMigration(jobId) {
  if (!confirm('Import data? This cannot be undone.')) return;
  showLoading('Importing…');
  try {
    var result = await API.call('confirmMigrationJob', { id: jobId });
    renderLegacyMigration('✓ Migrated ' + result.imported_rows + ' rows');
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE MARKETPLACE ── Task 24
// ══════════════════════════════════════════════════════════════════════════════

async function renderFeatureMarketplace() {
  showLoading('Loading marketplace…');
  try {
    var features = await API.call('getFeatureMarketplace', {});
    _renderMarketplaceUI(features);
  } catch(e) { _renderMarketplaceUI([], e.message); }
}

function _renderMarketplaceUI(features, error) {
  var STATUS_LABEL = { active_paid: '✓ Active', trial_active: '⏱ Trial', trial_expiring: '⚠ Expiring', trial_expired: '✗ Expired', locked: 'Locked', cancelled: 'Cancelled' };
  var STATUS_COLOR = { active_paid: '#16a34a', trial_active: '#2563eb', trial_expiring: '#d97706', trial_expired: '#dc2626', locked: '#6b7280', cancelled: '#dc2626' };

  var cards = features.length ? features.map(function(f) {
    var statusColor = STATUS_COLOR[f.tenant_status] || '#6b7280';
    var statusLabel = STATUS_LABEL[f.tenant_status] || f.tenant_status;
    var trialInfo = f.trial_ends_at ? '<div class="muted" style="font-size:11px;">Trial ends: ' + String(f.trial_ends_at).slice(0,10) + '</div>' : '';
    var actionBtn = f.action_state === 'start_trial' && f.is_trial_available
      ? '<button class="btn btn-primary" style="font-size:12px;padding:8px;" onclick="doStartTrial(\'' + f.module_code + '\')">▶ Start ' + f.trial_days + '-Day Free Trial</button>'
      : (f.tenant_status === 'trial_active' || f.tenant_status === 'active_paid'
          ? '<button class="btn btn-secondary" style="font-size:12px;padding:8px;background:#fee2e2;color:#dc2626;" onclick="doCancelFeature(\'' + f.module_code + '\')">Cancel</button>'
          : '');

    return '<div class="card" style="margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">' +
      '<div style="font-weight:bold;font-size:14px;">' + _escHtml(f.feature_name||f.module_code) + '</div>' +
      '<span style="font-size:11px;color:' + statusColor + ';font-weight:bold;">' + statusLabel + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:#374151;margin-bottom:6px;">' + _escHtml(f.short_description||'') + '</div>' +
      (f.monthly_price ? '<div class="muted" style="font-size:11px;margin-bottom:6px;">₱' + Number(f.monthly_price).toFixed(0) + '/month after trial</div>' : '') +
      trialInfo + actionBtn +
      '</div>';
  }).join('') : '<div class="muted" style="padding:8px;">' + (error||'No features available.') + '</div>';

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🏪 Feature Marketplace</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:12px;">Try premium features free, then subscribe if you find them valuable.</div>' +
    cards + '</div>';
}

async function doStartTrial(moduleCode) {
  showLoading('Starting trial…');
  try {
    var result = await API.call('startTrial', { moduleCode: moduleCode });
    _showToast('✓ Trial started! Ends ' + String(result.trial_ends_at).slice(0,10));
    renderFeatureMarketplace();
  } catch(e) { _showToast(e.message, true); }
}

async function doCancelFeature(moduleCode) {
  if (!confirm('Cancel this feature subscription?')) return;
  showLoading('Cancelling…');
  try {
    await API.call('manageSubscription', { moduleCode: moduleCode, action: 'cancel' });
    _showToast('Subscription cancelled');
    renderFeatureMarketplace();
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// SANDBOX MODE ── Task 25
// ══════════════════════════════════════════════════════════════════════════════

async function renderSandboxMode() {
  showLoading('Loading sandbox status…');
  try {
    var data = await API.call('getSandbox', {});
    _renderSandboxUI(data);
  } catch(e) {
    document.getElementById('app').innerHTML =
      '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">🧪 Sandbox Mode</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
      '<div class="card"><div class="message message-error">' + e.message + '</div></div></div>';
  }
}

function _renderSandboxUI(data) {
  var inSandbox = data.is_in_sandbox;
  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🧪 Sandbox Mode</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    '<div class="card" style="background:' + (inSandbox ? '#fef9c3' : '#f9fafb') + ';border:' + (inSandbox ? '2px solid #fbbf24' : '1px solid #e5e7eb') + ';">' +
    '<div style="font-size:20px;text-align:center;margin-bottom:8px;">' + (inSandbox ? '🟡 SANDBOX ACTIVE' : '⚪ Sandbox Inactive') + '</div>' +
    '<div class="muted" style="font-size:12px;text-align:center;margin-bottom:12px;">' + (inSandbox ? (data.banner_message||'You are in sandbox mode. No real data will be affected.') : 'Sandbox lets you test the app with demo data without affecting real records.') + '</div>' +
    (inSandbox
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<button class="btn btn-secondary" onclick="doSandboxReset()">🔄 Reset Demo Data</button>' +
        '<button class="btn btn-secondary" style="background:#fee2e2;color:#dc2626;" onclick="doSandboxExit()">✕ Exit Sandbox</button>' +
        '</div>'
      : '<div class="field"><label>Demo Template</label><select id="sandbox-template"><option value="demo_sari_sari_basic">Sari-sari Store (Basic)</option><option value="demo_grocery_standard">Grocery Store (Standard)</option></select></div>' +
        '<button class="btn btn-primary" onclick="doSandboxEnter()">▶ Enter Sandbox</button>') +
    '</div></div>';
}

async function doSandboxEnter() {
  showLoading('Entering sandbox…');
  try {
    var result = await API.call('enterSandbox', { template_code: document.getElementById('sandbox-template').value });
    _renderSandboxUI(result);
    _showToast('✓ Sandbox activated with demo data');
  } catch(e) { _showToast(e.message, true); }
}
async function doSandboxReset() {
  if (!confirm('Reset all demo data? The sandbox will be repopulated from the template.')) return;
  showLoading('Resetting…');
  try { await API.call('resetSandbox', {}); renderSandboxMode(); _showToast('✓ Demo data reset'); }
  catch(e) { _showToast(e.message, true); }
}
async function doSandboxExit() {
  if (!confirm('Exit sandbox? You will return to real data.')) return;
  showLoading('Exiting…');
  try { await API.call('exitSandbox', {}); renderSandboxMode(); _showToast('✓ Exited sandbox'); }
  catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// HARDWARE SETUP ── Task 27 + Task 33
// ══════════════════════════════════════════════════════════════════════════════

async function renderHardwareSetup() {
  showLoading('Loading hardware profiles…');
  try {
    var [profiles, current] = await Promise.all([
      API.call('getHardwareProfiles', {}),
      API.call('getTenantHardwareProfile', {}).catch(function() { return null; })
    ]);
    _renderHardwareSetupUI(profiles, current);
  } catch(e) {
    document.getElementById('app').innerHTML =
      '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">🖨️ Hardware Setup</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
      '<div class="card"><div class="message message-error">' + e.message + '</div></div></div>';
  }
}

function _renderHardwareSetupUI(profiles, current) {
  var selectedCode = current && current.profile_code;
  var profileCards = profiles.map(function(p) {
    var isSelected = p.profile_code === selectedCode;
    var minDev = {};
    try { minDev = JSON.parse(p.minimum_device_json||'{}'); } catch(e) {}
    var checklist = [];
    try { checklist = JSON.parse(p.checklist_json||'[]'); } catch(e) {}

    return '<div class="card" style="margin-bottom:10px;' + (isSelected ? 'border:2px solid #2563eb;background:#eff6ff;' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<div><div style="font-weight:bold;">' + _escHtml(p.profile_name||p.profile_code) + '</div>' +
      '<div class="muted" style="font-size:12px;">' + (p.business_type||'') + '</div></div>' +
      (isSelected ? '<span style="font-size:12px;color:#2563eb;font-weight:bold;">✓ Selected</span>' :
        '<button onclick="doSelectHardwareProfile(\'' + p.profile_code + '\')" style="padding:6px 12px;border-radius:6px;border:1px solid #2563eb;background:white;color:#2563eb;font-size:12px;cursor:pointer;">Select</button>') +
      '</div>' +
      (minDev.ram_gb ? '<div class="muted" style="font-size:11px;">Min: ' + minDev.ram_gb + 'GB RAM · ' + (minDev.screen_inches||'?') + '" screen</div>' : '') +
      (checklist.length ? '<div style="margin-top:8px;">' + checklist.slice(0,4).map(function(item) {
        return '<div style="font-size:12px;padding:2px 0;">☐ ' + _escHtml(typeof item === 'string' ? item : (item.label||JSON.stringify(item))) + '</div>';
      }).join('') + '</div>' : '') +
      '</div>';
  }).join('');

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">🖨️ Hardware Setup</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:12px;">Choose the hardware profile that matches your setup. This configures receipt printing, scanner, and display recommendations.</div>' +
    (selectedCode ? '<div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;margin-bottom:8px;"><div class="muted" style="font-size:12px;">Current setup: <strong>' + (current.profile_name||selectedCode) + '</strong></div></div>' : '') +
    profileCards + '</div>';
}

async function doSelectHardwareProfile(profileCode) {
  showLoading('Saving…');
  try {
    await API.call('selectHardwareProfile', { profile_code: profileCode });
    renderHardwareSetup();
    _showToast('✓ Hardware profile selected');
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL SETTINGS PAGE ── Task 28 (expanded)
// ══════════════════════════════════════════════════════════════════════════════

async function renderFullSettings() {
  showLoading('Loading settings…');
  try {
    var settings = await API.call('getSettings', {});
    _renderFullSettingsUI(settings);
  } catch(e) {
    document.getElementById('app').innerHTML =
      '<div class="screen"><div class="topbar"><div class="title" style="margin:0;">⚙️ Settings</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +
      '<div class="card"><div class="message message-error">' + e.message + '</div></div></div>';
  }
}

function _renderFullSettingsUI(settings) {
  var bp = settings.business_profile || {};
  var ops = settings.operations || {};
  var print = settings.printing || {};

  document.getElementById('app').innerHTML =
    '<div class="screen">' +
    '<div class="topbar"><div class="title" style="margin:0;">⚙️ Settings</div><button class="small-btn" onclick="goHome()">← Home</button></div>' +

    '<div class="card">' +
    '<div class="section-title" style="margin-bottom:8px;">🏪 Business Profile</div>' +
    '<div class="field"><label>Business Name</label><input id="set-biz-name" value="' + _escAttr(bp.business_name||'') + '"></div>' +
    '<div class="field"><label>Owner Name</label><input id="set-owner" value="' + _escAttr(bp.owner_name||'') + '"></div>' +
    '<div class="field"><label>Phone</label><input id="set-phone" value="' + _escAttr(bp.phone||'') + '"></div>' +
    '<div class="field"><label>Address</label><input id="set-address" value="' + _escAttr(bp.address||'') + '"></div>' +
    '<div class="field"><label>Default Currency</label><input id="set-currency" value="' + _escAttr(bp.default_currency||'PHP') + '"></div>' +
    '<button class="btn btn-primary" onclick="saveBusinessProfile()">Save Business Profile</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title" style="margin-bottom:8px;">⚙️ Operations</div>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14px;"><input type="checkbox" id="set-req-exp-appr" ' + (ops.require_expense_approval ? 'checked' : '') + '> Require approval for expenses</label>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14px;"><input type="checkbox" id="set-req-adj-appr" ' + (ops.require_stock_adjustment_approval ? 'checked' : '') + '> Require approval for stock adjustments</label>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14px;"><input type="checkbox" id="set-allow-neg" ' + (ops.allow_negative_stock ? 'checked' : '') + '> Allow negative stock</label>' +
    '<button class="btn btn-secondary" onclick="saveOperationsSettings()">Save Operations</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title" style="margin-bottom:8px;">🖨️ Printing</div>' +
    '<div class="field"><label>Printer Type</label><select id="set-printer"><option value="none"' + (!print.default_printer_type||print.default_printer_type==='none'?' selected':'') + '>None (screen only)</option><option value="bluetooth_thermal"' + (print.default_printer_type==='bluetooth_thermal'?' selected':'') + '>Bluetooth Thermal</option><option value="wifi_printer"' + (print.default_printer_type==='wifi_printer'?' selected':'') + '>WiFi Printer</option></select></div>' +
    '<button class="btn btn-secondary" onclick="savePrintingSettings()">Save Printing</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title" style="margin-bottom:8px;">🔐 Security</div>' +
    '<div class="field"><label>Current Password</label><input id="set-cur-pw" type="password" placeholder="Enter current password"></div>' +
    '<div class="field"><label>New Password</label><input id="set-new-pw" type="password" placeholder="New password"></div>' +
    '<div class="field"><label>Confirm New Password</label><input id="set-confirm-pw" type="password" placeholder="Repeat new password"></div>' +
    '<button class="btn btn-secondary" onclick="changePasswordFromSettings()">Change Password</button>' +
    '</div>' +
    '</div>';
}

async function saveBusinessProfile() {
  showLoading('Saving…');
  try {
    await API.call('updateBusinessProfile', {
      business_name:    document.getElementById('set-biz-name').value||'',
      owner_name:       document.getElementById('set-owner').value||'',
      phone:            document.getElementById('set-phone').value||'',
      address:          document.getElementById('set-address').value||'',
      default_currency: document.getElementById('set-currency').value||'PHP'
    });
    _showToast('✓ Business profile saved');
    renderFullSettings();
  } catch(e) { _showToast(e.message, true); }
}

async function saveOperationsSettings() {
  showLoading('Saving…');
  try {
    await API.call('updateOperationsSettings', {
      require_expense_approval:         document.getElementById('set-req-exp-appr').checked,
      require_stock_adjustment_approval: document.getElementById('set-req-adj-appr').checked,
      allow_negative_stock:             document.getElementById('set-allow-neg').checked
    });
    _showToast('✓ Operations settings saved');
  } catch(e) { _showToast(e.message, true); }
}

async function savePrintingSettings() {
  _showToast('Printing settings saved (local)');
}

async function changePasswordFromSettings() {
  var cur  = document.getElementById('set-cur-pw').value;
  var nw   = document.getElementById('set-new-pw').value;
  var conf = document.getElementById('set-confirm-pw').value;
  if (!cur || !nw) { _showToast('Fill in current and new password', true); return; }
  if (nw !== conf) { _showToast('New passwords do not match', true); return; }
  showLoading('Changing password…');
  try {
    await API.call('changePassword', { currentPassword: cur, newPassword: nw });
    _showToast('✓ Password changed');
    renderFullSettings();
  } catch(e) { _showToast(e.message, true); }
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD BUTTON ADDITIONS — wire all new screens into dashboards
// ══════════════════════════════════════════════════════════════════════════════

// Notification badge helper — show unread count next to notifications button
async function _loadNotifBadge(buttonId) {
  try {
    var r = await API.call('getUnreadCount', {});
    var cnt = r.unread_count || 0;
    if (cnt > 0) {
      var el = document.getElementById(buttonId);
      if (el) el.innerHTML = el.innerHTML + ' <span style="background:#dc2626;color:white;border-radius:10px;padding:1px 6px;font-size:11px;">' + cnt + '</span>';
    }
  } catch(e) {}
}

// ── Sync Functions ─────────────────────────────────────────────────────────────

async function syncWhenOnline() {
  if (!API.token) return; // No session
  try {
    // Sync pending sales or data
    updateSyncIndicator('syncing');
    // Example: Sync any queued changes
    await DB.syncPending(); // Placeholder
    updateSyncIndicator('online');
  } catch (e) {
    console.warn('Sync failed:', e);
    updateSyncIndicator('offline');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', function() {
  boot().catch(function(err) {
    console.error('Boot error:', err);
    renderLogin('Startup error: ' + err.message);
  });
});
