// admin.js — HubSuite Admin Panel

var adminState = {
  admin: null,
  stores: [],
  platformSettings: {},
  featureCatalog: []
};

var HUB = window.HUBSUITE || null;

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener('load', function() { adminBoot(); });

async function adminBoot() {
  if (ADMIN_API.token) {
    try {
      var dash = await ADMIN_API.call('adminGetDashboardData');
      adminState.stores           = dash.stores           || [];
      adminState.platformSettings = dash.platformSettings || {};
      adminState.featureCatalog   = dash.featureCatalog   || [];
      if (adminState.platformSettings.NAME) localStorage.setItem('admin_platform_name', adminState.platformSettings.NAME);
      renderDashboard();
      return;
    } catch(e) {
      ADMIN_API.clearToken();
    }
  }
  renderAdminLogin();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _app(html) { document.getElementById('app').innerHTML = html; }

function _toast(msg, isErr) {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 20px;' +
    'border-radius:20px;font-weight:bold;z-index:9999;white-space:nowrap;font-size:14px;' +
    'box-shadow:0 4px 12px rgba(0,0,0,.25);' +
    (isErr ? 'background:#dc2626;color:#fff;' : 'background:#16a34a;color:#fff;');
  t.textContent = (isErr ? '⚠ ' : '✓ ') + msg;
  document.body.appendChild(t);
  setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
}

function _money(v) {
  return '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function _normalizePlanId(planId) {
  if (HUB && HUB.normalizePlanId) return HUB.normalizePlanId(planId);
  return String(planId || 'TRIAL').toUpperCase();
}

function _planLabel(planId) {
  if (HUB && HUB.getPlanLabel) return HUB.getPlanLabel(planId);
  return _normalizePlanId(planId);
}

function _planTier(planId) {
  if (HUB && HUB.getTier) return HUB.getTier(planId);
  return { id: _normalizePlanId(planId), name: _planLabel(planId), basePrice: 0, addOnPrice: null };
}

function _planOptions(includeCustom) {
  if (HUB && HUB.getPlanOptions) return HUB.getPlanOptions(includeCustom);
  var options = [{ value: 'TRIAL', label: 'Free Trial' }];
  if (includeCustom) options.push({ value: 'CUSTOM', label: 'Custom / Flexible' });
  return options;
}

function _hubPlanOptions(currentPlan) {
  var options = [
    { value: 'NEGOSYO_HUB', label: 'Negosyo Hub - ₱200/mo (Basic)' },
    { value: 'BUSINESS_HUB', label: 'Business Hub - ₱500/mo (Mid)' },
    { value: 'NEXORA_HUB', label: 'Nexora Hub - ₱1000/mo (High)' }
  ];
  var normalizedCurrent = _normalizePlanId(currentPlan || '');
  if (normalizedCurrent && !options.some(function(opt) { return opt.value === normalizedCurrent; })) {
    options.unshift({ value: normalizedCurrent, label: _planLabel(normalizedCurrent) });
  }
  return options;
}

function _planDefs() {
  return {
    TRIAL: { max_users: 2, max_products: 50, reports: 'DAILY', health: false, fee: 0 },
    NEGOSYO_HUB: { max_users: 3, max_products: 500, reports: 'DAILY', health: false, fee: 200 },
    BUSINESS_HUB: { max_users: 10, max_products: 5000, reports: 'ALL', health: true, fee: 500 },
    NEXORA_HUB: { max_users: -1, max_products: -1, reports: 'ALL', health: true, fee: 1000 }
  };
}

function _planLogoHtml(planId) {
  if (HUB && HUB.logoMarkup) return HUB.logoMarkup(planId, _planLabel(planId));
  return '<strong>' + _esc(_planLabel(planId)) + '</strong>';
}

function _addOnPriceForPlan(planId) {
  if (HUB && HUB.getAddOnPrice) return HUB.getAddOnPrice(planId);
  return null;
}

function _featureCatalog() {
  return Array.isArray(adminState.featureCatalog) ? adminState.featureCatalog : [];
}

async function _ensureFeatureCatalog() {
  if (_featureCatalog().length) return adminState.featureCatalog;
  adminState.featureCatalog = await ADMIN_API.call('adminGetFeatureCatalog');
  return adminState.featureCatalog;
}

function _selectedModulesFromForm(containerId) {
  var root = document.getElementById(containerId);
  if (!root) return [];
  return Array.prototype.slice.call(root.querySelectorAll('input[type=checkbox][data-module-code]:checked')).map(function(el) {
    return el.getAttribute('data-module-code');
  });
}

function _renderAddOnSelector(containerId, planId, selectedModuleCodes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var addOnPrice = _addOnPriceForPlan(planId);
  var selectedMap = {};
  (selectedModuleCodes || []).forEach(function(code) { selectedMap[String(code)] = true; });

  container.innerHTML =
    '<div class="section-title">Initial Add-ons</div>' +
    '<div class="hint" style="margin-bottom:10px;">Every new Hub starts with a 30-day trial. These add-ons are prepared now and can also be managed later from the owner dashboard.</div>' +
    _featureCatalog().map(function(feature) {
      var code = feature.module_code;
      return '<label style="display:block;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
        '<input type="checkbox" data-module-code="' + _esc(code) + '"' + (selectedMap[code] ? ' checked' : '') + ' style="margin-top:3px;">' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;font-weight:700;color:#111827;">' + _esc(feature.feature_name || code) + '</div>' +
        '<div class="muted" style="font-size:12px;">' + _esc(feature.short_description || '') + '</div>' +
        '<div class="hint">After trial: ' + (addOnPrice !== null ? ('₱' + addOnPrice + '/month') : 'plan-based pricing') + '</div>' +
        '</div>' +
        '</div>' +
        '</label>';
    }).join('') +
    (_featureCatalog().length ? '' : '<div class="muted">No add-ons available yet.</div>');
}

async function _loadStoreCommercialState(storeId, planId) {
  var host = document.getElementById('store-commercial-state');
  if (!host) return;
  host.innerHTML = '<div class="card"><div class="muted">Loading add-ons...</div></div>';
  try {
    var data = await ADMIN_API.call('adminGetStoreCommercialState', { storeId: storeId });
    if (data.featureCatalog && data.featureCatalog.length) adminState.featureCatalog = data.featureCatalog;
    var subs = data.subscriptions || [];
    var revenue = data.revenueState;
    var addOnPrice = _addOnPriceForPlan(planId);
    var rows = subs.map(function(sub) {
      var label = sub.status === 'active_paid' ? 'Active' : (sub.status === 'trial_active' ? 'Trial' : sub.status);
      var when = sub.trial_ends_at ? ('Trial until ' + String(sub.trial_ends_at).slice(0, 10)) : ('Recurring ' + _money(sub.monthly_price || 0));
      return '<div style="padding:10px 0;border-bottom:1px solid #f3f4f6;">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;">' +
        '<div><div style="font-size:13px;font-weight:700;">' + _esc(sub.feature_name || sub.module_code) + '</div>' +
        '<div class="muted" style="font-size:12px;">' + _esc(sub.short_description || '') + '</div></div>' +
        '<div style="text-align:right;font-size:12px;"><strong>' + _esc(label) + '</strong><div class="muted">' + _esc(when) + '</div></div>' +
        '</div>' +
        '</div>';
    }).join('');
    host.innerHTML =
      '<div class="card">' +
      '<div class="section-title">Add-ons</div>' +
      '<div class="hint" style="margin-bottom:10px;">Owner-selected add-ons from the marketplace will show here automatically.' +
      (addOnPrice !== null ? ' Current Hub add-ons are ₱' + addOnPrice + '/month each after trial.' : '') +
      '</div>' +
      (revenue ? '<div style="background:#f9fafb;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;">Base: <strong>' + _money(revenue.base_recurring_amount || 0) + '</strong> · Add-ons: <strong>' + _money(revenue.addons_recurring_amount || 0) + '</strong> · Total: <strong>' + _money(revenue.total_recurring_amount || 0) + '</strong></div>' : '') +
      (rows || '<div class="muted">No add-ons selected yet.</div>') +
      '</div>';
  } catch(e) {
    host.innerHTML = '<div class="card"><div class="msg-err">Failed to load add-ons: ' + _esc(e.message) + '</div></div>';
  }
}

function _storePwaUrl(apiKey) {
  try {
    var url = new URL('./', window.location.href);
    url.search = '';
    url.hash = '';
    if (apiKey) url.searchParams.set('k', apiKey);
    return url.toString();
  } catch(e) {
    return './?k=' + encodeURIComponent(apiKey || '');
  }
}

function _storeStatus(store) {
  var now     = new Date();
  var trial   = store.Trial_End            ? new Date(String(store.Trial_End))            : null;
  var expires = store.Subscription_Expires ? new Date(String(store.Subscription_Expires)) : null;
  if (String(store.Status).toUpperCase() === 'SUSPENDED') return 'SUSPENDED';
  if (trial   && now <= trial)   return 'TRIAL';
  if (expires && now <= expires) return 'ACTIVE';
  return 'EXPIRED';
}

function _badgeHtml(status) {
  var map = {
    TRIAL:     '<span class="badge badge-trial">FREE TRIAL</span>',
    ACTIVE:    '<span class="badge badge-active">ACTIVE</span>',
    EXPIRED:   '<span class="badge badge-expired">EXPIRED</span>',
    SUSPENDED: '<span class="badge badge-suspended">SUSPENDED</span>'
  };
  return map[status] || '<span class="badge">' + status + '</span>';
}

function _topbar(title, backFn) {
  return '<div class="topbar"><div class="title">' + title + '</div>' +
    (backFn ? '<button class="small-btn" onclick="' + backFn + '">← Back</button>' : '') +
    '</div>';
}

// ── Login ─────────────────────────────────────────────────────────────────────

function renderAdminLogin(msg) {
  _app('<div class="screen">' +
    '<div style="text-align:center;padding:32px 0 20px;">' +
    '<div style="margin-bottom:10px;">' + _planLogoHtml('NEGOSYO_HUB') + '</div>' +
    '<h2 style="color:#1e3a5f;margin-top:8px;">' + (localStorage.getItem('admin_platform_name') || 'HubSuite') + '</h2>' +
    '<div class="muted">HubSuite Admin Panel</div></div>' +
    '<div class="card">' +
    (msg ? '<div class="msg-err">' + msg + '</div>' : '') +
    '<div class="field"><label>Username</label><input id="a-user" placeholder="Admin username"></div>' +
    '<div class="field"><label>Password</label><input id="a-pass" type="password" placeholder="Password"></div>' +
    '<button class="btn btn-primary" onclick="submitAdminLogin()">Login</button>' +
    '</div></div>');
  document.getElementById('a-pass').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') submitAdminLogin();
  });
}

async function submitAdminLogin() {
  var username = (document.getElementById('a-user').value || '').trim();
  var password = document.getElementById('a-pass').value;
  if (!username || !password) { _toast('Enter username and password', true); return; }
  _app('<div style="text-align:center;padding:80px 20px;color:#6b7280;">Logging in…</div>');
  try {
    var result = await ADMIN_API.call('adminLogin', { username: username, password: password });
    ADMIN_API.setToken(result.token);
    adminState.admin            = result.admin;
    adminState.stores           = result.stores           || [];
    adminState.platformSettings = result.platformSettings || {};
    adminState.featureCatalog   = result.featureCatalog   || [];
    if (adminState.platformSettings.NAME) localStorage.setItem('admin_platform_name', adminState.platformSettings.NAME);
    renderDashboard();
  } catch(e) {
    renderAdminLogin(e.message);
  }
}

function adminLogout() {
  // Instant — no network wait
  ADMIN_API.clearToken();
  adminState.admin  = null;
  adminState.stores = [];
  renderAdminLogin();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard() {
  var stores   = adminState.stores;
  var statuses = stores.map(_storeStatus);
  var counts   = {
    total:     stores.length,
    trial:     statuses.filter(function(s) { return s === 'TRIAL'; }).length,
    active:    statuses.filter(function(s) { return s === 'ACTIVE'; }).length,
    expired:   statuses.filter(function(s) { return s === 'EXPIRED'; }).length,
    suspended: statuses.filter(function(s) { return s === 'SUSPENDED'; }).length
  };
  var mrr = stores.reduce(function(sum, st) {
    return sum + (Number(st.Monthly_Fee) || 0);
  }, 0);

  var storeRows = stores.map(function(st, i) {
    var status = _storeStatus(st);
    var sub = st.Trial_End && status === 'TRIAL'
      ? 'Trial ends ' + String(st.Trial_End).substring(0, 10)
      : st.Subscription_Expires
        ? 'Expires ' + String(st.Subscription_Expires).substring(0, 10)
        : 'No subscription set';
    return '<div class="store-row" onclick="renderStoreDetail(' + i + ')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-size:14px;font-weight:bold;">' + st.Store_Name + '</div>' +
        '<div class="muted" style="font-size:12px;">' + (st.Owner_Name || 'No owner') + ' · ' + _esc(_planLabel(st.Plan || '')) + ' · ' + sub + '</div></div>' +
      _badgeHtml(status) + '</div></div>';
  }).join('');

  _app('<div class="screen">' +
    _topbar('HubSuite Admin') +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">' +
    '<button class="btn-sm btn-primary btn" style="width:auto;" onclick="adminLogout()">Logout</button></div>' +

    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="val">' + counts.total + '</div><div class="lbl">Total Stores</div></div>' +
    '<div class="stat-card"><div class="val" style="color:#1d4ed8;">' + counts.trial + '</div><div class="lbl">Free Trial</div></div>' +
    '<div class="stat-card"><div class="val" style="color:#16a34a;">' + counts.active + '</div><div class="lbl">Active</div></div>' +
    '<div class="stat-card"><div class="val" style="color:#dc2626;">' + counts.expired + '</div><div class="lbl">Expired</div></div>' +
    '</div>' +

    '<div class="card" style="text-align:center;margin-bottom:12px;">' +
    '<div class="muted" style="font-size:12px;">Monthly Recurring Revenue</div>' +
    '<div style="font-size:24px;font-weight:bold;color:#16a34a;">' + _money(mrr) + '</div>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
    '<button class="btn btn-primary" style="margin:0;" onclick="renderCreateStore()">+ New Store</button>' +
    '<button class="btn btn-secondary" style="margin:0;" onclick="renderPlatformSettings()">⚙️ Settings</button>' +
    '<button class="btn btn-secondary" style="margin:0;" onclick="renderHealthMonitor()">🏥 Health Monitor</button>' +
    '<button class="btn btn-secondary" style="margin:0;position:relative;" id="msg-btn" onclick="renderMessagesInbox()">📬 Messages</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">All Stores</div>' +
    (storeRows || '<div class="muted">No stores yet. Create one above.</div>') +
    '</div></div>');
}

// ── Store Detail ──────────────────────────────────────────────────────────────

function renderStoreDetail(idx) {
  var st     = adminState.stores[idx];
  var status = _storeStatus(st);
  var plan   = _normalizePlanId(st.Plan || '');
  var pwaDomain = _storePwaUrl(st.API_Key);

  _app('<div class="screen">' +
    _topbar('Store Detail', 'renderDashboard()') +

    '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
    '<div><div style="font-size:16px;font-weight:bold;">' + st.Store_Name + '</div>' +
      '<div class="muted">' + (st.Owner_Name || '') + '</div></div>' +
    _badgeHtml(status) + '</div>' +

    '<div style="font-size:13px;line-height:2;">' +
    '<div>📧 ' + (st.Owner_Email || '—') + '</div>' +
    '<div>📱 ' + (st.Owner_Phone || '—') + '</div>' +
    '<div>📋 Plan: <strong>' + _esc(_planLabel(plan)) + '</strong> · ' + _money(st.Monthly_Fee) + '/mo</div>' +
    (status === 'TRIAL' ? '<div>🎁 Trial ends: <strong>' + (String(st.Trial_End || '').substring(0, 10) || '—') + '</strong></div>' : '') +
    '<div>📅 Expires: <strong>' + (String(st.Subscription_Expires || '').substring(0, 10) || '—') + '</strong></div>' +
    '</div>' +

    '<div style="margin-top:12px;background:#f9fafb;border-radius:8px;padding:10px;">' +
    '<div style="font-size:11px;font-weight:bold;color:#6b7280;margin-bottom:4px;">PWA Link (share with store owner)</div>' +
    '<div style="font-size:12px;word-break:break-all;color:#1d4ed8;">' + pwaDomain + '</div>' +
    '<div style="font-size:11px;font-weight:bold;color:#6b7280;margin-top:6px;margin-bottom:2px;">API Key</div>' +
    '<div style="font-size:12px;color:#374151;word-break:break-all;">' + st.API_Key + '</div>' +
    '<div style="font-size:11px;font-weight:bold;color:#6b7280;margin-top:6px;margin-bottom:2px;">Database Provider</div>' +
    '<div style="font-size:12px;color:#374151;">' + _esc(String(st.DB_Provider || 'libsql').toUpperCase()) +
      (st.D1_Binding ? ' · ' + _esc(st.D1_Binding) : '') + '</div>' +
    '</div></div>' +

    // ── Extend trial ──
    '<div class="card">' +
    '<div class="section-title">🎁 Extend Trial</div>' +
    '<div class="field"><label>Extra days</label>' +
    '<input id="ext-days" type="number" min="1" value="30" placeholder="30"></div>' +
    '<button class="btn btn-secondary" onclick="_extendTrial(\'' + st.Store_ID + '\')">Extend Trial</button>' +
    '</div>' +

    // ── Record payment ──
    '<div class="card">' +
    '<div class="section-title">💳 Record Payment</div>' +
    '<div class="field"><label>Months paid</label>' +
    '<input id="pay-months" type="number" min="1" value="1"></div>' +
    '<div class="field"><label>Amount (₱)</label>' +
    '<input id="pay-amount" type="number" min="0" value="' + (st.Monthly_Fee || 0) + '"></div>' +
    '<div class="field"><label>GCash Reference #</label>' +
    '<input id="pay-ref" placeholder="e.g. 1234567890"></div>' +
    '<div class="field"><label>Notes</label>' +
    '<input id="pay-notes" placeholder="Optional notes"></div>' +
    '<button class="btn btn-success" onclick="_recordPayment(\'' + st.Store_ID + '\')">Confirm Payment</button>' +
    '</div>' +

    // ── Change plan ──
    '<div class="card">' +
    '<div class="section-title">📋 Change Plan</div>' +
    '<div class="field"><label>Hub Plan</label>' +
    '<select id="chg-plan">' +
    _hubPlanOptions(plan).map(function(opt) {
      return '<option value="' + opt.value + '"' + (opt.value === plan ? ' selected' : '') + '>' + _esc(opt.label) + '</option>';
    }).join('') +
    '</select></div>' +
    '<div class="hint" style="margin-bottom:8px;">All new and reassigned Hub plans are paired with add-ons separately. Owners can later add more modules from their dashboard.</div>' +
    '<button class="btn btn-primary" style="margin-top:8px;" onclick="_changePlan(\'' + st.Store_ID + '\')">Save Plan</button>' +
    '</div>' +

    '<div id="store-commercial-state"></div>' +

    // ── Suspend / Activate ──
    '<div class="card">' +
    '<div class="section-title">⚡ Store Status</div>' +
    (status === 'SUSPENDED'
      ? '<button class="btn btn-success" onclick="_toggleStatus(\'' + st.Store_ID + '\',\'ACTIVE\')">✅ Activate Store</button>'
      : '<button class="btn btn-danger"  onclick="_toggleStatus(\'' + st.Store_ID + '\',\'SUSPENDED\')">🚫 Suspend Store</button>') +
    '</div>' +

    // ── DB Migration ──
    '<div class="card">' +
    '<div class="section-title">🔧 Database Migration</div>' +
    '<p style="font-size:12px;color:#6b7280;margin-bottom:8px;">Run this once to create missing tables (branch_transfers, purchase_orders, stock_receiving, branches) and add missing supplier columns.</p>' +
    '<button class="btn btn-secondary" onclick="_migrateStore(\'' + st.Store_ID + '\')">Run Migration</button>' +
    '<div class="field" style="margin-top:12px;"><label>Dedicated D1 Binding</label><input id="d1-binding" placeholder="e.g. STORE_DB_DEMO" value="' + _esc(st.D1_Binding || '') + '"></div>' +
    '<div class="field"><label><input type="checkbox" id="d1-activate"> Activate dedicated DB after successful copy</label></div>' +
    '<button class="btn btn-primary" onclick="_copyStoreToDedicatedDb(\'' + st.Store_ID + '\')">Copy To Dedicated D1</button>' +
    '<div class="hint">Use one D1 binding per store if you want strict database isolation.</div>' +
    '</div></div>');
  _loadStoreCommercialState(st.Store_ID, plan);
}

function _onChangePlan() {
  return;
}

async function _computeSuggestedPrice() {
  var users   = Number(document.getElementById('chg-users').value)    || 2;
  var products= Number(document.getElementById('chg-products').value) || 100;
  var reports = document.getElementById('chg-reports').value;
  var health  = document.getElementById('chg-health').checked;
  try {
    var result = await ADMIN_API.call('adminSuggestPrice',
      { maxUsers: users, maxProducts: products, reportsLevel: reports, hasHealthIndicators: health });
    document.getElementById('chg-suggested').textContent =
      'Suggested price: ₱' + result.suggestedPrice + '/mo';
  } catch(e) { _toast(e.message, true); }
}

async function _extendTrial(storeId) {
  var days = Number(document.getElementById('ext-days').value) || 30;
  try {
    var r = await ADMIN_API.call('adminExtendTrial', { storeId: storeId, extraDays: days });
    _toast('Trial extended to ' + r.newTrialEnd);
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message, true); }
}

async function _recordPayment(storeId) {
  var months = Number(document.getElementById('pay-months').value) || 1;
  var amount = Number(document.getElementById('pay-amount').value) || 0;
  var ref    = (document.getElementById('pay-ref').value   || '').trim();
  var notes  = (document.getElementById('pay-notes').value || '').trim();
  try {
    var r = await ADMIN_API.call('adminRecordPayment',
      { storeId: storeId, amount: amount, gcashRef: ref, monthsPaid: months, notes: notes });
    _toast('Payment recorded. New expiry: ' + r.newExpiry);
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message, true); }
}

async function _changePlan(storeId) {
  var plan = document.getElementById('chg-plan').value;
  var patch = { Plan: plan };
  if (plan === 'CUSTOM') {
    patch.Max_Users             = document.getElementById('chg-users').value;
    patch.Max_Products          = document.getElementById('chg-products').value;
    patch.Reports_Level         = document.getElementById('chg-reports').value;
    patch.Has_Health_Indicators = String(document.getElementById('chg-health').checked);
    patch.Monthly_Fee           = document.getElementById('chg-fee').value;
  } else {
    var planDefs = _planDefs();
    var def = planDefs[plan];
    if (def) {
      patch.Max_Users             = def.max_users;
      patch.Max_Products          = def.max_products;
      patch.Reports_Level         = def.reports;
      patch.Has_Health_Indicators = String(def.health);
      patch.Monthly_Fee           = def.fee;
    }
  }
  try {
    await ADMIN_API.call('adminUpdateStore', { storeId: storeId, patch: patch });
    _toast('Plan updated to ' + _planLabel(plan));
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message, true); }
}

async function _toggleStatus(storeId, newStatus) {
  var action = newStatus === 'SUSPENDED' ? 'adminSuspendStore' : 'adminActivateStore';
  try {
    await ADMIN_API.call(action, { storeId: storeId });
    _toast('Store ' + newStatus.toLowerCase());
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message, true); }
}

async function _migrateStore(storeId) {
  if (!confirm('Run DB migration for this store? Safe to run multiple times.')) return;
  try {
    var res = await ADMIN_API.call('adminMigrateStore', { storeId: storeId });
    var ok  = (res.results || []).filter(function(r) { return r.ok; }).length;
    var fail = (res.results || []).filter(function(r) { return !r.ok; }).length;
    _toast('Migration done: ' + ok + ' ok, ' + fail + ' skipped/already existed');
  } catch(e) { _toast('Migration failed: ' + e.message, true); }
}

async function _copyStoreToDedicatedDb(storeId) {
  var d1Binding = (document.getElementById('d1-binding').value || '').trim();
  var activate  = !!document.getElementById('d1-activate').checked;
  if (!d1Binding) { _toast('Enter a D1 binding name first', true); return; }
  if (!confirm('Copy this store into dedicated D1 binding "' + d1Binding + '"?' + (activate ? ' This will also activate the new database for this store.' : ''))) return;
  try {
    var res = await ADMIN_API.call('adminCopyStoreToDedicatedDb', {
      storeId: storeId,
      d1Binding: d1Binding,
      activate: activate
    });
    _toast('Copied ' + res.totalCopiedRows + ' rows into ' + d1Binding + (res.activated ? ' and activated it' : ''));
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast('Dedicated DB copy failed: ' + e.message, true); }
}

async function _refreshStores() {
  try { adminState.stores = await ADMIN_API.call('adminGetStores'); } catch(e) {}
}

// ── Create Store ──────────────────────────────────────────────────────────────

function renderCreateStore(msg) {
  _app('<div class="screen">' +
    _topbar('➕ Create New Store', 'renderDashboard()') +

    (msg ? '<div class="' + (msg.ok ? 'msg-ok' : 'msg-err') + '">' + msg.text + '</div>' : '') +

    '<div class="card">' +
    '<div class="section-title">Store Info</div>' +
    '<div class="field"><label>Store Name *</label><input id="cs-name" placeholder="e.g. Aling Nena\'s Store"></div>' +
    '<div class="field"><label>Owner Name</label><input id="cs-owner" placeholder="Full name"></div>' +
    '<div class="field"><label>Owner Email</label><input id="cs-email" type="email" placeholder="email@example.com"></div>' +
    '<div class="field"><label>Owner Phone</label><input id="cs-phone" placeholder="09xxxxxxxxx"></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">Subscription Plan</div>' +
    '<div class="field"><label>Plan</label>' +
    '<select id="cs-plan" onchange="_onCreatePlanChange()">' +
    '<option value="TRIAL" selected>Free Trial</option>' +
    _planOptions(true).map(function(opt) {
      return '<option value="' + opt.value + '"' + (opt.value === 'TRIAL' ? ' selected' : '') + '>' + _esc(opt.label) + '</option>';
    }).join('') +
    '</select></div>' +
    '<div class="field"><label>Trial Days</label>' +
    '<input id="cs-trial" type="number" min="0" value="30">' +
    '<div class="hint">Trial stores can explore HubSuite before moving into a paid Hub tier.</div></div>' +
    '</div>' +

    '<div class="card" id="cs-custom-card" style="display:none;">' +
    '<div class="section-title">Custom Plan Settings</div>' +
    '<div class="field"><label>Max Users (-1 = unlimited)</label><input id="cs-users" type="number" value="2"></div>' +
    '<div class="field"><label>Max Products (-1 = unlimited)</label><input id="cs-products" type="number" value="100"></div>' +
    '<div class="field"><label>Reports</label><select id="cs-reports">' +
    '<option value="DAILY">Daily only</option><option value="ALL">All reports</option></select></div>' +
    '<div class="field"><label><input type="checkbox" id="cs-health"> Health Indicators</label></div>' +
    '<div class="field"><label>Monthly Fee (₱)</label><input id="cs-fee" type="number" value="0"></div>' +
    '<div id="cs-suggested" class="hint" style="margin-bottom:8px;"></div>' +
    '<button class="btn btn-secondary" onclick="_computeCreateSuggest()">💡 Suggest Price</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="field"><label>Notes (internal only)</label>' +
    '<textarea id="cs-notes" placeholder="Any notes about this store…"></textarea></div>' +
    '<button class="btn btn-primary" onclick="submitCreateStore()">🚀 Provision Store</button>' +
    '</div></div>');
}

function _onCreatePlanChange() {
  var plan = document.getElementById('cs-plan').value;
  _renderAddOnSelector('cs-addons-card', plan, _selectedModulesFromForm('cs-addons-card'));
}

async function _computeCreateSuggest() {
  var users    = Number(document.getElementById('cs-users').value)    || 2;
  var products = Number(document.getElementById('cs-products').value) || 100;
  var reports  = document.getElementById('cs-reports').value;
  var health   = document.getElementById('cs-health').checked;
  try {
    var r = await ADMIN_API.call('adminSuggestPrice',
      { maxUsers: users, maxProducts: products, reportsLevel: reports, hasHealthIndicators: health });
    document.getElementById('cs-suggested').textContent = 'Suggested: ₱' + r.suggestedPrice + '/mo';
  } catch(e) { _toast(e.message, true); }
}

async function submitCreateStore() {
  var name  = (document.getElementById('cs-name').value  || '').trim();
  if (!name) { _toast('Store name is required', true); return; }
  var plan  = document.getElementById('cs-plan').value;
  var data  = {
    storeName:  name,
    ownerName:  (document.getElementById('cs-owner').value  || '').trim(),
    ownerEmail: (document.getElementById('cs-email').value  || '').trim(),
    ownerPhone: (document.getElementById('cs-phone').value  || '').trim(),
    plan:       plan,
    trialDays:  Number(document.getElementById('cs-trial').value) || 0,
    notes:      (document.getElementById('cs-notes').value  || '').trim()
  };
  if (plan === 'CUSTOM') {
    data.maxUsers             = Number(document.getElementById('cs-users').value)    || 2;
    data.maxProducts          = Number(document.getElementById('cs-products').value) || 100;
    data.reportsLevel         = document.getElementById('cs-reports').value;
    data.hasHealthIndicators  = document.getElementById('cs-health').checked;
    data.monthlyFee           = Number(document.getElementById('cs-fee').value) || 0;
  }

  _app('<div style="text-align:center;padding:80px 20px;color:#6b7280;">Provisioning store…<br><small>This may take 10-30 seconds.</small></div>');

  try {
    var result = await ADMIN_API.call('adminProvisionStore', data);
    adminState.stores = await ADMIN_API.call('adminGetStores');
    renderProvisionSuccess(result);
  } catch(e) {
    renderCreateStore({ ok: false, text: 'Error: ' + e.message });
  }
}

function renderProvisionSuccess(r) {
  var pwaUrl = _storePwaUrl(r.apiKey);
  _app('<div class="screen">' +
    _topbar('✅ Store Created!', 'renderDashboard()') +
    '<div class="card" style="text-align:center;">' +
    '<div style="font-size:48px;margin-bottom:8px;">🎉</div>' +
    '<h3 style="margin-bottom:4px;">' + _esc(r.storeName) + '</h3>' +
    '<div class="muted" style="margin-bottom:16px;">Store provisioned successfully</div>' +

    '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin-bottom:12px;text-align:left;">' +
    '<div style="font-size:12px;font-weight:bold;color:#15803d;margin-bottom:8px;">📱 PWA Link — send this to the store owner</div>' +
    '<div style="font-size:13px;word-break:break-all;color:#1d4ed8;margin-bottom:0;">' + pwaUrl + '</div>' +
    '</div>' +

    '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px;margin-bottom:12px;text-align:left;">' +
    '<div style="font-size:12px;font-weight:bold;color:#854d0e;margin-bottom:8px;">🔐 Default Login Credentials</div>' +
    '<div style="font-size:13px;line-height:2.2;">' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #fde047;">' +
    '<span>Username</span><strong style="font-family:monospace;font-size:15px;">' + _esc(r.ownerUsername || 'owner') + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;">' +
    '<span>Password</span><strong style="font-family:monospace;font-size:15px;">' + _esc(r.ownerPassword || '1234') + '</strong></div>' +
    '</div>' +
    '<div style="font-size:11px;color:#92400e;margin-top:8px;">⚠ Remind the owner to change their password after first login.</div>' +
    '</div>' +

    '<div style="background:#f9fafb;border-radius:8px;padding:12px;text-align:left;">' +
    '<div style="font-size:12px;line-height:2;color:#374151;">' +
    '<div>🎁 Trial ends: <strong>' + r.trialEnd + '</strong></div>' +
    '<div>📋 Plan: <strong>' + r.plan + '</strong></div>' +
    (r.monthlyFee ? '<div>💰 Monthly fee: <strong>' + _money(r.monthlyFee) + '</strong></div>' : '') +
    '<div>🔑 API Key: <span style="word-break:break-all;font-size:11px;">' + r.apiKey + '</span></div>' +
    '</div></div>' +
    '</div>' +

    '<button class="btn btn-primary" onclick="renderDashboard()">Back to Dashboard</button>' +
    '</div>');
}

// ── Platform Settings ─────────────────────────────────────────────────────────

function renderPlatformSettings(msg) {
  var s = adminState.platformSettings || {};
  _app('<div class="screen">' +
    _topbar('⚙️ Platform Settings', 'renderDashboard()') +
    (msg ? '<div class="' + (msg.ok ? 'msg-ok' : 'msg-err') + '">' + msg.text + '</div>' : '') +

    '<div class="card">' +
    '<div class="section-title">Platform Identity</div>' +
    '<div class="field"><label>Platform Name</label>' +
    '<input id="ps-name" value="' + (s.NAME || 'HubSuite') + '"></div>' +
    '<div class="field"><label>Admin Email</label>' +
    '<input id="ps-email" type="email" value="' + (s.ADMIN_EMAIL || '') + '"></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">GCash Billing (shown on payment wall)</div>' +
    '<div class="field"><label>GCash Number</label>' +
    '<input id="ps-gcash-num" placeholder="09xxxxxxxxx" value="' + (s.GCASH_NUMBER || '') + '"></div>' +
    '<div class="field"><label>GCash Account Name</label>' +
    '<input id="ps-gcash-name" placeholder="Name on GCash" value="' + (s.GCASH_NAME || '') + '"></div>' +
    '<div class="field"><label>GCash QR Image URL</label>' +
    '<input id="ps-gcash-qr" placeholder="https://… (upload to Drive/Imgur first)" value="' + (s.GCASH_QR_URL || '') + '">' +
    '<div class="hint">Upload your GCash QR image to Google Drive (set to public link) or Imgur, then paste the URL here.</div></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">Trial Settings</div>' +
    '<div class="field"><label>Default Trial Days for new stores</label>' +
    '<input id="ps-trial" type="number" min="1" value="' + (s.TRIAL_DAYS || 30) + '"></div>' +
    '</div>' +

    '<button class="btn btn-primary" onclick="savePlatformSettings()">💾 Save Settings</button>' +

    '<div class="card" style="margin-top:12px;">' +
    '<div class="section-title">Change Admin Password</div>' +
    '<div class="field"><label>New Password</label><input id="ps-pw" type="password" placeholder="New password"></div>' +
    '<div class="field"><label>Confirm Password</label><input id="ps-pw2" type="password" placeholder="Repeat password"></div>' +
    '<button class="btn btn-secondary" onclick="changeAdminPassword()">🔐 Change Password</button>' +
    '</div></div>');
}

async function savePlatformSettings() {
  var patch = {
    NAME:         (document.getElementById('ps-name').value      || '').trim(),
    ADMIN_EMAIL:  (document.getElementById('ps-email').value     || '').trim(),
    GCASH_NUMBER: (document.getElementById('ps-gcash-num').value || '').trim(),
    GCASH_NAME:   (document.getElementById('ps-gcash-name').value|| '').trim(),
    GCASH_QR_URL: (document.getElementById('ps-gcash-qr').value  || '').trim(),
    TRIAL_DAYS:   Number(document.getElementById('ps-trial').value) || 30
  };
  try {
    adminState.platformSettings = await ADMIN_API.call('adminSavePlatformSettings', patch);
    if (adminState.platformSettings.NAME) localStorage.setItem('admin_platform_name', adminState.platformSettings.NAME);
    _toast('Settings saved!');
    renderPlatformSettings({ ok: true, text: 'Settings saved successfully.' });
  } catch(e) {
    renderPlatformSettings({ ok: false, text: 'Error: ' + e.message });
  }
}

async function changeAdminPassword() {
  var pw  = document.getElementById('ps-pw').value;
  var pw2 = document.getElementById('ps-pw2').value;
  if (!pw)       { _toast('Enter a new password', true); return; }
  if (pw !== pw2){ _toast('Passwords do not match', true); return; }
  try {
    await ADMIN_API.call('adminChangePassword', { newPassword: pw });
    _toast('Password changed! Please log in again.');
    setTimeout(function() { ADMIN_API.clearToken(); renderAdminLogin(); }, 1500);
  } catch(e) { _toast(e.message, true); }
}

// ── Health Monitoring ─────────────────────────────────────────────────────────

async function renderHealthMonitor() {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading health data…</div>');
  var healthRows = [];
  try { healthRows = await ADMIN_API.call('adminGetAllStoreHealth'); } catch(e) {
    _app('<div class="screen">' + _topbar('🏥 Store Health', 'renderDashboard()') +
      '<div class="msg-err">Failed to load health data: ' + e.message + '</div></div>');
    return;
  }

  var stores = adminState.stores;

  // Build map of storeId → health data
  var healthMap = {};
  healthRows.forEach(function(h) { healthMap[h.Store_ID] = h; });

  var rows = stores.map(function(st) {
    var h = healthMap[st.Store_ID];
    var score = h ? Number(h.Health_Score) : null;
    var status = h ? String(h.Health_Status) : 'UNKNOWN';
    var dot = status === 'HEALTHY' ? '🟢' : status === 'WARNING' ? '🟡' : status === 'ALERT' ? '🔴' : '⚪';
    var lastSeen = h ? String(h.Last_Seen_At || '').substring(0, 16).replace('T', ' ') : 'Never';
    var revenueToday = h ? _money(h.Revenue_Today) : '—';
    var lowStock = h ? Number(h.Low_Stock_Count) : '—';
    return '<div class="store-row" style="cursor:pointer;" onclick="renderStoreSnapshot(\'' + st.Store_ID + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
      '<div style="flex:1;">' +
      '<div style="font-size:14px;font-weight:bold;">' + dot + ' ' + st.Store_Name + '</div>' +
      '<div class="muted" style="font-size:12px;">' + st.Owner_Name + ' · ' + st.Owner_Phone + '</div>' +
      (h ? '<div style="font-size:12px;margin-top:2px;color:#374151;">' +
        'Revenue: <strong>' + revenueToday + '</strong> · ' +
        'Low stock: <strong>' + lowStock + '</strong> · ' +
        'Score: <strong>' + score + '</strong>' +
        '</div>' : '') +
      '<div class="muted" style="font-size:11px;">Last seen: ' + lastSeen + '</div>' +
      '</div>' +
      '<button class="small-btn" style="margin-left:8px;margin-top:4px;" onclick="event.stopPropagation();renderSendMessageToStore(\'' + st.Store_ID + '\',\'' + _esc(st.Store_Name) + '\')">✉ Message</button>' +
      '</div></div>';
  }).join('');

  _app('<div class="screen">' +
    _topbar('🏥 Store Health Monitor', 'renderDashboard()') +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;text-align:center;">Click a store to view full snapshot · Updated on each owner login</div>' +
    '<div class="card" style="padding:0;">' +
    (rows || '<div class="muted" style="padding:12px;">No stores yet.</div>') +
    '</div></div>');
}

async function renderStoreSnapshot(storeId) {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading store data…</div>');
  var snap;
  try { snap = await ADMIN_API.call('adminGetStoreSnapshot', { storeId: storeId }); } catch(e) {
    _app('<div class="screen">' + _topbar('Store Snapshot', 'renderHealthMonitor()') +
      '<div class="msg-err">Failed: ' + e.message + '</div></div>');
    return;
  }

  var st = snap.store || {};

  var lowStockHtml = (snap.lowStockItems || []).map(function(p) {
    return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f3f4f6;">' +
      '<span>' + _esc(p.name) + '</span>' +
      '<span style="color:#dc2626;font-weight:bold;">' + p.stock + ' / ' + p.reorder + '</span></div>';
  }).join('') || '<div class="muted">No low stock items.</div>';

  var recentSalesHtml = (snap.recentSales || []).map(function(s) {
    return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f3f4f6;">' +
      '<span style="color:#6b7280;">' + s.date + ' ' + s.time + '</span> · ' +
      '<strong>' + _money(s.total) + '</strong> · ' + _esc(s.soldBy) +
      ' <span style="color:#6b7280;font-size:11px;">[' + (s.paymentMethod || '') + ']</span>' +
      '</div>';
  }).join('') || '<div class="muted">No recent sales.</div>';

  var recentExpHtml = (snap.recentExpenses || []).map(function(e) {
    return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f3f4f6;">' +
      '<span style="color:#6b7280;">' + e.date + '</span> · ' +
      _esc(e.category) + ' — <em>' + _esc(e.description) + '</em> · ' +
      '<strong>' + _money(e.amount) + '</strong>' +
      '</div>';
  }).join('') || '<div class="muted">No recent expenses.</div>';

  _app('<div class="screen">' +
    _topbar('🔍 ' + _esc(st.name || ''), 'renderHealthMonitor()') +

    '<div class="card">' +
    '<div class="muted" style="font-size:12px;margin-bottom:8px;">' + snap.today + ' · Plan: ' + st.plan + '</div>' +
    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + _money(snap.revenueToday) + '</div><div class="lbl">Revenue Today</div></div>' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + snap.txToday + '</div><div class="lbl">Transactions</div></div>' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + _money(snap.grossToday) + '</div><div class="lbl">Gross Profit</div></div>' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + _money(snap.netToday) + '</div><div class="lbl">Net Today</div></div>' +
    '</div>' +
    '<div style="font-size:13px;line-height:2;margin-top:8px;">' +
    '<div>Revenue (7 days): <strong>' + _money(snap.revenue7Days) + '</strong></div>' +
    '<div>COGS Today: <strong>' + _money(snap.cogsToday) + '</strong> · Expenses: <strong>' + _money(snap.expToday) + '</strong></div>' +
    '<div>Products: <strong>' + snap.productCount + '</strong> · Low stock: <strong style="color:#d97706;">' + snap.lowStockCount + '</strong> · Out of stock: <strong style="color:#dc2626;">' + snap.outOfStockCount + '</strong></div>' +
    '</div></div>' +

    '<div class="card">' +
    '<div class="section-title">⚠️ Low / Out of Stock</div>' +
    lowStockHtml + '</div>' +

    '<div class="card">' +
    '<div class="section-title">🛒 Recent Sales</div>' +
    recentSalesHtml + '</div>' +

    '<div class="card">' +
    '<div class="section-title">💸 Recent Expenses</div>' +
    recentExpHtml + '</div>' +

    '<div class="card">' +
    '<button class="btn btn-secondary" onclick="renderSendMessageToStore(\'' + storeId + '\',\'' + _esc(st.name || '') + '\')">✉ Message Owner</button>' +
    '</div></div>');
}

// ── Messaging ─────────────────────────────────────────────────────────────────

var _msgPollInterval = null;

function _stopMsgPoll() {
  if (_msgPollInterval) { clearInterval(_msgPollInterval); _msgPollInterval = null; }
}

async function renderMessagesInbox() {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading messages…</div>');
  var unread, allMsgs;
  try {
    unread  = await ADMIN_API.call('adminGetUnreadCount');
    allMsgs = await ADMIN_API.call('adminGetAllMessages');
  } catch(e) {
    _app('<div class="screen">' + _topbar('📬 Messages', 'renderDashboard()') +
      '<div class="msg-err">Failed to load messages: ' + e.message + '</div></div>');
    return;
  }

  // Group messages by store
  var byStore = {};
  allMsgs.forEach(function(m) {
    if (!byStore[m.Store_ID]) byStore[m.Store_ID] = { storeId: m.Store_ID, storeName: m.Store_Name, msgs: [], unread: 0 };
    byStore[m.Store_ID].msgs.push(m);
  });
  // Mark unread counts
  (unread.stores || []).forEach(function(u) {
    if (byStore[u.storeId]) byStore[u.storeId].unread = u.count;
  });

  var threads = Object.values(byStore).sort(function(a, b) {
    var la = a.msgs[a.msgs.length - 1] || {};
    var lb = b.msgs[b.msgs.length - 1] || {};
    return String(lb.Created_At || '').localeCompare(String(la.Created_At || ''));
  });

  var threadRows = threads.map(function(t) {
    var last = t.msgs[t.msgs.length - 1] || {};
    var preview = String(last.Message || '').substring(0, 60);
    var time = String(last.Created_At || '').substring(0, 16).replace('T', ' ');
    return '<div class="store-row" onclick="renderStoreMessageThread(\'' + t.storeId + '\',\'' + _esc(t.storeName) + '\')" style="cursor:pointer;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
      '<div style="flex:1;">' +
      '<div style="font-weight:bold;font-size:14px;">' + _esc(t.storeName) +
      (t.unread > 0 ? ' <span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;">' + t.unread + '</span>' : '') +
      '</div>' +
      '<div class="muted" style="font-size:12px;">' + _esc(preview) + (preview.length >= 60 ? '…' : '') + '</div>' +
      '<div class="muted" style="font-size:11px;">' + time + '</div>' +
      '</div>' +
      '</div></div>';
  }).join('') || '<div class="muted" style="padding:12px;">No messages yet.</div>';

  var totalUnread = unread.count || 0;
  _app('<div class="screen">' +
    _topbar('📬 Messages' + (totalUnread > 0 ? ' (' + totalUnread + ' unread)' : ''), 'renderDashboard()') +
    '<div class="card" style="padding:0;">' + threadRows + '</div></div>');
}

async function renderStoreMessageThread(storeId, storeName) {
  _stopMsgPoll();
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading conversation…</div>');
  var msgs;
  try { msgs = await ADMIN_API.call('adminGetStoreMessages', { storeId: storeId }); } catch(e) {
    _app('<div class="screen">' + _topbar('Messages', 'renderMessagesInbox()') +
      '<div class="msg-err">' + e.message + '</div></div>');
    return;
  }
  _renderThreadScreen(storeId, storeName, msgs);

  _msgPollInterval = setInterval(async function() {
    if (!document.getElementById('thread-msgs-' + storeId)) { _stopMsgPoll(); return; }
    try {
      var fresh = await ADMIN_API.call('adminGetStoreMessages', { storeId: storeId });
      var el = document.getElementById('thread-msgs-' + storeId);
      if (!el) { _stopMsgPoll(); return; }
      el.innerHTML = _buildBubbles(fresh, false);
      el.scrollTop = el.scrollHeight;
    } catch(e) {}
  }, 15000);
}

function _buildBubbles(msgs, isStoreView) {
  if (!msgs || !msgs.length) return '<div class="muted" style="padding:12px;">No messages yet.</div>';
  return msgs.map(function(m) {
    var fromStore = m.Direction === 'TO_ADMIN';
    var isRight = isStoreView ? !fromStore : fromStore;
    var bg   = isRight ? '#dcfce7' : '#dbeafe';
    var align = isRight ? 'flex-end' : 'flex-start';
    var time = String(m.Created_At || '').substring(0, 16).replace('T', ' ');
    return '<div style="display:flex;flex-direction:column;align-items:' + align + ';margin-bottom:8px;">' +
      '<div style="background:' + bg + ';border-radius:12px;padding:8px 12px;max-width:80%;font-size:13px;">' +
      '<strong style="font-size:11px;color:#6b7280;">' + _esc(m.From_Name || '') + '</strong><br>' +
      _esc(m.Message || '') + '</div>' +
      '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">' + time + '</div>' +
      '</div>';
  }).join('');
}

function _renderThreadScreen(storeId, storeName, msgs) {
  var bubblesHtml = _buildBubbles(msgs, false);
  _app('<div class="screen">' +
    '<div class="topbar"><div class="title">' + _esc(storeName) + '</div>' +
    '<button class="small-btn" onclick="_stopMsgPoll();renderMessagesInbox();">← Back</button></div>' +

    '<div id="thread-msgs-' + storeId + '" style="flex:1;overflow-y:auto;padding:12px;background:#f9fafb;min-height:200px;max-height:50vh;border-radius:8px;margin-bottom:8px;">' +
    bubblesHtml + '</div>' +

    '<div class="card" style="margin-top:0;">' +
    '<div class="field">' +
    '<textarea id="admin-msg-text" placeholder="Type a message…" rows="3" style="resize:none;"></textarea>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="_sendAdminMessage(\'' + storeId + '\')">Send ✉</button>' +
    '</div></div>');

  // Scroll to bottom
  var el = document.getElementById('thread-msgs-' + storeId);
  if (el) el.scrollTop = el.scrollHeight;
}

async function renderSendMessageToStore(storeId, storeName) {
  _stopMsgPoll();
  var msgs;
  try { msgs = await ADMIN_API.call('adminGetStoreMessages', { storeId: storeId }); } catch(e) { msgs = []; }
  _renderThreadScreen(storeId, storeName, msgs);

  _msgPollInterval = setInterval(async function() {
    if (!document.getElementById('thread-msgs-' + storeId)) { _stopMsgPoll(); return; }
    try {
      var fresh = await ADMIN_API.call('adminGetStoreMessages', { storeId: storeId });
      var el = document.getElementById('thread-msgs-' + storeId);
      if (!el) { _stopMsgPoll(); return; }
      el.innerHTML = _buildBubbles(fresh, false);
      el.scrollTop = el.scrollHeight;
    } catch(e) {}
  }, 15000);
}

async function _sendAdminMessage(storeId) {
  var msg = (document.getElementById('admin-msg-text').value || '').trim();
  if (!msg) { _toast('Type a message first', true); return; }
  try {
    await ADMIN_API.call('adminSendMessage', { storeId: storeId, message: msg });
    document.getElementById('admin-msg-text').value = '';
    var fresh = await ADMIN_API.call('adminGetStoreMessages', { storeId: storeId });
    var el = document.getElementById('thread-msgs-' + storeId);
    if (el) { el.innerHTML = _buildBubbles(fresh, false); el.scrollTop = el.scrollHeight; }
  } catch(e) { _toast(e.message, true); }
}

// ── Escape helper ─────────────────────────────────────────────────────────────

// Provisioning-aware overrides for the tenant creation flow
async function renderCreateStore(msg) {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading setup...</div>');
  try { await _ensureFeatureCatalog(); } catch(e) {}

  _app('<div class="screen">' +
    _topbar('Create New Store', 'renderDashboard()') +
    (msg ? '<div class="' + (msg.ok ? 'msg-ok' : 'msg-err') + '">' + msg.text + '</div>' : '') +

    '<div class="card">' +
    '<div class="section-title">Store Info</div>' +
    '<div class="field"><label>Store Name *</label><input id="cs-name" placeholder="e.g. Aling Nena\'s Store"></div>' +
    '<div class="field"><label>Owner Name</label><input id="cs-owner" placeholder="Full name"></div>' +
    '<div class="field"><label>Owner Email</label><input id="cs-email" type="email" placeholder="email@example.com"></div>' +
    '<div class="field"><label>Owner Phone</label><input id="cs-phone" placeholder="09xxxxxxxxx"></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">Hub Plan</div>' +
    '<div class="field"><label>Choose Hub</label>' +
    '<select id="cs-plan" onchange="_onCreatePlanChange()">' +
    _hubPlanOptions().map(function(opt) {
      return '<option value="' + opt.value + '"' + (opt.value === 'NEGOSYO_HUB' ? ' selected' : '') + '>' + _esc(opt.label) + '</option>';
    }).join('') +
    '</select></div>' +
    '<div class="hint">Every new store starts with a fixed 30-day trial of the selected Hub plan.</div>' +
    '<input id="cs-trial" type="hidden" value="30">' +
    '</div>' +

    '<div class="card" id="cs-addons-card"></div>' +

    '<div class="card">' +
    '<div class="section-title">Owner Login Seed</div>' +
    '<div class="field"><label>Owner Username</label><input id="cs-owner-user" value="owner" placeholder="owner"></div>' +
    '<div class="field"><label>Owner Password</label><input id="cs-owner-pass" value="1234" placeholder="1234"></div>' +
    '<div class="hint">These credentials are seeded into the store database during provisioning.</div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">Dedicated Database Target</div>' +
    '<div class="field"><label>Database Provider</label>' +
    '<select id="cs-db-provider" onchange="_onCreateDbProviderChange()">' +
    '<option value="d1" selected>Cloudflare D1 dedicated DB</option>' +
    '<option value="libsql">Legacy Turso / libSQL DB</option>' +
    '</select></div>' +
    '<div id="cs-libsql-fields" style="display:none;">' +
    '<div class="field"><label>Turso DB URL</label><input id="cs-turso-url" placeholder="libsql://your-store-db.turso.io"></div>' +
    '<div class="hint">Legacy path only while old Turso-backed tenants are being retired.</div>' +
    '</div>' +
    '<div id="cs-d1-fields">' +
    '<div class="field"><label>D1 Binding Name</label><input id="cs-d1-binding" placeholder="e.g. STORE_DB_BRANCH_001"></div>' +
    '<div class="hint">Use a pre-bound D1 database name from Wrangler for this tenant.</div>' +
    '</div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="field"><label>Notes (internal only)</label>' +
    '<textarea id="cs-notes" placeholder="Any notes about this store..."></textarea></div>' +
    '<button class="btn btn-primary" onclick="submitCreateStore()">Provision Store</button>' +
    '</div></div>');

  _renderAddOnSelector('cs-addons-card', 'NEGOSYO_HUB', []);
}

function _onCreatePlanChange() {
  var plan = document.getElementById('cs-plan').value;
  _renderAddOnSelector('cs-addons-card', plan, _selectedModulesFromForm('cs-addons-card'));
}

function _onCreateDbProviderChange() {
  var provider = document.getElementById('cs-db-provider').value;
  document.getElementById('cs-libsql-fields').style.display = provider === 'libsql' ? 'block' : 'none';
  document.getElementById('cs-d1-fields').style.display = provider === 'd1' ? 'block' : 'none';
}

async function submitCreateStore() {
  var name = (document.getElementById('cs-name').value || '').trim();
  if (!name) { _toast('Store name is required', true); return; }

  var plan = document.getElementById('cs-plan').value;
  var provider = document.getElementById('cs-db-provider').value;
  var ownerUsername = (document.getElementById('cs-owner-user').value || '').trim();
  var ownerPassword = document.getElementById('cs-owner-pass').value || '';
  if (!ownerUsername) { _toast('Owner username is required', true); return; }
  if (ownerPassword.length < 4) { _toast('Owner password must be at least 4 characters', true); return; }

  var data = {
    storeName: name,
    ownerName: (document.getElementById('cs-owner').value || '').trim(),
    ownerEmail: (document.getElementById('cs-email').value || '').trim(),
    ownerPhone: (document.getElementById('cs-phone').value || '').trim(),
    ownerUsername: ownerUsername,
    ownerPassword: ownerPassword,
    plan: plan,
    trialDays: 30,
    dbProvider: provider,
    d1Binding: (document.getElementById('cs-d1-binding').value || '').trim(),
    tursoDbUrl: (document.getElementById('cs-turso-url').value || '').trim(),
    notes: (document.getElementById('cs-notes').value || '').trim(),
    initialModuleCodes: _selectedModulesFromForm('cs-addons-card')
  };
  if (provider === 'libsql' && !data.tursoDbUrl) { _toast('Dedicated Turso DB URL is required', true); return; }
  if (provider === 'd1' && !data.d1Binding) { _toast('Dedicated D1 binding is required', true); return; }

  _app('<div style="text-align:center;padding:80px 20px;color:#6b7280;">Provisioning store...<br><small>This may take 10-30 seconds.</small></div>');

  try {
    var result = await ADMIN_API.call('adminProvisionStore', data);
    adminState.stores = await ADMIN_API.call('adminGetStores');
    renderProvisionSuccess(result);
  } catch(e) {
    renderCreateStore({ ok: false, text: 'Error: ' + e.message });
  }
}

function renderProvisionSuccess(r) {
  var pwaUrl = _storePwaUrl(r.apiKey);
  var seededAddOns = Array.isArray(r.seededAddOns) ? r.seededAddOns : [];
  var lifecycleHtml = r.trialEnd
    ? '<div>Trial ends: <strong>' + _esc(r.trialEnd) + '</strong></div>'
    : '<div>Billing cycle ends: <strong>' + _esc(r.subscriptionExpires || '—') + '</strong></div>';
  var dbHtml = r.dbProvider === 'd1'
    ? '<div>Dedicated DB: <strong>D1</strong> - ' + _esc(r.d1Binding || '—') + '</div>'
    : '<div>Dedicated DB: <strong>libSQL</strong> - <span style="word-break:break-all;font-size:11px;">' + _esc(r.tursoDbUrl || '—') + '</span></div>';

  _app('<div class="screen">' +
    _topbar('Store Created', 'renderDashboard()') +
    '<div class="card" style="text-align:center;">' +
    '<div style="font-size:48px;margin-bottom:8px;">OK</div>' +
    '<h3 style="margin-bottom:4px;">' + _esc(r.storeName) + '</h3>' +
    '<div class="muted" style="margin-bottom:16px;">Store provisioned successfully</div>' +
    '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin-bottom:12px;text-align:left;">' +
    '<div style="font-size:12px;font-weight:bold;color:#15803d;margin-bottom:8px;">PWA Link</div>' +
    '<div style="font-size:13px;word-break:break-all;color:#1d4ed8;margin-bottom:0;">' + pwaUrl + '</div>' +
    '</div>' +
    '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px;margin-bottom:12px;text-align:left;">' +
    '<div style="font-size:12px;font-weight:bold;color:#854d0e;margin-bottom:8px;">Default Login Credentials</div>' +
    '<div style="font-size:13px;line-height:2.2;">' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #fde047;">' +
    '<span>Username</span><strong style="font-family:monospace;font-size:15px;">' + _esc(r.ownerUsername || 'owner') + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;">' +
    '<span>Password</span><strong style="font-family:monospace;font-size:15px;">' + _esc(r.ownerPassword || '1234') + '</strong></div>' +
    '</div>' +
    '<div style="font-size:11px;color:#92400e;margin-top:8px;">Ask the owner to change this password after first login.</div>' +
    '</div>' +
    '<div style="background:#f9fafb;border-radius:8px;padding:12px;text-align:left;">' +
    '<div style="font-size:12px;line-height:2;color:#374151;">' +
    lifecycleHtml +
    '<div>Plan: <strong>' + _esc(_planLabel(r.plan)) + '</strong></div>' +
    (r.monthlyFee ? '<div>Monthly fee: <strong>' + _money(r.monthlyFee) + '</strong></div>' : '') +
    (seededAddOns.length ? '<div>Initial add-ons: <strong>' + _esc(seededAddOns.map(function(item) { return item.feature_name || item.module_code; }).join(', ')) + '</strong></div>' : '<div>Initial add-ons: <strong>None selected</strong></div>') +
    dbHtml +
    '<div>API Key: <span style="word-break:break-all;font-size:11px;">' + _esc(r.apiKey) + '</span></div>' +
    '</div></div>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="renderDashboard()">Back to Dashboard</button>' +
    '</div>');
}

async function _changePlan(storeId) {
  var plan = document.getElementById('chg-plan').value;
  var patch = { Plan: plan };
  var planDefs = _planDefs();
  var def = planDefs[plan];
  if (def) {
    patch.Max_Users = def.max_users;
    patch.Max_Products = def.max_products;
    patch.Reports_Level = def.reports;
    patch.Has_Health_Indicators = String(def.health);
    patch.Monthly_Fee = def.fee;
  }
  try {
    await ADMIN_API.call('adminUpdateStore', { storeId: storeId, patch: patch });
    _toast('Plan updated to ' + _planLabel(plan));
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message, true); }
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
