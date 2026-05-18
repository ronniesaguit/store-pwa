// admin.js  HubSuite Admin Panel

var adminState = {
  admin: null,
  stores: [],
  platformSettings: {},
  featureCatalog: []
};

var HUB = window.HUBSUITE || null;

//  Boot 

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

//  Helpers 

function _app(html) { document.getElementById('app').innerHTML = html; }

function _toast(msg, isErr) {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 20px;' +
    'border-radius:20px;font-weight:bold;z-index:9999;white-space:nowrap;font-size:14px;' +
    'box-shadow:0 4px 12px rgba(0,0,0,.25);' +
    (isErr ? 'background:#dc2626;color:#fff;' : 'background:#16a34a;color:#fff;');
  t.textContent = (isErr ? ' ' : ' ') + msg;
  document.body.appendChild(t);
  setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
}

function _money(v) {
  return '' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
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
    { value: 'NEGOSYO_HUB', label: 'Negosyo Hub' },
    { value: 'BUSINESS_HUB', label: 'Business Hub' },
    { value: 'NEXORA_HUB', label: 'Nexora Hub' },
    { value: 'CUSTOM', label: 'Custom / Flexible' }
  ];
  var normalizedCurrent = _normalizePlanId(currentPlan || '');
  if (normalizedCurrent && !options.some(function(opt) { return opt.value === normalizedCurrent; })) {
    options.unshift({ value: normalizedCurrent, label: _planLabel(normalizedCurrent) });
  }
  return options;
}

function _onChangePlanChange(currentCustomModules) {
  var plan = document.getElementById('chg-plan').value;
  var card = document.getElementById('chg-custom-card');
  if (!card) return;
  if (plan === 'CUSTOM') {
    card.style.display = '';
    _renderCustomModuleSelector('chg-custom-modules', currentCustomModules || []);
  } else {
    card.style.display = 'none';
  }
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

function _customModuleCatalog() {
  var hubList = [];
  try { if (HUB && HUB.getCustomModuleCatalog) hubList = HUB.getCustomModuleCatalog() || []; } catch(e) {}
  if (hubList && hubList.length) return hubList;
  if (typeof _fallbackModuleCatalog === 'function') return _fallbackModuleCatalog();
  return [];
}

function _customPlanMinFee() {
  return (HUB && HUB.customPlanMinFee) ? HUB.customPlanMinFee : 200;
}

function _computeCustomFee(selectedCodes) {
  if (HUB && HUB.computeCustomPrice) return HUB.computeCustomPrice(selectedCodes);
  return _customPlanMinFee();
}

function _renderCustomModuleSelector(containerId, selectedCodes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var catalog = _customModuleCatalog();
  var selectedMap = {};
  (selectedCodes || []).forEach(function(code) { selectedMap[String(code)] = true; });
  var feeElId = containerId + '-fee';
  container.innerHTML =
    '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
    '<button type="button" class="btn btn-secondary" style="width:auto;padding:6px 12px;font-size:12px;" onclick="_selectAllCustomModules(\'' + containerId + '\',true)">Select All</button>' +
    '<button type="button" class="btn btn-secondary" style="width:auto;padding:6px 12px;font-size:12px;" onclick="_selectAllCustomModules(\'' + containerId + '\',false)">Clear All</button>' +
    '</div>' +
    catalog.map(function(m) {
      return '<label style="display:flex;align-items:center;gap:10px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;">' +
        '<input type="checkbox" data-module-code="' + _esc(m.code) + '"' + (selectedMap[m.code] ? ' checked' : '') +
        ' onchange="_updateCustomFeeDisplay(\'' + containerId + '\',\'' + feeElId + '\')" style="margin:0;flex-shrink:0;">' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;font-weight:700;color:#111827;">' + _esc(m.name) + '</div>' +
        '<div class="muted" style="font-size:11px;">' + _esc(m.description) + '</div>' +
        '</div>' +
        '<div style="font-size:13px;font-weight:700;color:#059669;white-space:nowrap;">' + m.price + '/mo</div>' +
        '</label>';
    }).join('') +
    (catalog.length ? '' : '<div class="muted">Module catalog unavailable.</div>');
  _updateCustomFeeDisplay(containerId, feeElId);
}

function _selectAllCustomModules(containerId, select) {
  var root = document.getElementById(containerId);
  if (!root) return;
  root.querySelectorAll('input[type=checkbox][data-module-code]').forEach(function(el) { el.checked = select; });
  _updateCustomFeeDisplay(containerId, containerId + '-fee');
}

function _updateCustomFeeDisplay(containerId, feeElId) {
  var selected = _selectedModulesFromForm(containerId);
  var fee = _computeCustomFee(selected);
  var feeEl = document.getElementById(feeElId);
  if (feeEl) feeEl.textContent = '' + fee + '/mo';
}

function _featureCatalog() {
  return Array.isArray(adminState.featureCatalog) ? adminState.featureCatalog : [];
}

function _planCoreModuleCatalog(planId) {
  if (HUB && HUB.getCoreModuleCatalog) return HUB.getCoreModuleCatalog(planId);
  return [];
}

function _planCoreModuleCodes(planId) {
  if (HUB && HUB.getCoreModuleCodes) return HUB.getCoreModuleCodes(planId) || [];
  return _planCoreModuleCatalog(planId).map(function(feature) {
    return feature.module_code || feature.code;
  }).filter(Boolean);
}

function _uniqueModuleCodes(codes) {
  var seen = {};
  return (codes || []).filter(function(code) {
    code = String(code || '').trim();
    if (!code || seen[code]) return false;
    seen[code] = true;
    return true;
  });
}

function _moduleSyncPayload(planId, selectedAddOns) {
  var core = _planCoreModuleCodes(planId);
  var enabled = _uniqueModuleCodes(core.concat(selectedAddOns || []));
  return {
    coreModuleCodes: core,
    enabledModuleCodes: enabled,
    initialModuleCodes: enabled,
    planModuleCodes: enabled
  };
}

function _applyModulePatchFields(patch, modulePayload) {
  // Do not write guessed module columns into store.patch.
  // D1-backed stores reject unknown columns like Enabled_Modules.
  // Module sync is handled by top-level payload fields and repair actions.
  return patch;
}


function _moduleCodeKey(code) {
  var value = String(code || '').trim();
  try { if (HUB && HUB.resolveModuleId) value = HUB.resolveModuleId(value); } catch(e) {}
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function _planAddOnCatalog(planId, catalog) {
  if (HUB && HUB.getAddOnCatalog) return HUB.getAddOnCatalog(planId, catalog || _featureCatalog());
  return catalog || _featureCatalog();
}

function _staffPolicy(planId) {
  if (HUB && HUB.getStaffPolicy) return HUB.getStaffPolicy(planId);
  return { includedUsers: 2, includedStaff: 1, extraStaffPrice: 10 };
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


function _renderPlanBundleSummary(planId) {
  var tier = _planTier(planId) || {};
  var defs = _planDefs();
  var def = defs[_normalizePlanId(planId)] || {};
  var core = _planCoreModuleCatalog(planId) || [];
  var coreHtml = core.length ? core.map(function(feature) {
    var name = feature.feature_name || feature.name || feature.module_name || feature.module_code || feature.code || 'Included feature';
    var desc = feature.description || feature.feature_description || '';
    return '<li style="margin-bottom:6px;"><strong>' + _esc(name) + '</strong>' + (desc ? '<div class="muted" style="font-size:11px;">' + _esc(desc) + '</div>' : '') + '</li>';
  }).join('') : '<li class="muted">No included module list available yet for this plan.</li>';
  var limitHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Users</strong><br>' + (def.max_users === -1 ? 'Unlimited' : (def.max_users || tier.maxUsers || '')) + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Products</strong><br>' + (def.max_products === -1 ? 'Unlimited' : (def.max_products || tier.maxProducts || '')) + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Reports</strong><br>' + _esc(def.reports || tier.reportsLevel || '') + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Health</strong><br>' + ((def.health || tier.hasHealthIndicators) ? 'Included' : 'Not included') + '</div>' +
    '</div>';
  return '<div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:10px;padding:12px;margin-bottom:12px;">' +
    '<div style="font-weight:800;color:#1e3a5f;margin-bottom:4px;">' + _esc(_planLabel(planId)) + ' Included Bundle</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:8px;">These features are already included in the selected Hub plan.</div>' +
    '<ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:#111827;">' + coreHtml + '</ul>' + limitHtml +
    '</div>';
}

function _renderAddOnSelector(containerId, planId, selectedModuleCodes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var addOnPrice = _addOnPriceForPlan(planId);
  var addOns = _planAddOnCatalog(planId, _featureCatalog());
  var selectedMap = {};
  (selectedModuleCodes || []).forEach(function(code) { selectedMap[String(code)] = true; });

  container.innerHTML =
    '<div class="section-title">Additional Add-ons</div>' +
    _renderPlanBundleSummary(planId) +
    '<div class="hint" style="margin-bottom:10px;">Choose optional add-on features below. The included bundle above is already part of the selected Hub plan.</div>' +
    addOns.map(function(feature) {
      var code = feature.module_code;
      return '<label style="display:block;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
        '<input type="checkbox" data-module-code="' + _esc(code) + '"' + (selectedMap[code] ? ' checked' : '') + ' style="margin-top:3px;">' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;font-weight:700;color:#111827;">' + _esc(feature.feature_name || code) + '</div>' +
        '<div class="muted" style="font-size:12px;">' + _esc(feature.short_description || '') + '</div>' +
        '<div class="hint">After trial: ' + (addOnPrice !== null ? ('' + addOnPrice + '/month') : 'plan-based pricing') + '</div>' +
        '</div>' +
        '</div>' +
        '</label>';
    }).join('') +
    (addOns.length ? '' : '<div class="muted">No add-ons available for this plan.</div>');
}

function _renderCommercialStateFallback(planId, errMsg) {
  var addOnPrice = _addOnPriceForPlan(planId);
  var rows = _planAddOnCatalog(planId, _featureCatalog()).map(function(feature) {
    return '<div style="padding:10px 0;border-bottom:1px solid #f3f4f6;">' +
      '<div style="font-size:13px;font-weight:700;">' + _esc(feature.feature_name || feature.module_code) + '</div>' +
      '<div class="muted" style="font-size:12px;">' + _esc(feature.short_description || '') + '</div>' +
      '<div class="hint">' + (addOnPrice !== null ? ('After trial: ' + _money(addOnPrice) + '/month') : 'Plan-based pricing') + '</div>' +
      '</div>';
  }).join('');

  return '<div class="card">' +
    '<div class="section-title">Add-ons</div>' +
    '<div class="hint" style="margin-bottom:10px;">Per-store add-on subscription status is not available from the current backend yet. Showing the available add-on catalog instead.' +
    (addOnPrice !== null ? ' Current Hub add-ons are ' + _money(addOnPrice) + '/month each after trial.' : '') +
    '</div>' +
    (rows || '<div class="muted">No add-ons available yet.</div>') +
    (errMsg ? '<div class="hint" style="margin-top:10px;color:#92400e;">Backend note: ' + _esc(errMsg) + '</div>' : '') +
    '</div>';
}

function _renderPlanInclusionsCard(planId) {
  var staffPolicy = _staffPolicy(planId);
  var rows = _planCoreModuleCatalog(planId).map(function(feature) {
    return '<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px;">' +
      '<strong>' + _esc(feature.icon || '') + ' ' + _esc(feature.name || feature.code) + '</strong>' +
      (feature.shortDescription ? '<div class="muted" style="font-size:11px;margin-top:2px;">' + _esc(feature.shortDescription) + '</div>' : '') +
      '</div>';
  }).join('');

  return '<div class="card">' +
    '<div class="section-title">Included In ' + _esc(_planLabel(planId)) + '</div>' +
    (staffPolicy.includedUsers !== null ? '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;font-size:12px;">Staff included: <strong>' + staffPolicy.includedUsers + ' total users</strong> (owner + ' + staffPolicy.includedStaff + ' staff). Extra staff: <strong>' + _money(staffPolicy.extraStaffPrice) + '/month each</strong>.</div>' : '') +
    (rows || '<div class="muted">No core feature summary available.</div>') +
    '</div>';
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
    var staffSeats = data.staffSeatState;
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
    var staffSeatHtml = staffSeats ? '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;">' +
      '<strong>Staff allowance</strong><br>' +
      'Included: <strong>' + _esc(staffSeats.included_users == null ? 'Custom' : staffSeats.included_users + ' total users') + '</strong>' +
      (staffSeats.included_staff == null ? '' : ' (owner + ' + staffSeats.included_staff + ' staff)') + '<br>' +
      'Current staff: <strong>' + _esc(staffSeats.staff_count || 0) + '</strong>  Extra staff: <strong>' + _esc(staffSeats.extra_staff_count || 0) + '</strong>' +
      (staffSeats.extra_staff_price ? '  ' + _money(staffSeats.extra_staff_price) + '/month' : '') + '<br>' +
      'Staff overage: <strong>' + _money(staffSeats.extra_staff_amount || 0) + '/month</strong>' +
      '</div>' : '';
    host.innerHTML =
      '<div class="card">' +
      '<div class="section-title">Add-ons</div>' +
      '<div class="hint" style="margin-bottom:10px;">Owner-selected add-ons from the marketplace will show here automatically.' +
      (addOnPrice !== null ? ' Current Hub add-ons are ' + addOnPrice + '/month each after trial.' : '') +
      '</div>' +
      (revenue ? '<div style="background:#f9fafb;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;">Base: <strong>' + _money(revenue.base_recurring_amount || 0) + '</strong>  Add-ons: <strong>' + _money(revenue.addons_recurring_amount || 0) + '</strong>  Staff overage: <strong>' + _money(revenue.staff_overage_amount || 0) + '</strong>  Total: <strong>' + _money(revenue.total_recurring_amount || 0) + '</strong></div>' : '') +
      staffSeatHtml +
      (rows || '<div class="muted">No add-ons selected yet.</div>') +
      '</div>';
  } catch(e) {
    if (e && e.message && e.message.indexOf('Unknown admin action: adminGetStoreCommercialState') !== -1) {
      host.innerHTML = _renderCommercialStateFallback(planId, e.message);
      return;
    }
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
  if (String(store.Status).toUpperCase() === 'ARCHIVED') return 'ARCHIVED';
  if (trial   && now <= trial)   return 'TRIAL';
  if (expires && now <= expires) return 'ACTIVE';
  return 'EXPIRED';
}

function _adminStoreById(storeId) {
  return (adminState.stores || []).find(function(s) { return String(s.Store_ID) === String(storeId); }) || null;
}

function _isArchivedStoreId(storeId) {
  var st = _adminStoreById(storeId);
  return !st || _storeStatus(st) === 'ARCHIVED';
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
    (backFn ? '<button class="small-btn" onclick="' + backFn + '"> Back</button>' : '') +
    '</div>';
}

function _jsStr(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function _adminHelpText(enWhat, enHow, tlWhat, tlHow, cbWhat, cbHow) {
  return {
    en: { what: enWhat, how: enHow },
    tl: { what: tlWhat || enWhat, how: tlHow || enHow },
    ceb: { what: cbWhat || tlWhat || enWhat, how: cbHow || tlHow || enHow }
  };
}

var ADMIN_MODULE_HELP = {
  products: _adminHelpText('Products lets a store maintain the items it sells.', 'Use this module when checking whether the store can add products, update prices, and organize product records.', 'Products ang module para ayusin ang mga paninda ng store.', 'Gamitin ito para makita kung puwedeng magdagdag ng products, mag-update ng presyo, at mag-ayos ng records.', 'Products ang module para dumalahon ang mga baligya sa store.', 'Gamita kini aron makita kung makadugang og products, maka-update sa presyo, ug maka-organize sa records.'),
  inventory: _adminHelpText('Inventory monitors stock count, stock status, and stock movement.', 'Use this module to confirm the store has stock tracking, receiving, adjustment, and inventory visibility.', 'Inventory ang module para bantayan ang dami at galaw ng stock.', 'Gamitin ito para i-confirm ang stock tracking, receiving, adjustment, at inventory visibility.', 'Inventory ang module para bantayan ang gidaghanon ug lihok sa stock.', 'Gamita kini aron i-confirm ang stock tracking, receiving, adjustment, ug inventory visibility.'),
  quick_sell: _adminHelpText('Quick Sell is the store selling screen for fast transactions.', 'Enable or review this module when a store needs POS sales entry and payment recording.', 'Quick Sell ang mabilis na sales/POS screen ng store.', 'I-enable o i-review ito kapag kailangan ng store ng sales entry at payment recording.', 'Quick Sell mao ang paspas nga sales/POS screen sa store.', 'I-enable o i-review kini kung kinahanglan sa store og sales entry ug payment recording.'),
  expenses: _adminHelpText('Expenses records the operating costs of the store.', 'Use this module to allow expense entry, cost review, and profit reporting support.', 'Expenses ang module para sa gastos ng store.', 'Gamitin ito para payagan ang expense entry, cost review, at profit reporting.', 'Expenses ang module para sa gasto sa store.', 'Gamita kini para sa expense entry, cost review, ug profit reporting.'),
  reports: _adminHelpText('Reports gives the store summaries for sales, stock, and performance.', 'Use this module to confirm the store has the correct report level for its plan.', 'Reports ang module para sa sales, stock, at performance summary.', 'Gamitin ito para i-confirm ang tamang report level ng plan.', 'Reports ang module para sa sales, stock, ug performance summary.', 'Gamita kini aron i-confirm ang sakto nga report level sa plan.'),
  advanced_reports: _adminHelpText('Advanced Reports provides deeper business analysis.', 'Enable this when the plan should include broader sales, stock, and financial reporting.', 'Advanced Reports para sa mas malalim na business analysis.', 'I-enable ito kung kasama sa plan ang mas malawak na sales, stock, at financial reporting.', 'Advanced Reports para sa mas lawom nga business analysis.', 'I-enable kini kung apil sa plan ang mas lapad nga sales, stock, ug financial reporting.'),
  tax_reports: _adminHelpText('BIR / Tax prepares tax-related store totals.', 'Use this module when a store needs quarterly, annual, or taxable sales summaries.', 'BIR / Tax para sa tax-related totals ng store.', 'Gamitin ito kung kailangan ng quarterly, annual, o taxable sales summaries.', 'BIR / Tax para sa tax-related totals sa store.', 'Gamita kini kung kinahanglan og quarterly, annual, o taxable sales summaries.'),
  suppliers: _adminHelpText('Suppliers stores vendor information for purchasing.', 'Enable this module for stores that manage supplier contacts and purchase workflows.', 'Suppliers ang module para sa vendor information.', 'I-enable ito para sa stores na may supplier contacts at purchase workflows.', 'Suppliers ang module para sa vendor information.', 'I-enable kini para sa stores nga naay supplier contacts ug purchase workflows.'),
  purchase_orders: _adminHelpText('Purchase Orders tracks orders sent to suppliers.', 'Use this module when the store needs purchase order creation, review, approval, or receiving.', 'Purchase Orders para sa orders papunta sa suppliers.', 'Gamitin ito kung kailangan ng PO creation, review, approval, o receiving.', 'Purchase Orders para sa orders padulong sa suppliers.', 'Gamita kini kung kinahanglan og PO creation, review, approval, o receiving.'),
  purchase_requisitions: _adminHelpText('Purchase Requisitions are internal buying requests.', 'Use this module when staff should request items before purchase orders are made.', 'Purchase Requisitions ang internal request bago bumili.', 'Gamitin ito kapag dapat mag-request muna ang staff bago gumawa ng purchase order.', 'Purchase Requisitions ang internal request sa dili pa mopalit.', 'Gamita kini kung ang staff kinahanglan mo-request una sa dili pa purchase order.'),
  stock_receiving: _adminHelpText('Receiving Logs record incoming stocks.', 'Use this module to let stores receive items and update inventory records.', 'Receiving Logs ang tala ng dumating na stock.', 'Gamitin ito para makapag-receive ng items at ma-update ang inventory.', 'Receiving Logs ang record sa niabot nga stock.', 'Gamita kini aron makadawat og items ug ma-update ang inventory.'),
  order_fulfillment: _adminHelpText('Order Fulfillment tracks orders that must be prepared or delivered.', 'Enable this module for stores handling order preparation, pickup, or delivery completion.', 'Order Fulfillment para sa orders na ihahanda o ide-deliver.', 'I-enable ito para sa preparation, pickup, o delivery completion.', 'Order Fulfillment para sa orders nga andamon o i-deliver.', 'I-enable kini para sa preparation, pickup, o delivery completion.'),
  branch_transfer: _adminHelpText('Stock Transfer moves inventory between branches.', 'Use this module when a business has multiple branches and needs source/target stock updates.', 'Stock Transfer para ilipat ang inventory sa ibang branch.', 'Gamitin ito kung may multiple branches at kailangan ng source/target stock updates.', 'Stock Transfer para ibalhin ang inventory sa laing branch.', 'Gamita kini kung naay multiple branches ug kinahanglan og source/target stock updates.'),
  vendor_payments: _adminHelpText('Vendor Payments records supplier payments.', 'Enable this module when stores need payment logging and supplier payment reports.', 'Vendor Payments para sa bayad sa suppliers.', 'I-enable ito kung kailangan ng payment logging at supplier payment reports.', 'Vendor Payments para sa bayad sa suppliers.', 'I-enable kini kung kinahanglan og payment logging ug supplier payment reports.'),
  customer_returns: _adminHelpText('Customer Returns handles returned items.', 'Use this module when stores need return records and inventory updates from returns.', 'Customer Returns para sa items na binalik ng customer.', 'Gamitin ito kung kailangan ng return records at inventory updates.', 'Customer Returns para sa items nga gibalik sa customer.', 'Gamita kini kung kinahanglan og return records ug inventory updates.'),
  discounts_promotions: _adminHelpText('Discounts / Promotions manages offers and discounts.', 'Enable this module when owners need promo setup and reporting.', 'Discounts / Promotions para sa offers at discounts.', 'I-enable ito kung kailangan ng promo setup at reporting.', 'Discounts / Promotions para sa offers ug discounts.', 'I-enable kini kung kinahanglan og promo setup ug reporting.'),
  voids: _adminHelpText('Voids records cancelled or reversed transactions.', 'Use this module to keep cancellations controlled and auditable.', 'Voids para sa cancelled transactions.', 'Gamitin ito para controlled at may audit trail ang cancellations.', 'Voids para sa cancelled transactions.', 'Gamita kini aron controlled ug naay audit trail ang cancellations.'),
  staff_management: _adminHelpText('Staff Management controls staff accounts and access.', 'Use this module when a store needs staff users, role assignment, and access control.', 'Staff Management para sa accounts at access ng staff.', 'Gamitin ito kung kailangan ng staff users, roles, at access control.', 'Staff Management para sa accounts ug access sa staff.', 'Gamita kini kung kinahanglan og staff users, roles, ug access control.'),
  approvals: _adminHelpText('Approvals routes sensitive actions for manager or owner decision.', 'Enable this module when workflows need approve/reject control.', 'Approvals para sa actions na kailangan ng approval.', 'I-enable ito kung kailangan ng approve/reject control.', 'Approvals para sa actions nga kinahanglan og approval.', 'I-enable kini kung kinahanglan og approve/reject control.'),
  hq_control_center: _adminHelpText('HQ Control Center monitors multiple branches from one view.', 'Use this module for businesses that need branch comparison and central control.', 'HQ Control Center para bantayan ang maraming branches.', 'Gamitin ito para sa branch comparison at central control.', 'HQ Control Center para bantayan ang daghang branches.', 'Gamita kini para sa branch comparison ug central control.'),
  notification_delivery: _adminHelpText('Notification Delivery sends important alerts and updates.', 'Use this module to confirm alerts can reach owners and staff.', 'Notification Delivery para ipadala ang alerts at updates.', 'Gamitin ito para siguraduhin na umaabot ang alerts sa owners at staff.', 'Notification Delivery para ipadala ang alerts ug updates.', 'Gamita kini aron masiguro nga maabot ang alerts sa owners ug staff.'),
  alert_rules_engine: _adminHelpText('Alerts Engine checks business conditions and raises warnings.', 'Use this module to support low-stock, branch, and workflow alerts.', 'Alerts Engine para mag-check ng conditions at warnings.', 'Gamitin ito para sa low-stock, branch, at workflow alerts.', 'Alerts Engine para mo-check sa conditions ug warnings.', 'Gamita kini para sa low-stock, branch, ug workflow alerts.'),
  activity_log: _adminHelpText('Activity Logs keep a record of important store actions.', 'Use this module to support audit history, staff activity, and troubleshooting.', 'Activity Logs ang record ng importanteng actions.', 'Gamitin ito para sa audit history, staff activity, at troubleshooting.', 'Activity Logs ang record sa importanteng actions.', 'Gamita kini para sa audit history, staff activity, ug troubleshooting.'),
  settings: _adminHelpText('Settings controls store defaults and configuration.', 'Use this module when stores need configurable payment, tax, user, and app defaults.', 'Settings para sa defaults at configuration ng store.', 'Gamitin ito para sa payment, tax, user, at app defaults.', 'Settings para sa defaults ug configuration sa store.', 'Gamita kini para sa payment, tax, user, ug app defaults.'),
  support: _adminHelpText('Help & Support gives the store a support path.', 'Enable this module when the store should access help information or send support requests.', 'Help & Support para sa tulong at support requests.', 'I-enable ito kung kailangan ng store ng help information o support request.', 'Help & Support para sa tabang ug support requests.', 'I-enable kini kung kinahanglan sa store og help information o support request.')
};

function _adminModuleHelpData(code, name, desc) {
  var key = _moduleCodeKey(code || name || '');
  var aliases = {
    sales_pos: 'quick_sell',
    cashier: 'quick_sell',
    receipts: 'quick_sell',
    basic_reports: 'reports',
    inventory_movements: 'inventory',
    restock_requests: 'purchase_requisitions',
    branch_transfers: 'branch_transfer',
    stock_transfer: 'branch_transfer',
    returns: 'customer_returns',
    promotions: 'discounts_promotions',
    internal_chat: 'support',
    monitors: 'reports'
  };
  var mapped = aliases[key] || key;
  if (ADMIN_MODULE_HELP[mapped]) return ADMIN_MODULE_HELP[mapped];
  var title = name || String(code || 'Module').replace(/_/g, ' ');
  var detail = desc || (title + ' supports one store operation or workflow.');
  return _adminHelpText(
    title + ' is an operational module available to store owners.',
    'Use this Admin view to confirm whether ' + title + ' is included in a bundle or available as an add-on. ' + detail,
    title + ' ay operational module na maaaring gamitin ng store owner.',
    'Gamitin ang Admin view para i-confirm kung kasama sa bundle o available bilang add-on ang ' + title + '.',
    title + ' usa ka operational module nga magamit sa store owner.',
    'Gamita ang Admin view aron i-confirm kung apil sa bundle o available isip add-on ang ' + title + '.'
  );
}

function _adminModuleHelpButton(code, name, desc, tone) {
  var colors = tone === 'addon'
    ? '#fed7aa;background:#fff7ed;color:#9a3412;'
    : tone === 'catalog'
      ? '#bfdbfe;background:#eff6ff;color:#1d4ed8;'
      : '#bbf7d0;background:#ecfdf5;color:#065f46;';
  return '<button type="button" title="Help" aria-label="Help for ' + _esc(name || code) + '" onclick="event.preventDefault();event.stopPropagation();showAdminModuleHelp(\'' + _jsStr(code) + '\',\'' + _jsStr(name) + '\',\'' + _jsStr(desc) + '\')" style="border:1px solid ' + colors + 'border-radius:999px;width:28px;height:28px;font-weight:900;font-size:13px;line-height:1;">?</button>';
}

function showAdminModuleHelp(code, name, desc, lang) {
  lang = lang || 'en';
  var help = _adminModuleHelpData(code, name, desc);
  var data = help[lang] || help.en;
  var labels = {
    en: { title: 'Admin Module Help', what: 'What this module is for', how: 'How to use it' },
    tl: { title: 'Tulong sa Admin Module', what: 'Para saan ang module na ito', how: 'Paano gamitin' },
    ceb: { title: 'Tabang sa Admin Module', what: 'Para asa kini nga module', how: 'Unsaon paggamit' }
  };
  var l = labels[lang] || labels.en;
  var modal = document.getElementById('admin-module-help-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'admin-module-help-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.66);z-index:980;display:flex;align-items:flex-end;justify-content:center;padding:0 12px 12px;';
    modal.addEventListener('click', function(e) { if (e.target === modal) closeAdminModuleHelp(); });
    document.body.appendChild(modal);
  }
  function tab(codeLang, text) {
    var active = codeLang === lang;
    return '<button onclick="showAdminModuleHelp(\'' + _jsStr(code) + '\',\'' + _jsStr(name) + '\',\'' + _jsStr(desc) + '\',\'' + codeLang + '\')" style="border:1px solid ' + (active ? '#2563eb' : '#dbe3ef') + ';background:' + (active ? '#2563eb' : '#fff') + ';color:' + (active ? '#fff' : '#334155') + ';border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;">' + text + '</button>';
  }
  modal.innerHTML =
    '<div style="width:100%;max-width:560px;background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden;">' +
    '<div style="background:#1e3a5f;color:#fff;padding:16px 18px;">' +
    '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">' +
    '<div><div style="font-size:12px;opacity:.78;font-weight:700;">' + l.title + '</div>' +
    '<div style="font-size:20px;font-weight:900;line-height:1.2;">' + _esc(name || code || 'Module') + '</div>' +
    (code ? '<div style="font-size:11px;opacity:.72;margin-top:3px;font-family:monospace;">' + _esc(code) + '</div>' : '') + '</div>' +
    '<button onclick="closeAdminModuleHelp()" style="border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:10px;width:36px;height:36px;font-size:20px;">&times;</button>' +
    '</div></div>' +
    '<div style="padding:14px 18px 18px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' + tab('en','English') + tab('tl','Tagalog') + tab('ceb','Cebuano') + '</div>' +
    '<div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:10px;background:#f8fafc;">' +
    '<div style="font-size:12px;font-weight:900;color:#1d4ed8;margin-bottom:6px;">' + l.what + '</div>' +
    '<div style="font-size:14px;line-height:1.55;color:#111827;">' + _esc(data.what) + '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;background:#fff;">' +
    '<div style="font-size:12px;font-weight:900;color:#16a34a;margin-bottom:6px;">' + l.how + '</div>' +
    '<div style="font-size:14px;line-height:1.55;color:#111827;">' + _esc(data.how) + '</div></div>' +
    '</div></div>';
}

function closeAdminModuleHelp() {
  var modal = document.getElementById('admin-module-help-modal');
  if (modal) modal.remove();
}

//  Login 

function renderAdminLogin(msg) {
  _app('<div class="screen">' +
    '<div style="text-align:center;padding:32px 0 20px;">' +
    '<div style="margin-bottom:10px;">' + _planLogoHtml('NEGOSYO_HUB') + '</div>' +
    '<h2 style="color:#1e3a5f;margin-top:8px;">' + (localStorage.getItem('admin_platform_name') || 'HubSuite') + '</h2>' +
    '<div class="muted">HubSuite Admin Panel</div></div>' +
    '<form class="card" onsubmit="submitAdminLogin(); return false;">' +
    (msg ? '<div class="msg-err">' + msg + '</div>' : '') +
    '<div class="field"><label>Username</label><input id="a-user" placeholder="Admin username"></div>' +
    '<div class="field"><label>Password</label><input id="a-pass" type="password" placeholder="Password" autocomplete="current-password"></div>' +
    '<label style="display:flex;align-items:center;gap:8px;margin:-4px 0 12px;color:#475569;font-size:13px;"><input id="a-show-pass" type="checkbox" onchange="toggleAdminPasswordVisibility()"> Show password</label>' +
    '<button class="btn btn-primary" type="submit">Login</button>' +
    '</form></div>');
  document.getElementById('a-pass').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') submitAdminLogin();
  });
}


function toggleAdminPasswordVisibility() {
  var pw = document.getElementById('a-pass');
  var cb = document.getElementById('a-show-pass');
  if (!pw || !cb) return;
  pw.type = cb.checked ? 'text' : 'password';
}

async function submitAdminLogin() {
  var username = (document.getElementById('a-user').value || '').trim();
  var password = document.getElementById('a-pass').value;
  if (!username || !password) { _toast('Enter username and password', true); return; }
  _app('<div style="text-align:center;padding:80px 20px;color:#6b7280;">Logging in</div>');
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
  // Instant  no network wait
  ADMIN_API.clearToken();
  adminState.admin  = null;
  adminState.stores = [];
  renderAdminLogin();
}

//  Dashboard 

function renderDashboard() {
  var stores   = adminState.stores;
  var activeStores = stores.filter(function(st) { return _storeStatus(st) !== 'ARCHIVED'; });
  var archivedStores = stores.filter(function(st) { return _storeStatus(st) === 'ARCHIVED'; });
  var statuses = activeStores.map(_storeStatus);
  var counts   = {
    total:     activeStores.length,
    trial:     statuses.filter(function(s) { return s === 'TRIAL'; }).length,
    active:    statuses.filter(function(s) { return s === 'ACTIVE'; }).length,
    expired:   statuses.filter(function(s) { return s === 'EXPIRED'; }).length,
    suspended: statuses.filter(function(s) { return s === 'SUSPENDED'; }).length,
    archived:  archivedStores.length
  };
  var mrr = activeStores.reduce(function(sum, st) {
    return sum + (Number(st.Monthly_Fee) || 0);
  }, 0);

  var storeRows = activeStores.map(function(st) {
    var i = adminState.stores.indexOf(st);
    var status = _storeStatus(st);
    var autoRenew = String(st.Auto_Renew_Trial || '').toLowerCase() === 'true';
    var sub = st.Trial_End && status === 'TRIAL'
      ? 'Trial ends ' + String(st.Trial_End).substring(0, 10)
      : st.Subscription_Expires
        ? 'Expires ' + String(st.Subscription_Expires).substring(0, 10)
        : 'No subscription set';
    return '<div class="store-row" onclick="renderStoreDetail(' + i + ')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div><div style="font-size:14px;font-weight:bold;">' + st.Store_Name + '</div>' +
        '<div class="muted" style="font-size:12px;">' + (st.Owner_Name || 'No owner') + '  ' + _esc(_planLabel(st.Plan || '')) + '  ' + sub + '</div>' +
        (st.Business_Type_Label || st.Business_Type ? '<div class="muted" style="font-size:11px;">Business type: ' + _esc(st.Business_Type_Label || st.Business_Type) + '</div>' : '') + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">' +
      _badgeHtml(status) +
      '<label onclick="event.stopPropagation();" style="display:flex;align-items:center;gap:5px;font-size:11px;color:#475569;font-weight:800;">' +
      '<input type="checkbox" ' + (autoRenew ? 'checked' : '') + ' onchange="_toggleAutoRenewTrial(event,\'' + st.Store_ID + '\')"> Auto trial</label>' +
      '</div></div></div>';
  }).join('');
  var archivedOptions = archivedStores.map(function(st) {
    return '<option value="' + _esc(st.Store_ID) + '">' + _esc(st.Store_Name || st.Store_ID) + ' - ' + _esc(st.Owner_Name || 'No owner') + '</option>';
  }).join('');
  var archivePanel = '<div class="card">' +
    '<div class="section-title">Archived Stores (' + archivedStores.length + ')</div>' +
    '<div class="hint" style="margin-bottom:8px;">Archived stores are hidden from the active dashboard. Reactivate to continue where the store left off.</div>' +
    (archivedStores.length
      ? '<select id="archived-store-select" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;"><option value="">Select archived store</option>' + archivedOptions + '</select>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<button class="btn btn-secondary" style="margin:0;" onclick="_openArchivedStore()">Open</button>' +
        '<button class="btn btn-success" style="margin:0;" onclick="_reactivateArchivedStore()">Reactivate</button>' +
        '</div>'
      : '<div class="muted">No archived stores.</div>') +
    '</div>';

  _app('<div class="screen">' +
    _topbar('HubSuite Admin') +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">' +
    '<button type="button" class="logout-btn btn-primary" onclick="adminLogout()">Logout</button></div>' +

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
     '<button class="btn btn-secondary" style="margin:0;" onclick="renderPlatformSettings()">Settings</button>' +
     '<button class="btn btn-secondary" style="margin:0;" onclick="renderModuleCatalog()">Modules</button>' +
     '<button class="btn btn-secondary" style="margin:0;" onclick="renderHealthMonitor()">Health Monitor</button>' +
     '<button class="btn btn-secondary" style="margin:0;position:relative;" id="msg-btn" onclick="renderMessagesInbox()">Messages</button>' +
     '<button class="btn btn-secondary" style="margin:0;grid-column:1 / -1;" onclick="refreshDashboard()">Refresh Store List</button>' +
     '</div>' +

    '<div class="card">' +
    '<div class="section-title">Active Stores</div>' +
    (storeRows || '<div class="muted">No active stores. Create one above or reactivate an archived store.</div>') +
    '</div>' +
    archivePanel +
    '</div>');
}

//  Store Detail 

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
    (st.Business_Type_Label || st.Business_Type ? '<div> Business Type: <strong>' + _esc(st.Business_Type_Label || st.Business_Type) + '</strong></div>' : '') +
    '<div> ' + (st.Owner_Email || '') + '</div>' +
    '<div> ' + (st.Owner_Phone || '') + '</div>' +
    '<div> Owner login: <strong>' + _esc(st.Owner_Username || 'owner') + '</strong></div>' +
    '<div> Plan: <strong>' + _esc(_planLabel(plan)) + '</strong> (Negotiable)</div>' +
    (status === 'TRIAL' ? '<div> Trial ends: <strong>' + (String(st.Trial_End || '').substring(0, 10) || '') + '</strong></div>' : '') +
    '<div> Expires: <strong>' + (String(st.Subscription_Expires || '').substring(0, 10) || '') + '</strong></div>' +
    '</div>' +

    '<div style="margin-top:12px;background:#f9fafb;border-radius:8px;padding:10px;">' +
    '<div style="font-size:11px;font-weight:bold;color:#6b7280;margin-bottom:4px;">PWA Link (share with store owner)</div>' +
    '<div style="font-size:12px;word-break:break-all;color:#1d4ed8;">' + pwaDomain + '</div>' +
    '<div style="font-size:11px;font-weight:bold;color:#6b7280;margin-top:6px;margin-bottom:2px;">API Key</div>' +
    '<div style="font-size:12px;color:#374151;word-break:break-all;">' + st.API_Key + '</div>' +
    '<div style="font-size:11px;font-weight:bold;color:#6b7280;margin-top:6px;margin-bottom:2px;">Database Provider</div>' +
    '<div style="font-size:12px;color:#374151;">' + _esc(String(st.DB_Provider || 'libsql').toUpperCase()) +
      (st.D1_Binding ? '  ' + _esc(st.D1_Binding) : '') + '</div>' +
    '</div></div>' +

    '<div class="card">' +
    '<div class="section-title"> Owner Login Credentials</div>' +
    '<div class="hint" style="margin-bottom:10px;">Use this if the owner reports invalid username or password. It updates the login for this exact store link.</div>' +
    '<div class="field"><label>Owner Username</label><input id="owner-login-user" value="' + _esc(st.Owner_Username || 'owner') + '" placeholder="owner"></div>' +
    '<div class="field"><label>New Owner Password</label><input id="owner-login-pass" type="password" placeholder="Enter new password"></div>' +
    '<button class="btn btn-primary" onclick="_saveOwnerLogin(\'' + st.Store_ID + '\')">Save Owner Login</button>' +
    '</div>' +

    //  Extend trial 
    '<div class="card">' +
    '<div class="section-title"> Extend Trial</div>' +
    '<div class="field"><label>Extra days</label>' +
    '<input id="ext-days" type="number" min="1" value="30" placeholder="30"></div>' +
    '<button class="btn btn-secondary" onclick="_extendTrial(\'' + st.Store_ID + '\')">Extend Trial</button>' +
    '</div>' +

    //  Record payment 
    '<div class="card">' +
    '<div class="section-title"> Record Payment</div>' +
    '<div class="field"><label>Months paid</label>' +
    '<input id="pay-months" type="number" min="1" value="1"></div>' +
    '<div class="field"><label>Amount ()</label>' +
    '<input id="pay-amount" type="number" min="0" value="' + (st.Monthly_Fee || 0) + '"></div>' +
    '<div class="field"><label>GCash Reference #</label>' +
    '<input id="pay-ref" placeholder="e.g. 1234567890"></div>' +
    '<div class="field"><label>Notes</label>' +
    '<input id="pay-notes" placeholder="Optional notes"></div>' +
    '<button class="btn btn-success" onclick="_recordPayment(\'' + st.Store_ID + '\')">Confirm Payment</button>' +
    '</div>' +

    //  Change plan 
    (function() {
      var existingCustomModules = [];
      try {
        var rawMods = st.Custom_Modules;
        if (rawMods) existingCustomModules = JSON.parse(rawMods);
      } catch(e) {}
      var existingModsJson = _esc(JSON.stringify(existingCustomModules));
      return '<div class="card">' +
        '<div class="section-title"> Change Plan</div>' +
        '<div class="field"><label>Hub Plan</label>' +
        '<select id="chg-plan" onchange="_onChangePlanChange(' + existingModsJson + ')">' +
        _hubPlanOptions(plan).map(function(opt) {
          return '<option value="' + opt.value + '"' + (opt.value === plan ? ' selected' : '') + '>' + _esc(opt.label) + '</option>';
        }).join('') +
        '</select></div>' +
        '<div id="chg-custom-card" style="display:' + (plan === 'CUSTOM' ? '' : 'none') + ';">' +
        '<div class="hint" style="margin-bottom:8px;">All 17 selected = 1,000/mo  Minimum 200/mo</div>' +
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:14px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span>Computed monthly fee</span><strong id="chg-custom-modules-fee">200/mo</strong>' +
        '</div>' +
        '<div id="chg-custom-modules"></div>' +
        '<div class="field" style="margin-top:8px;"><label>Monthly Fee Override ()  0 = computed</label>' +
        '<input id="chg-fee" type="number" min="0" value="0"></div>' +
        '</div>' +
        '<div class="hint" style="margin-bottom:8px;">Owners can add more modules from their dashboard after provisioning.</div>' +
        '<button class="btn btn-primary" style="margin-top:8px;" onclick="_changePlan(\'' + st.Store_ID + '\')">Save Plan</button>' +
        '<button class="btn btn-secondary" style="margin-top:8px;" onclick="_repairStaffAccess(\'' + st.Store_ID + '\',\'' + plan + '\')">Repair Staff Access</button>' +
        '<div class="hint" style="margin-top:6px;">Use repair if Owner/Staff say the backend is still blocking access.</div>' +
        '</div>';
    })() +

    '<div class="card">' +
    '<div class="section-title"> Store Add-On Modules</div>' +
    '<div class="hint" style="margin-bottom:10px;">Tick add-on modules that should be active for this store. These appear in the owner dashboard after saving.</div>' +
    '<div id="store-addons-card"><div class="muted">Loading add-ons...</div></div>' +
    '<button class="btn btn-primary" style="margin-top:8px;" onclick="_saveStoreAddOns(\'' + st.Store_ID + '\')">Save Store Add-Ons</button>' +
    '</div>' +

    _renderPlanInclusionsCard(plan) +

    '<div id="store-commercial-state"></div>' +

    //  Suspend / Activate 
    '<div class="card">' +
    '<div class="section-title"> Store Status</div>' +
    (status === 'ARCHIVED'
      ? '<button class="btn btn-success" onclick="_reactivateStore(\'' + st.Store_ID + '\')">Reactivate Store</button>'
      : (status === 'SUSPENDED'
        ? '<button class="btn btn-success" onclick="_toggleStatus(\'' + st.Store_ID + '\',\'ACTIVE\')"> Activate Store</button>'
        : '<button class="btn btn-danger"  onclick="_toggleStatus(\'' + st.Store_ID + '\',\'SUSPENDED\')"> Suspend Store</button>') +
        '<button class="btn btn-secondary" style="margin-top:8px;" onclick="_archiveStore(\'' + st.Store_ID + '\')">Archive Store</button>') +
    '</div>' +

    //  Repair Toolkit 
    '<div class="card">' +
    '<div class="section-title"> Repair Toolkit</div>' +
    '<div class="hint" style="margin-bottom:10px;">Use these when an owner reports a feature is broken. Each repair re-runs schema migration for that module. Safe to run multiple times.</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'staff_management\')"> Staff Access</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'custom_role_builder\')"> Custom Roles</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'activity_log\')"> Activity Log</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'approvals\')"> Approvals</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'suppliers\')"> Suppliers</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'purchase_orders\')"> Purchase Orders</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'branch_transfer\')"> Branch Transfers</button>' +
    '<button class="btn btn-secondary" style="font-size:12px;padding:10px;" onclick="_repairModule(\'' + st.Store_ID + '\',\'internal_chat\')"> Internal Chat</button>' +
    '</div>' +
    '<button class="btn btn-primary" style="margin-bottom:8px;" onclick="_migrateStore(\'' + st.Store_ID + '\')"> Full Migration (All Tables)</button>' +
    '</div>' +

    //  Activity Log 
    '<div class="card">' +
    '<div class="section-title"> Activity Log</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
    '<select id="al-module" style="flex:1;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">' +
    '<option value="">All modules</option>' +
    '<option value="auth">Auth</option><option value="products">Products</option>' +
    '<option value="inventory">Inventory</option><option value="expenses">Expenses</option>' +
    '<option value="quick_sell">Quick Sell</option><option value="staff_management">Staff</option>' +
    '<option value="custom_role_builder">Custom Roles</option><option value="approvals">Approvals</option>' +
    '<option value="suppliers">Suppliers</option><option value="purchase_orders">Purchase Orders</option>' +
    '<option value="reports">Reports</option>' +
    '</select>' +
    '<button class="btn btn-secondary" style="width:auto;padding:8px 14px;font-size:13px;" onclick="_loadActivityLog(\'' + st.Store_ID + '\')">Load</button>' +
    '</div>' +
    '<div id="activity-log-area"><div class="muted" style="font-size:12px;">Press Load to view recent activity.</div></div>' +
    '</div>' +

    //  Custom Roles 
    '<div class="card">' +
    '<div class="section-title"> Custom Roles</div>' +
    '<button class="btn btn-secondary" style="margin-bottom:10px;" onclick="_loadCustomRoles(\'' + st.Store_ID + '\')">Load Roles</button>' +
    '<div id="custom-roles-area"><div class="muted" style="font-size:12px;">Press Load to view roles defined for this store.</div></div>' +
    '</div>' +

    //  DB Management 
    '<div class="card">' +
    '<div class="section-title"> Database Management</div>' +
    '<div class="field"><label>Dedicated D1 Binding</label><input id="d1-binding" placeholder="e.g. STORE_DB_DEMO" value="' + _esc(st.D1_Binding || '') + '"></div>' +
    '<div class="field"><label><input type="checkbox" id="d1-activate"> Activate dedicated DB after successful copy</label></div>' +
    '<button class="btn btn-primary" onclick="_copyStoreToDedicatedDb(\'' + st.Store_ID + '\')">Copy To Dedicated D1</button>' +
    '<div class="hint">Use one D1 binding per store if you want strict database isolation.</div>' +
    '</div></div>');
  _loadStoreCommercialState(st.Store_ID, plan);
  if (plan === 'CUSTOM') {
    var rawMods2 = st.Custom_Modules;
    var initMods = [];
    try { if (rawMods2) initMods = JSON.parse(rawMods2); } catch(e) {}
    _renderCustomModuleSelector('chg-custom-modules', initMods);
  }
  _loadStoreAddOns(st.Store_ID, plan);
}

function _onChangePlan() {
  return;
}

async function _saveOwnerLogin(storeId) {
  var username = (document.getElementById('owner-login-user').value || '').trim();
  var password = document.getElementById('owner-login-pass').value || '';
  if (!username) { _toast('Owner username is required', true); return; }
  if (password.length < 4) { _toast('Owner password must be at least 4 characters', true); return; }
  try {
    await ADMIN_API.call('adminUpdateStore', {
      storeId: storeId,
      patch: {
        Owner_Username: username,
        Owner_Password: password
      }
    });
    adminState.stores = await ADMIN_API.call('adminGetStores');
    _toast('Owner login saved. Ask the owner to log out, reopen the store link, and use the new credentials.');
    var idx = adminState.stores.findIndex(function(s) { return String(s.Store_ID) === String(storeId); });
    if (idx >= 0) renderStoreDetail(idx);
  } catch(e) {
    _toast(e.message || 'Failed to save owner login', true);
  }
}

async function _loadStoreAddOns(storeId, plan) {
  try {
    var active = await ADMIN_API.call('adminGetStoreAddOns', { storeId: storeId });
    var selected = (active || []).map(function(sub) { return sub.module_code || sub.code || sub.id; }).filter(Boolean);
    _renderAddOnSelector('store-addons-card', plan, selected);
  } catch(e) {
    var el = document.getElementById('store-addons-card');
    if (el) el.innerHTML = '<div class="msg-err">Could not load add-ons: ' + _esc(e.message) + '</div>';
  }
}

async function _saveStoreAddOns(storeId) {
  var selected = _selectedModulesFromForm('store-addons-card');
  try {
    await ADMIN_API.call('adminSetStoreAddOns', { storeId: storeId, moduleCodes: selected });
    _toast('Store add-ons saved. Ask owner to reopen or refresh the dashboard.');
    await _refreshStores();
  } catch(e) {
    _toast(e.message || 'Failed to save add-ons', true);
  }
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
      'Suggested price: ' + result.suggestedPrice + '/mo';
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

async function _toggleAutoRenewTrial(event, storeId) {
  var checked = !!(event && event.target && event.target.checked);
  try {
    await ADMIN_API.call('adminUpdateStore', {
      storeId: storeId,
      patch: { Auto_Renew_Trial: String(checked) }
    });
    await _refreshStores();
    _toast(checked ? 'Auto-renew trial enabled' : 'Normal monthly subscription enabled');
    renderDashboard();
  } catch(e) {
    if (event && event.target) event.target.checked = !checked;
    _toast(e.message || 'Could not update trial setting', true);
  }
}

async function _changePlan(storeId) {
  var plan = document.getElementById('chg-plan').value;
  var patch = { Plan: plan };
  var apiData = { storeId: storeId, patch: patch };
  if (plan === 'CUSTOM') {
    var selectedMods = _selectedModulesFromForm('chg-custom-modules');
    var feeOverride = Number((document.getElementById('chg-fee') || {}).value) || 0;
    patch.Monthly_Fee           = feeOverride > 0 ? feeOverride : _computeCustomFee(selectedMods);
    patch.Max_Users             = -1;
    patch.Max_Products          = -1;
    patch.Reports_Level         = 'ALL';
    patch.Has_Health_Indicators = 'true';
    apiData.customModules = selectedMods;
  } else {
    var modulePayload = _moduleSyncPayload(plan, []);
    _applyModulePatchFields(patch, modulePayload);
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
    await ADMIN_API.call('adminUpdateStore', apiData);
    _toast('Plan updated to ' + _planLabel(plan));
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message, true); }
}

async function _repairStaffAccess(storeId, planId) {
  var plan = planId || (document.getElementById('chg-plan') && document.getElementById('chg-plan').value) || 'NEGOSYO_HUB';
  var patch = { Plan: plan };
  var modulePayload = _moduleSyncPayload(plan, []);
  _applyModulePatchFields(patch, modulePayload);
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
    try { await ADMIN_API.call('adminMigrateStore', { storeId: storeId }); } catch(migErr) {}
    _toast('Staff access repair saved and migration triggered. Ask the owner to log out and back in.');
    await _refreshStores();
    renderDashboard();
  } catch(e) {
    _toast(e.message, true);
  }
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

async function _archiveStore(storeId) {
  if (!confirm('Archive this store? It will be hidden from the active dashboard but can be reactivated later.')) return;
  try {
    await ADMIN_API.call('adminArchiveStore', { storeId: storeId });
    _toast('Store archived');
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message || 'Could not archive store', true); }
}

async function _reactivateStore(storeId) {
  try {
    await ADMIN_API.call('adminReactivateStore', { storeId: storeId });
    _toast('Store reactivated');
    await _refreshStores();
    renderDashboard();
  } catch(e) { _toast(e.message || 'Could not reactivate store', true); }
}

function _selectedArchivedStoreId() {
  var el = document.getElementById('archived-store-select');
  return el ? el.value : '';
}

function _openArchivedStore() {
  var storeId = _selectedArchivedStoreId();
  if (!storeId) { _toast('Select an archived store first', true); return; }
  var idx = adminState.stores.findIndex(function(st) { return String(st.Store_ID) === String(storeId); });
  if (idx >= 0) renderStoreDetail(idx);
}

async function _reactivateArchivedStore() {
  var storeId = _selectedArchivedStoreId();
  if (!storeId) { _toast('Select an archived store first', true); return; }
  await _reactivateStore(storeId);
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

async function _repairModule(storeId, moduleId) {
  var label = {
    staff_management: 'Staff Access', custom_role_builder: 'Custom Roles',
    activity_log: 'Activity Log', approvals: 'Approvals', suppliers: 'Suppliers',
    purchase_orders: 'Purchase Orders', branch_transfer: 'Branch Transfers',
    internal_chat: 'Internal Chat'
  }[moduleId] || moduleId;
  try {
    await ADMIN_API.call('adminRepairStoreModule', { storeId: storeId, moduleId: moduleId });
    _toast(label + ' repaired. Ask owner to log out and back in.');
  } catch(e) { _toast('Repair failed: ' + e.message, true); }
}

async function _loadActivityLog(storeId) {
  var module = (document.getElementById('al-module') && document.getElementById('al-module').value) || '';
  var area = document.getElementById('activity-log-area');
  if (!area) return;
  area.innerHTML = '<div class="muted" style="font-size:12px;">Loading</div>';
  try {
    var result = await ADMIN_API.call('adminGetStoreActivityLog', { storeId: storeId, module: module || null, limit: 100 });
    var logs = result.logs || [];
    if (!logs.length) { area.innerHTML = '<div class="muted" style="font-size:12px;">No activity found.</div>'; return; }
    var actColors = { login_success: '#dcfce7', login_failed: '#fee2e2', sale_created: '#dbeafe', product_created: '#fef9c3', staff_created: '#e9d5ff' };
    area.innerHTML = '<div style="max-height:320px;overflow-y:auto;">' +
      logs.map(function(l) {
        var bg = actColors[l.action] || '#f9fafb';
        var time = String(l.created_at || '').substring(0, 16).replace('T', ' ');
        return '<div style="padding:6px 8px;border-bottom:1px solid #f3f4f6;background:' + bg + ';border-radius:6px;margin-bottom:3px;">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;">' +
          '<span style="font-weight:700;color:#374151;">' + _esc(l.module) + '  ' + _esc(l.action) + '</span>' +
          '<span style="color:#6b7280;">' + time + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#111;">' + _esc(l.summary || '') + '</div>' +
          '<div style="font-size:11px;color:#9ca3af;">By: ' + _esc(l.username || l.user_id || '?') + ' (' + _esc(l.role || '') + ')' +
          (l.target_id ? '  Target: ' + _esc(l.target_id) : '') + '</div>' +
          '</div>';
      }).join('') +
      '</div>';
  } catch(e) {
    area.innerHTML = '<div class="msg-err" style="font-size:12px;">Failed: ' + _esc(e.message) + '</div>';
  }
}

async function _loadCustomRoles(storeId) {
  var area = document.getElementById('custom-roles-area');
  if (!area) return;
  area.innerHTML = '<div class="muted" style="font-size:12px;">Loading</div>';
  try {
    var result = await ADMIN_API.call('adminGetStoreCustomRoles', { storeId: storeId });
    var roles = result.roles || [];
    if (!roles.length) { area.innerHTML = '<div class="muted" style="font-size:12px;">No custom roles defined yet.</div>'; return; }
    area.innerHTML = roles.map(function(r) {
      var perms = (r.permissions || []).slice(0, 6);
      var more = r.permissions.length - perms.length;
      return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
        '<div>' +
        '<div style="font-weight:700;font-size:13px;">' + _esc(r.name) + '</div>' +
        (r.description ? '<div style="font-size:11px;color:#6b7280;">' + _esc(r.description) + '</div>' : '') +
        '</div>' +
        '<span style="background:#e9d5ff;color:#6d28d9;font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600;">' + (r.member_count || 0) + ' member' + (r.member_count !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">' +
        perms.map(function(p) { return '<span style="background:#f3f4f6;font-size:10px;padding:1px 6px;border-radius:6px;">' + _esc(p) + '</span>'; }).join('') +
        (more > 0 ? '<span style="background:#f3f4f6;font-size:10px;padding:1px 6px;border-radius:6px;color:#6b7280;">+' + more + ' more</span>' : '') +
        '</div>' +
        '</div>';
    }).join('');
  } catch(e) {
    area.innerHTML = '<div class="msg-err" style="font-size:12px;">Failed: ' + _esc(e.message) + '</div>';
  }
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
  try { adminState.stores = await ADMIN_API.call('adminGetStores'); return true; } catch(e) { _toast('Could not refresh stores: ' + e.message, true); return false; }
}

async function refreshDashboard() {
  _app('<div style="text-align:center;padding:80px 20px;color:#6b7280;">Refreshing stores...</div>');
  await _refreshStores();
  renderDashboard();
}

//  Create Store 

function renderCreateStore(msg) {
  _app('<div class="screen">' +
    _topbar(' Create New Store', 'renderDashboard()') +

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
    '<div class="section-title">Custom Plan  Module Selection</div>' +
    '<div class="hint" style="margin-bottom:10px;">Pick the modules this store needs. All 17 selected = 1,000/mo. Minimum charge: 200/mo.</div>' +
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:14px;display:flex;justify-content:space-between;align-items:center;">' +
    '<span>Computed monthly fee</span><strong id="cs-custom-modules-fee">200/mo</strong>' +
    '</div>' +
    '<div id="cs-custom-modules"></div>' +
    '<div class="field" style="margin-top:10px;"><label>Monthly Fee Override ()  0 = use computed price</label>' +
    '<input id="cs-fee" type="number" min="0" value="0"></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="field"><label>Notes (internal only)</label>' +
    '<textarea id="cs-notes" placeholder="Any notes about this store"></textarea></div>' +
    '<button class="btn btn-primary" onclick="submitCreateStore()"> Provision Store</button>' +
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
    document.getElementById('cs-suggested').textContent = 'Suggested: ' + r.suggestedPrice + '/mo';
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

  _app('<div style="text-align:center;padding:80px 20px;color:#6b7280;">Provisioning store<br><small>This may take 10-30 seconds.</small></div>');

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
    _topbar(' Store Created!', 'renderDashboard()') +
    '<div class="card" style="text-align:center;">' +
    '<div style="font-size:48px;margin-bottom:8px;"></div>' +
    '<h3 style="margin-bottom:4px;">' + _esc(r.storeName) + '</h3>' +
    '<div class="muted" style="margin-bottom:16px;">Store provisioned successfully</div>' +

    '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin-bottom:12px;text-align:left;">' +
    '<div style="font-size:12px;font-weight:bold;color:#15803d;margin-bottom:8px;"> PWA Link  send this to the store owner</div>' +
    '<div style="font-size:13px;word-break:break-all;color:#1d4ed8;margin-bottom:0;">' + pwaUrl + '</div>' +
    '</div>' +

    '<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px;margin-bottom:12px;text-align:left;">' +
    '<div style="font-size:12px;font-weight:bold;color:#854d0e;margin-bottom:8px;"> Default Login Credentials</div>' +
    '<div style="font-size:13px;line-height:2.2;">' +
    '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #fde047;">' +
    '<span>Username</span><strong style="font-family:monospace;font-size:15px;">' + _esc(r.ownerUsername || 'owner') + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;">' +
    '<span>Password</span><strong style="font-family:monospace;font-size:15px;">' + _esc(r.ownerPassword || '1234') + '</strong></div>' +
    '</div>' +
    '<div style="font-size:11px;color:#92400e;margin-top:8px;"> Remind the owner to change their password after first login.</div>' +
    '</div>' +

    '<div style="background:#f9fafb;border-radius:8px;padding:12px;text-align:left;">' +
    '<div style="font-size:12px;line-height:2;color:#374151;">' +
    '<div> Trial ends: <strong>' + r.trialEnd + '</strong></div>' +
    '<div> Plan: <strong>' + _esc(_planLabel(r.plan)) + '</strong> (Negotiable)</div>' +
    (r.monthlyFee ? '<div> Monthly fee: <strong>' + _money(r.monthlyFee) + ' (Negotiated)</strong></div>' : '') +
    '<div> API Key: <span style="word-break:break-all;font-size:11px;">' + r.apiKey + '</span></div>' +
    '</div></div>' +
    '</div>' +

    '<button class="btn btn-primary" onclick="renderDashboard()">Back to Dashboard</button>' +
    '</div>');
}

//  Platform Settings 

function renderPlatformSettings(msg) {
  var s = adminState.platformSettings || {};
  _app('<div class="screen">' +
    _topbar(' Platform Settings', 'renderDashboard()') +
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
    '<input id="ps-gcash-qr" placeholder="https:// (upload to Drive/Imgur first)" value="' + (s.GCASH_QR_URL || '') + '">' +
    '<div class="hint">Upload your GCash QR image to Google Drive (set to public link) or Imgur, then paste the URL here.</div></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="section-title">Trial Settings</div>' +
    '<div class="field"><label>Default Trial Days for new stores</label>' +
    '<input id="ps-trial" type="number" min="1" value="' + (s.TRIAL_DAYS || 30) + '"></div>' +
    '</div>' +

    '<button class="btn btn-primary" onclick="savePlatformSettings()"> Save Settings</button>' +

    '<div class="card" style="margin-top:12px;">' +
    '<div class="section-title">Change Admin Password</div>' +
    '<div class="field"><label>New Password</label><input id="ps-pw" type="password" placeholder="New password"></div>' +
    '<div class="field"><label>Confirm Password</label><input id="ps-pw2" type="password" placeholder="Repeat password"></div>' +
    '<button class="btn btn-secondary" onclick="changeAdminPassword()"> Change Password</button>' +
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

//  Modules / Bundles

async function renderModuleCatalog() {
  _app('<div class="screen">' + _topbar('Modules', 'renderDashboard()') +
    '<div class="card"><div class="muted">Loading module catalog</div></div></div>');
  try { await _ensureFeatureCatalog(); } catch(e) {}

  var all = _allModuleCatalog();
  var planIds = ['TRIAL', 'NEGOSYO_HUB', 'BUSINESS_HUB', 'NEXORA_HUB', 'CUSTOM'];
  var moduleRows = all.map(function(m, i) {
    var code = _moduleCodeOf(m);
    var name = _moduleNameOf(m);
    var desc = _moduleDescOf(m);
    var price = m.price != null ? 'PHP ' + _esc(String(m.price)) + '/mo' : 'Bundle';
    return '<div style="display:grid;grid-template-columns:34px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6;">' +
      '<div style="font-weight:800;color:#64748b;">' + (i + 1) + '</div>' +
      '<div><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
      '<div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:13px;font-weight:800;color:#111827;">' + _esc(name) + '</span>' + _adminModuleHelpButton(code, name, desc, 'catalog') + '</div>' +
      '<div style="font-family:monospace;font-size:11px;color:#64748b;">' + _esc(code) + '</div></div>' +
      '<div style="white-space:nowrap;font-size:11px;font-weight:800;color:#166534;background:#dcfce7;border-radius:999px;padding:2px 8px;">' + price + '</div>' +
      '</div>' +
      (desc ? '<div class="muted" style="font-size:11px;margin-top:3px;">' + _esc(desc) + '</div>' : '') +
      '</div></div>';
  }).join('');

  var bundleHtml = planIds.map(function(planId) {
    var core = planId === 'CUSTOM' ? all : _planCoreModuleCatalog(planId);
    var addOns = _planAddOnCatalog(planId, _featureCatalog());
    var tier = _planTier(planId) || {};
    var addOnPrice = _addOnPriceForPlan(planId);
    var coreChips = core.map(function(m) {
      var code = _moduleCodeOf(m);
      var name = _moduleNameOf(m);
      var desc = _moduleDescOf(m);
      return '<span style="display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#065f46;border:1px solid #bbf7d0;border-radius:999px;padding:4px 6px 4px 8px;margin:0 4px 6px 0;font-size:11px;font-weight:700;">' + _esc(name) + _adminModuleHelpButton(code, name, desc, 'included') + '</span>';
    }).join('');
    var addOnChips = (planId === 'CUSTOM' ? [] : addOns).map(function(m) {
      var code = _moduleCodeOf(m);
      var name = _moduleNameOf(m);
      var desc = _moduleDescOf(m);
      return '<span style="display:inline-flex;align-items:center;gap:6px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:999px;padding:4px 6px 4px 8px;margin:0 4px 6px 0;font-size:11px;font-weight:700;">' + _esc(name) + _adminModuleHelpButton(code, name, desc, 'addon') + '</span>';
    }).join('');

    return '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px;">' +
      '<div><div class="section-title" style="margin-bottom:2px;">' + _esc(_planLabel(planId)) + '</div>' +
      '<div class="muted" style="font-size:12px;">Base PHP ' + _esc(String(tier.basePrice || 0)) + '/mo' +
      (addOnPrice != null ? '  Add-ons PHP ' + addOnPrice + '/mo each' : '') + '</div></div>' +
      '<div style="font-size:11px;font-weight:800;color:#1d4ed8;background:#dbeafe;border-radius:999px;padding:4px 8px;white-space:nowrap;">' +
      core.length + ' included' + (planId === 'CUSTOM' ? '' : ' / ' + addOns.length + ' add-ons') + '</div>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:800;color:#065f46;margin:10px 0 6px;">Included Bundle</div>' +
      '<div>' + (coreChips || '<span class="muted">No included modules.</span>') + '</div>' +
      (planId === 'CUSTOM'
        ? '<div class="hint" style="margin-top:10px;">Custom / Flexible can select any module from the full catalog.</div>'
        : '<div style="font-size:12px;font-weight:800;color:#9a3412;margin:12px 0 6px;">Available Add-ons</div><div>' + (addOnChips || '<span class="muted">No additional add-ons.</span>') + '</div>') +
      '</div>';
  }).join('');

  _app('<div class="screen">' +
    _topbar('Modules', 'renderDashboard()') +
    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="val">' + all.length + '</div><div class="lbl">Total Modules</div></div>' +
    '<div class="stat-card"><div class="val" style="color:#1d4ed8;">5</div><div class="lbl">Plan Bundles</div></div>' +
    '</div>' +
    '<div class="card">' +
    '<div class="section-title">All Modules</div>' +
    moduleRows +
    '</div>' +
    '<div class="section-title" style="margin:16px 4px 8px;color:#1e3a5f;">Bundles + Add-ons</div>' +
    bundleHtml +
    '</div>');
}

//  Health Monitoring 

async function renderHealthMonitor() {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading health data</div>');
  var healthRows = [];
  try { healthRows = await ADMIN_API.call('adminGetAllStoreHealth'); } catch(e) {
    _app('<div class="screen">' + _topbar(' Store Health', 'renderDashboard()') +
      '<div class="msg-err">Failed to load health data: ' + e.message + '</div></div>');
    return;
  }

  var stores = adminState.stores;

  // Build map of storeId  health data
  var healthMap = {};
  healthRows.forEach(function(h) { healthMap[h.Store_ID] = h; });

  var rows = stores.map(function(st) {
    var h = healthMap[st.Store_ID];
    var score = h ? Number(h.Health_Score) : null;
    var status = h ? String(h.Health_Status) : 'UNKNOWN';
    var dot = status === 'HEALTHY' ? '' : status === 'WARNING' ? '' : status === 'ALERT' ? '' : '';
    var lastSeen = h ? String(h.Last_Seen_At || '').substring(0, 16).replace('T', ' ') : 'Never';
    var revenueToday = h ? _money(h.Revenue_Today) : '';
    var lowStock = h ? Number(h.Low_Stock_Count) : '';
    return '<div class="store-row" style="cursor:pointer;" onclick="renderStoreSnapshot(\'' + st.Store_ID + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
      '<div style="flex:1;">' +
      '<div style="font-size:14px;font-weight:bold;">' + dot + ' ' + st.Store_Name + '</div>' +
      '<div class="muted" style="font-size:12px;">' + st.Owner_Name + '  ' + st.Owner_Phone + '</div>' +
      (h ? '<div style="font-size:12px;margin-top:2px;color:#374151;">' +
        'Revenue: <strong>' + revenueToday + '</strong>  ' +
        'Low stock: <strong>' + lowStock + '</strong>  ' +
        'Score: <strong>' + score + '</strong>' +
        '</div>' : '') +
      '<div class="muted" style="font-size:11px;">Last seen: ' + lastSeen + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;margin-left:8px;">' +
      '<button class="small-btn" style="margin-top:4px;" onclick="event.stopPropagation();renderStoreSnapshot(\'' + st.Store_ID + '\')">Business</button>' +
      '<button class="small-btn" style="background:#1d4ed8;color:#fff;margin-top:0;" onclick="event.stopPropagation();renderStoreSystemHealth(\'' + st.Store_ID + '\')">App Health</button>' +
      (String(status).toUpperCase() === 'ARCHIVED' ? '' : '<button class="small-btn" style="margin-top:0;" onclick="event.stopPropagation();renderSendMessageToStore(\'' + st.Store_ID + '\',\'' + _esc(st.Store_Name) + '\')">Message</button>') +
      '</div>' +
      '</div></div>';
  }).join('');

  _app('<div class="screen">' +
    _topbar(' Store Health Monitor', 'renderDashboard()') +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;text-align:center;">Business monitors track owner operations. App Health checks and repairs the system functions per store.</div>' +
    '<div class="card" style="padding:0;">' +
    (rows || '<div class="muted" style="padding:12px;">No stores yet.</div>') +
    '</div></div>');
}

function _systemFunctionTemplates(moduleCode, moduleName) {
  var common = [
    { id: 'screen_load', name: moduleName + ' screen opens' },
    { id: 'data_read', name: moduleName + ' data loads' },
    { id: 'data_save', name: moduleName + ' save/update works' },
    { id: 'permission_gate', name: moduleName + ' permission check' }
  ];
  var map = {
    quick_sell: [
      { id: 'pos_cart', name: 'Cart and item entry' },
      { id: 'sale_save', name: 'Sale recording' },
      { id: 'receipt', name: 'Receipt view/print' },
      { id: 'stock_deduct', name: 'Inventory deduction' }
    ],
    products: [
      { id: 'product_list', name: 'Product list loads' },
      { id: 'product_create', name: 'Add product' },
      { id: 'product_update', name: 'Edit product' },
      { id: 'barcode_lookup', name: 'Barcode lookup' }
    ],
    inventory: [
      { id: 'stock_read', name: 'Stock levels load' },
      { id: 'stock_receive', name: 'Add/receive stock' },
      { id: 'stock_adjust', name: 'Stock adjustment' },
      { id: 'movement_log', name: 'Movement logging' }
    ],
    expenses: [
      { id: 'expense_list', name: 'Expense list loads' },
      { id: 'expense_create', name: 'Record expense' },
      { id: 'fixed_costs', name: 'Fixed costs save' },
      { id: 'expense_report', name: 'Expense reporting' }
    ],
    reports: [
      { id: 'daily_report', name: 'Daily report' },
      { id: 'weekly_report', name: 'Weekly report' },
      { id: 'monthly_report', name: 'Monthly report' },
      { id: 'period_report', name: 'Custom period report' }
    ],
    staff_management: [
      { id: 'staff_list', name: 'Staff list loads' },
      { id: 'staff_create', name: 'Create staff' },
      { id: 'role_assign', name: 'Role assignment' },
      { id: 'password_reset', name: 'Password reset' }
    ],
    purchase_orders: [
      { id: 'po_list', name: 'Purchase order list' },
      { id: 'po_create', name: 'Create purchase order' },
      { id: 'po_approve', name: 'Approve purchase order' },
      { id: 'po_receive', name: 'Receive from purchase order' }
    ],
    suppliers: [
      { id: 'supplier_list', name: 'Supplier list loads' },
      { id: 'supplier_create', name: 'Create supplier' },
      { id: 'supplier_update', name: 'Update supplier' },
      { id: 'supplier_status', name: 'Supplier status changes' }
    ],
    branch_transfer: [
      { id: 'transfer_list', name: 'Transfer list loads' },
      { id: 'transfer_create', name: 'Create transfer' },
      { id: 'transfer_approve', name: 'Approve/send transfer' },
      { id: 'transfer_receive', name: 'Receive transfer' }
    ],
    internal_chat: [
      { id: 'message_list', name: 'Messages load' },
      { id: 'message_send', name: 'Send message' },
      { id: 'thread_refresh', name: 'Conversation refresh' },
      { id: 'unread_count', name: 'Unread count' }
    ]
  };
  return map[moduleCode] || common;
}

function _systemCheckCatalog() {
  return _customModuleCatalog().map(function(m) {
    var code = _moduleCodeKey(_moduleCodeOf(m));
    var name = _moduleNameOf(m);
    return { code: code, name: name, functions: _systemFunctionTemplates(code, name) };
  });
}

function _systemCheckKey(moduleCode, functionId) {
  return _moduleCodeKey(moduleCode) + '__' + String(functionId || '').trim();
}

function _systemStatusRecord(statusMap, moduleCode, functionId) {
  return statusMap[_systemCheckKey(moduleCode, functionId)] || { status: 'ok', message: 'Working', lastCheckedAt: '' };
}

function _systemStatusPill(record) {
  var bad = String(record.status || 'ok') === 'problem';
  return '<span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800;' +
    (bad ? 'background:#fee2e2;color:#991b1b;border:1px solid #fecaca;' : 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;') +
    '"><span style="width:8px;height:8px;border-radius:50%;background:' + (bad ? '#dc2626' : '#16a34a') + ';display:inline-block;"></span>' +
    (bad ? 'Problem' : 'Working') + '</span>';
}

async function renderStoreSystemHealth(storeId) {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading app system health</div>');
  var store = (adminState.stores || []).filter(function(s) { return String(s.Store_ID) === String(storeId); })[0] || {};
  var data;
  try {
    data = await ADMIN_API.call('adminGetStoreSystemHealth', { storeId: storeId });
  } catch(e) {
    _app('<div class="screen">' + _topbar('App System Health', 'renderHealthMonitor()') +
      '<div class="msg-err">Failed to load system health: ' + _esc(e.message) + '</div></div>');
    return;
  }
  var statusMap = {};
  (data.checks || []).forEach(function(c) { statusMap[_systemCheckKey(c.moduleCode, c.functionId)] = c; });
  var catalog = _systemCheckCatalog();
  var totals = { checks: 0, ok: 0, problem: 0 };
  catalog.forEach(function(mod) {
    mod.functions.forEach(function(fn) {
      totals.checks++;
      var rec = _systemStatusRecord(statusMap, mod.code, fn.id);
      if (String(rec.status || 'ok') === 'problem') totals.problem++;
      else totals.ok++;
    });
  });
  var modulesHtml = catalog.map(function(mod) {
    var rows = mod.functions.map(function(fn) {
      var rec = _systemStatusRecord(statusMap, mod.code, fn.id);
      var isProblem = String(rec.status || 'ok') === 'problem';
      return '<div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #f3f4f6;">' +
        '<div><div style="font-size:13px;font-weight:700;color:#111827;">' + _esc(fn.name) + '</div>' +
        '<div class="muted" style="font-size:11px;">' + _esc(rec.message || 'Working') + '</div></div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">' +
        _systemStatusPill(rec) +
        (isProblem
          ? '<button class="small-btn" style="background:#16a34a;color:#fff;" onclick="_repairSystemFunction(\'' + _esc(mod.code) + '\',\'' + _esc(fn.id) + '\',\'' + _esc(fn.name).replace(/'/g, '&#39;') + '\',\'' + _esc(storeId) + '\')">Self Repair</button>'
          : '<button class="small-btn" style="background:#fee2e2;color:#991b1b;" onclick="_flagSystemFunction(\'' + _esc(mod.code) + '\',\'' + _esc(fn.id) + '\',\'' + _esc(fn.name).replace(/'/g, '&#39;') + '\',\'' + _esc(storeId) + '\')">Report Problem</button>') +
        '</div></div>';
    }).join('');
    var problemCount = mod.functions.filter(function(fn) {
      return String(_systemStatusRecord(statusMap, mod.code, fn.id).status || 'ok') === 'problem';
    }).length;
    return '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;">' +
      '<div><div class="section-title" style="margin-bottom:2px;">' + _esc(mod.name) + '</div>' +
      '<div class="muted" style="font-size:11px;">' + mod.functions.length + ' system functions monitored</div></div>' +
      '<div style="font-size:11px;font-weight:800;border-radius:999px;padding:4px 8px;' + (problemCount ? 'background:#fee2e2;color:#991b1b;' : 'background:#dcfce7;color:#166534;') + '">' +
      (problemCount ? problemCount + ' problem' + (problemCount > 1 ? 's' : '') : 'All green') + '</div>' +
      '</div>' + rows + '</div>';
  }).join('');
  _app('<div class="screen">' +
    _topbar('App System Health', 'renderHealthMonitor()') +
    '<div class="card" style="background:#0f172a;color:#fff;">' +
    '<div style="font-size:18px;font-weight:900;margin-bottom:4px;">' + _esc(store.Store_Name || storeId) + '</div>' +
    '<div style="font-size:12px;opacity:.78;margin-bottom:12px;">Remote system monitor and self-repair console</div>' +
    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="val">' + totals.checks + '</div><div class="lbl">Functions</div></div>' +
    '<div class="stat-card"><div class="val" style="color:#16a34a;">' + totals.ok + '</div><div class="lbl">Working</div></div>' +
    '<div class="stat-card"><div class="val" style="color:#dc2626;">' + totals.problem + '</div><div class="lbl">Problems</div></div>' +
    '</div>' +
    '<div style="font-size:12px;line-height:1.5;opacity:.86;margin-top:10px;">Self Repair first clears current glitches, then restores the last working event if needed. A successful repair turns the indicator back to green.</div>' +
    '</div>' +
    modulesHtml +
    '</div>');
}

async function _flagSystemFunction(moduleCode, functionId, functionName, storeId) {
  try {
    await ADMIN_API.call('adminFlagStoreSystemFunction', { storeId: storeId, moduleCode: moduleCode, functionId: functionId, functionName: functionName });
    _toast('Problem reported for ' + functionName, true);
    renderStoreSystemHealth(storeId);
  } catch(e) { _toast('Could not flag problem: ' + e.message, true); }
}

async function _repairSystemFunction(moduleCode, functionId, functionName, storeId) {
  try {
    await ADMIN_API.call('adminRepairStoreSystemFunction', { storeId: storeId, moduleCode: moduleCode, functionId: functionId, functionName: functionName });
    _toast(functionName + ' repaired');
    renderStoreSystemHealth(storeId);
  } catch(e) { _toast('Repair failed: ' + e.message, true); }
}

async function renderStoreSnapshot(storeId) {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading store data</div>');
  var snap;
  try { snap = await ADMIN_API.call('adminGetStoreSnapshot', { storeId: storeId }); } catch(e) {
    _app('<div class="screen">' + _topbar('Store Snapshot', 'renderHealthMonitor()') +
      '<div class="msg-err">Failed: ' + e.message + '</div></div>');
    return;
  }

  var st = snap.store || {};
  var status = _storeStatus(_adminStoreById(storeId) || st);

  var lowStockHtml = (snap.lowStockItems || []).map(function(p) {
    return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f3f4f6;">' +
      '<span>' + _esc(p.name) + '</span>' +
      '<span style="color:#dc2626;font-weight:bold;">' + p.stock + ' / ' + p.reorder + '</span></div>';
  }).join('') || '<div class="muted">No low stock items.</div>';

  var recentSalesHtml = (snap.recentSales || []).map(function(s) {
    return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f3f4f6;">' +
      '<span style="color:#6b7280;">' + s.date + ' ' + s.time + '</span>  ' +
      '<strong>' + _money(s.total) + '</strong>  ' + _esc(s.soldBy) +
      ' <span style="color:#6b7280;font-size:11px;">[' + (s.paymentMethod || '') + ']</span>' +
      '</div>';
  }).join('') || '<div class="muted">No recent sales.</div>';

  var recentExpHtml = (snap.recentExpenses || []).map(function(e) {
    return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f3f4f6;">' +
      '<span style="color:#6b7280;">' + e.date + '</span>  ' +
      _esc(e.category) + '  <em>' + _esc(e.description) + '</em>  ' +
      '<strong>' + _money(e.amount) + '</strong>' +
      '</div>';
  }).join('') || '<div class="muted">No recent expenses.</div>';

  _app('<div class="screen">' +
    _topbar(' ' + _esc(st.name || ''), 'renderHealthMonitor()') +

    '<div class="card">' +
    '<div class="muted" style="font-size:12px;margin-bottom:8px;">' + snap.today + '  Plan: ' + st.plan + '</div>' +
    '<div class="stat-grid">' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + _money(snap.revenueToday) + '</div><div class="lbl">Revenue Today</div></div>' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + snap.txToday + '</div><div class="lbl">Transactions</div></div>' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + _money(snap.grossToday) + '</div><div class="lbl">Gross Profit</div></div>' +
    '<div class="stat-card"><div class="val" style="font-size:16px;">' + _money(snap.netToday) + '</div><div class="lbl">Net Today</div></div>' +
    '</div>' +
    '<div style="font-size:13px;line-height:2;margin-top:8px;">' +
    '<div>Revenue (7 days): <strong>' + _money(snap.revenue7Days) + '</strong></div>' +
    '<div>COGS Today: <strong>' + _money(snap.cogsToday) + '</strong>  Expenses: <strong>' + _money(snap.expToday) + '</strong></div>' +
    '<div>Products: <strong>' + snap.productCount + '</strong>  Low stock: <strong style="color:#d97706;">' + snap.lowStockCount + '</strong>  Out of stock: <strong style="color:#dc2626;">' + snap.outOfStockCount + '</strong></div>' +
    '</div></div>' +

    '<div class="card">' +
    '<div class="section-title"> Low / Out of Stock</div>' +
    lowStockHtml + '</div>' +

    '<div class="card">' +
    '<div class="section-title"> Recent Sales</div>' +
    recentSalesHtml + '</div>' +

    '<div class="card">' +
    '<div class="section-title"> Recent Expenses</div>' +
    recentExpHtml + '</div>' +

    (status === 'ARCHIVED' ? '' : '<div class="card">' +
    '<button class="btn btn-secondary" onclick="renderSendMessageToStore(\'' + storeId + '\',\'' + _esc(st.name || '') + '\')"> Message Owner</button>' +
    '</div>') + '</div>');
}

//  Messaging 

var _msgPollInterval = null;

function _stopMsgPoll() {
  if (_msgPollInterval) { clearInterval(_msgPollInterval); _msgPollInterval = null; }
}

async function renderMessagesInbox() {
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading messages</div>');
  var unread, allMsgs;
  try {
    unread  = await ADMIN_API.call('adminGetUnreadCount');
    allMsgs = await ADMIN_API.call('adminGetAllMessages');
  } catch(e) {
    _app('<div class="screen">' + _topbar(' Messages', 'renderDashboard()') +
      '<div class="msg-err">Failed to load messages: ' + e.message + '</div></div>');
    return;
  }

  // Group active-store messages only; archived stores stay out of the admin inbox.
  var byStore = {};
  allMsgs.forEach(function(m) {
    if (_isArchivedStoreId(m.Store_ID)) return;
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
    var store = adminState.stores.find(function(s) { return String(s.Store_ID) === String(t.storeId); }) || {};
    var owner = store.Owner_Name || (t.msgs[0] || {}).Owner_Name || '';
    return '<div class="store-row" onclick="renderStoreMessageThread(\'' + t.storeId + '\',\'' + _esc(t.storeName) + '\')" style="cursor:pointer;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
      '<div style="flex:1;">' +
      '<div style="font-weight:bold;font-size:14px;">' + _esc(t.storeName) +
      (t.unread > 0 ? ' <span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;">' + t.unread + '</span>' : '') +
      '</div>' +
      '<div class="muted" style="font-size:11px;">Owner: ' + _esc(owner || 'Unknown') + '</div>' +
      '<div class="muted" style="font-size:12px;">' + _esc(preview) + (preview.length >= 60 ? '' : '') + '</div>' +
      '<div class="muted" style="font-size:11px;">' + time + '</div>' +
      '</div>' +
      '<button class="small-btn" style="background:#1e3a5f;color:#fff;margin-left:8px;" onclick="event.stopPropagation();renderStoreMessageThread(\'' + t.storeId + '\',\'' + _esc(t.storeName) + '\')">Reply</button>' +
      '</div></div>';
  }).join('') || '<div class="muted" style="padding:12px;">No messages yet.</div>';

  var totalUnread = threads.reduce(function(sum, t) { return sum + Number(t.unread || 0); }, 0);
  _app('<div class="screen">' +
    _topbar(' Messages' + (totalUnread > 0 ? ' (' + totalUnread + ' unread)' : ''), 'renderDashboard()') +
    '<div class="hint" style="margin-bottom:8px;">Archived stores are hidden from messages. Reactivate a store to resume messaging.</div>' +
    '<div class="card" style="padding:0;">' + threadRows + '</div></div>');
}

async function renderStoreMessageThread(storeId, storeName) {
  _stopMsgPoll();
  if (_isArchivedStoreId(storeId)) {
    _app('<div class="screen">' + _topbar('Messages', 'renderMessagesInbox()') +
      '<div class="msg-err">This store is archived. Reactivate it before messaging the owner.</div></div>');
    return;
  }
  _app('<div style="text-align:center;padding:60px 20px;color:#6b7280;">Loading conversation</div>');
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
  var store = adminState.stores.find(function(s) { return String(s.Store_ID) === String(storeId); }) || {};
  var owner = store.Owner_Name || (msgs[0] || {}).Owner_Name || '';
  var bubblesHtml = _buildBubbles(msgs, false);
  _app('<div class="screen">' +
    '<div class="topbar"><div><div class="title" style="margin:0;">' + _esc(storeName) + '</div><div style="font-size:11px;color:#dbeafe;">Owner: ' + _esc(owner || 'Unknown') + '</div></div>' +
    '<button class="small-btn" onclick="_stopMsgPoll();renderMessagesInbox();"> Back</button></div>' +

    '<div id="thread-msgs-' + storeId + '" style="flex:1;overflow-y:auto;padding:12px;background:#f9fafb;min-height:200px;max-height:50vh;border-radius:8px;margin-bottom:8px;">' +
    bubblesHtml + '</div>' +

    '<div class="card" style="margin-top:0;">' +
    '<div class="field">' +
    '<textarea id="admin-msg-text" placeholder="Type a message" rows="3" style="resize:none;"></textarea>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="_sendAdminMessage(\'' + storeId + '\')">Reply to ' + _esc(storeName) + '</button>' +
    '</div></div>');

  // Scroll to bottom
  var el = document.getElementById('thread-msgs-' + storeId);
  if (el) el.scrollTop = el.scrollHeight;
}

async function renderSendMessageToStore(storeId, storeName) {
  _stopMsgPoll();
  if (_isArchivedStoreId(storeId)) {
    _app('<div class="screen">' + _topbar('Messages', 'renderMessagesInbox()') +
      '<div class="msg-err">This store is archived. Reactivate it before messaging the owner.</div></div>');
    return;
  }
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

//  Escape helper 

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

    '<div class="card" id="cs-custom-card" style="display:none;">' +
    '<div class="section-title">Custom Plan  Module Selection</div>' +
    '<div class="hint" style="margin-bottom:10px;">Pick the modules this store needs. All 17 selected = 1,000/mo. Minimum charge: 200/mo.</div>' +
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:14px;display:flex;justify-content:space-between;align-items:center;">' +
    '<span>Computed monthly fee</span><strong id="cs-custom-modules-fee">200/mo</strong>' +
    '</div>' +
    '<div id="cs-custom-modules"></div>' +
    '<div class="field" style="margin-top:10px;"><label>Monthly Fee Override ()  0 = use computed price</label>' +
    '<input id="cs-fee" type="number" min="0" value="0"></div>' +
    '</div>' +

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

// override _onCreatePlanChange to handle CUSTOM module selector
function _onCreatePlanChange() {
  var plan = document.getElementById('cs-plan').value;
  var addonsCard = document.getElementById('cs-addons-card');
  var customCard = document.getElementById('cs-custom-card');
  if (plan === 'CUSTOM') {
    if (addonsCard) addonsCard.style.display = 'none';
    if (customCard) customCard.style.display = '';
    _renderCustomModuleSelector('cs-custom-modules', []);
  } else {
    if (addonsCard) { addonsCard.style.display = ''; _renderAddOnSelector('cs-addons-card', plan, _selectedModulesFromForm('cs-addons-card')); }
    if (customCard) customCard.style.display = 'none';
  }
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
    initialModuleCodes: _moduleSyncPayload(plan, _selectedModulesFromForm('cs-addons-card')).initialModuleCodes,
    addOnModuleCodes: _selectedModulesFromForm('cs-addons-card')
  };
  if (plan === 'CUSTOM') {
    var selectedMods = _selectedModulesFromForm('cs-custom-modules');
    data.customModules = selectedMods;
    var feeOverride = Number((document.getElementById('cs-fee') || {}).value) || 0;
    data.monthlyFee = feeOverride > 0 ? feeOverride : _computeCustomFee(selectedMods);
    data.maxUsers = -1;
    data.maxProducts = -1;
    data.reportsLevel = 'ALL';
    data.hasHealthIndicators = true;
  } else {
    var createModulePayload = _moduleSyncPayload(plan, _selectedModulesFromForm('cs-addons-card'));
    Object.assign(data, createModulePayload);
    _applyModulePatchFields(data, createModulePayload);
  }
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
    : '<div>Billing cycle ends: <strong>' + _esc(r.subscriptionExpires || '') + '</strong></div>';
  var dbHtml = r.dbProvider === 'd1'
    ? '<div>Dedicated DB: <strong>D1</strong> - ' + _esc(r.d1Binding || '') + '</div>'
    : '<div>Dedicated DB: <strong>libSQL</strong> - <span style="word-break:break-all;font-size:11px;">' + _esc(r.tursoDbUrl || '') + '</span></div>';

  _app('<div class="screen">' +
    _topbar('Store Created', 'refreshDashboard()') +
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
    '<div>Plan: <strong>' + _esc(_planLabel(r.plan)) + '</strong> (Negotiable)</div>' +
    (r.monthlyFee ? '<div>Monthly fee: <strong>' + _money(r.monthlyFee) + '</strong></div>' : '') +
    (seededAddOns.length ? '<div>Initial add-ons: <strong>' + _esc(seededAddOns.map(function(item) { return item.feature_name || item.module_code; }).join(', ')) + '</strong></div>' : '<div>Initial add-ons: <strong>None selected</strong></div>') +
    dbHtml +
    '<div>API Key: <span style="word-break:break-all;font-size:11px;">' + _esc(r.apiKey) + '</span></div>' +
    '</div></div>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="refreshDashboard()">View in Store List</button>' +
    '</div>');
}

async function _changePlan(storeId) {
  var plan = document.getElementById('chg-plan').value;
  var patch = { Plan: plan };
  var modulePayload = _moduleSyncPayload(plan, []);
  _applyModulePatchFields(patch, modulePayload);
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






/* HUB_PLAN_BUNDLE_FALLBACK_START */

function _fallbackModuleCatalog() {
  return [
    { code: 'DASHBOARD', feature_name: 'Dashboard', description: 'Main store overview and quick business summary.' },
    { code: 'PRODUCTS', feature_name: 'Products / Items', description: 'Product list, item details, prices, and SKU basics.' },
    { code: 'CATEGORIES', feature_name: 'Categories', description: 'Organize products by category.' },
    { code: 'INVENTORY', feature_name: 'Inventory / Stock', description: 'Stock count, stock movement, and inventory visibility.' },
    { code: 'SALES_POS', feature_name: 'Sales / POS', description: 'Record sales and daily transactions.' },
    { code: 'CASHIER', feature_name: 'Cashier', description: 'Cashier workflow for store selling.' },
    { code: 'RECEIPTS', feature_name: 'Receipts', description: 'Receipt view and transaction proof.' },
    { code: 'BASIC_REPORTS', feature_name: 'Basic Reports', description: 'Daily sales and basic store reports.' },
    { code: 'ADVANCED_REPORTS', feature_name: 'Advanced Reports', description: 'Deeper sales, inventory, and business performance reports.' },
    { code: 'STAFF_MANAGEMENT', feature_name: 'Staff Management', description: 'Manage users, staff roles, and staff access.' },
    { code: 'SUPPLIERS', feature_name: 'Supplier Management', description: 'Track suppliers and purchasing sources.' },
    { code: 'PURCHASE_ORDERS', feature_name: 'Purchase Orders', description: 'Prepare and monitor purchase orders.' },
    { code: 'RESTOCK_REQUESTS', feature_name: 'Restock Requests', description: 'Request, approve, and monitor restocking.' },
    { code: 'EXPENSES', feature_name: 'Expenses', description: 'Record store expenses and operating costs.' },
    { code: 'CUSTOMER_CREDIT', feature_name: 'Customer Credit / Utang', description: 'Track customer balances and credit.' },
    { code: 'HEALTH_MONITOR', feature_name: 'Health Monitor', description: 'Monitor store status and operational health.' },
    { code: 'MESSAGES', feature_name: 'Messages', description: 'Admin and store communication.' },
    { code: 'MULTI_BRANCH', feature_name: 'Multi-branch', description: 'Support for multiple branches or locations.' },
    { code: 'APPROVALS', feature_name: 'Approvals', description: 'Approval workflow for sensitive actions.' },
    { code: 'AUDIT_LOG', feature_name: 'Audit Log', description: 'Track important actions and changes.' },
    { code: 'ONLINE_ORDERING', feature_name: 'Online Ordering', description: 'Allow customers to place orders online.' },
    { code: 'GCASH_PAYMENT', feature_name: 'GCash / Payment Wall', description: 'GCash payment details and billing wall.' },
    { code: 'IMPORT_EXPORT', feature_name: 'Import / Export', description: 'Import and export store data.' },
    { code: 'EXECUTIVE_DASHBOARD', feature_name: 'Executive Dashboard', description: 'Higher-level owner and management dashboard.' },
    { code: 'OWNER_SETTINGS', feature_name: 'Owner Settings', description: 'Owner profile and store settings.' },
    { code: 'CUSTOM_BRANDING', feature_name: 'Custom Branding', description: 'Custom colors, logo, and store identity.' },
    { code: 'DEDICATED_DATABASE', feature_name: 'Dedicated Database', description: 'Dedicated database setup for the tenant.' },
    { code: 'AI_ASSISTANT', feature_name: 'AI Assistant', description: 'AI-powered help, summaries, and recommendations.' },
    { code: 'PREMIUM_SUPPORT', feature_name: 'Premium Support', description: 'Priority help and support.' }
  ];
}

function _fallbackCoreModuleCodes(planId) {
  var plan = _normalizePlanId(planId);
  var negosyo = ['DASHBOARD','PRODUCTS','CATEGORIES','INVENTORY','SALES_POS','CASHIER','RECEIPTS','BASIC_REPORTS','OWNER_SETTINGS'];
  var business = negosyo.concat(['ADVANCED_REPORTS','STAFF_MANAGEMENT','SUPPLIERS','PURCHASE_ORDERS','RESTOCK_REQUESTS','EXPENSES','CUSTOMER_CREDIT','HEALTH_MONITOR']);
  var nexora = business.concat(['MESSAGES','MULTI_BRANCH','APPROVALS','AUDIT_LOG','IMPORT_EXPORT','EXECUTIVE_DASHBOARD']);
  if (plan === 'NEGOSYO_HUB') return negosyo;
  if (plan === 'BUSINESS_HUB') return business;
  if (plan === 'NEXORA_HUB') return nexora;
  return [];
}

function _catalogByCodes(codes) {
  var map = {};
  _fallbackModuleCatalog().forEach(function(m) { map[m.code] = m; });
  return (codes || []).map(function(code) { return map[code]; }).filter(Boolean);
}

function _planCoreModuleCatalog(planId) {
  var hubList = [];
  try { if (HUB && HUB.getCoreModuleCatalog) hubList = HUB.getCoreModuleCatalog(planId) || []; } catch(e) {}
  if (hubList && hubList.length) return hubList;
  return _catalogByCodes(_fallbackCoreModuleCodes(planId));
}

function _planCoreModuleCodes(planId) {
  var hubCodes = [];
  try { if (HUB && HUB.getCoreModuleCodes) hubCodes = HUB.getCoreModuleCodes(planId) || []; } catch(e) {}
  if (hubCodes && hubCodes.length) return _uniqueModuleCodes(hubCodes.map(function(code) { return _moduleCodeKey(code); }));
  return _planCoreModuleCatalog(planId).map(function(feature) { return feature.module_code || feature.code; }).filter(Boolean);
}


function _moduleCodeKey(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function _planAddOnCatalog(planId, catalog) {
  var coreMap = {};
  _planCoreModuleCodes(planId).forEach(function(code) { coreMap[_moduleCodeKey(code)] = true; });
  var hubList = [];
  try { if (HUB && HUB.getAddOnCatalog) hubList = HUB.getAddOnCatalog(planId, catalog || _featureCatalog()) || []; } catch(e) {}
  if (hubList && hubList.length) {
    return hubList.filter(function(m) {
      var code = String(m.module_code || m.code || '');
      return code && !coreMap[_moduleCodeKey(code)];
    });
  }
  return _fallbackModuleCatalog().filter(function(m) {
    var code = String(m.module_code || m.code || '');
    return code && !coreMap[_moduleCodeKey(code)];
  });
}

function _renderPlanBundleSummary(planId) {
  var tier = _planTier(planId) || {};
  var defs = _planDefs();
  var def = defs[_normalizePlanId(planId)] || {};
  var core = _planCoreModuleCatalog(planId) || [];
  var coreHtml = core.length ? core.map(function(feature) {
    var name = feature.feature_name || feature.name || feature.module_name || feature.module_code || feature.code || 'Included feature';
    var desc = feature.description || feature.feature_description || '';
    return '<div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;margin-bottom:8px;">' +
      '<div style="font-size:13px;font-weight:800;color:#065f46;">Included: ' + _esc(name) + '</div>' +
      (desc ? '<div class="muted" style="font-size:11px;margin-top:2px;">' + _esc(desc) + '</div>' : '') +
      '</div>';
  }).join('') : '<div class="muted">No included module list available yet for this plan.</div>';
  var limitHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Users</strong><br>' + (def.max_users === -1 ? 'Unlimited' : (def.max_users || tier.maxUsers || '')) + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Products</strong><br>' + (def.max_products === -1 ? 'Unlimited' : (def.max_products || tier.maxProducts || '')) + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Reports</strong><br>' + _esc(def.reports || tier.reportsLevel || '') + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Health</strong><br>' + ((def.health || tier.hasHealthIndicators) ? 'Included' : 'Not included') + '</div>' +
    '</div>';
  return '<div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:10px;padding:12px;margin-bottom:12px;">' +
    '<div style="font-weight:800;color:#1e3a5f;margin-bottom:4px;">' + _esc(_planLabel(planId)) + ' Included Bundle</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:8px;">These modules are already included in the selected Hub plan. They do not need checkboxes.</div>' +
    coreHtml + limitHtml +
    '</div>';
}

function _renderAddOnSelector(containerId, planId, selectedModuleCodes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var addOnPrice = _addOnPriceForPlan(planId);
  var addOns = _planAddOnCatalog(planId, _featureCatalog());
  var selectedMap = {};
  (selectedModuleCodes || []).forEach(function(code) { selectedMap[String(code)] = true; });
  container.innerHTML =
    '<div class="section-title">Additional Add-ons</div>' +
    _renderPlanBundleSummary(planId) +
    '<div class="hint" style="margin-bottom:10px;">Tick optional modules below to add them on top of the included bundle.</div>' +
    (addOns.length ? addOns.map(function(feature) {
      var code = feature.module_code || feature.code;
      var name = feature.feature_name || feature.name || code;
      var desc = feature.description || feature.feature_description || '';
      return '<label style="display:block;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
        '<input type="checkbox" data-module-code="' + _esc(code) + '"' + (selectedMap[code] ? ' checked' : '') + ' style="margin-top:3px;">' +
        '<div style="flex:1;">' +
        '<div style="font-size:13px;font-weight:800;color:#9a3412;">Add-on: ' + _esc(name) + '</div>' +
        (desc ? '<div class="muted" style="font-size:11px;margin-top:2px;">' + _esc(desc) + '</div>' : '') +
        '<div style="font-size:11px;color:#9a3412;margin-top:4px;">Optional add-on' + (addOnPrice ? ' - ' + addOnPrice + '/mo' : '') + '</div>' +
        '</div></div></label>';
    }).join('') : '<div class="muted">No add-ons available for this plan.</div>');
}

/* HUB_PLAN_BUNDLE_FALLBACK_END */





/* UNIFIED_MODULE_SPLIT_OVERRIDE_START */

function _moduleCodeKey(code) {
  var value = String(code || '').trim();
  try { if (HUB && HUB.resolveModuleId) value = HUB.resolveModuleId(value); } catch(e) {}
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function _moduleCodeOf(m) {
  return String((m && (m.module_code || m.code || m.Module_Code || m.Code)) || '').trim();
}

function _moduleNameOf(m) {
  return (m && (m.feature_name || m.name || m.module_name || m.Feature_Name || m.Name || m.module_code || m.code)) || 'Module';
}

function _moduleDescOf(m) {
  return (m && (m.short_description || m.description || m.feature_description || m.Short_Description || m.Description)) || '';
}

function _isOperationalModuleCode(code) {
  var hidden = {
    auth: true,
    module_catalog: true,
    module_code_registry: true,
    addon_code_registry: true,
    plan_bundles: true,
    addon_filtering: true,
    included_module_filtering: true,
    hub_bundle_modules: true,
    business_hub_addons: true,
    negosyo_hub_addons: true,
    flexible_plan_modules: true,
    feature_marketplace: true,
    offline_cache: true,
    registry_db: true,
    api_integrations: true,
    logging_config: true,
    dashboard_widgets: true,
    module_permissions: true,
    approval_thresholds: true
  };
  return !hidden[_moduleCodeKey(code)];
}

function _canonicalModule(m, fallbackCode) {
  var code = _moduleCodeOf(m) || String(fallbackCode || '').trim();
  return {
    code: code,
    module_code: code,
    feature_name: _moduleNameOf(m || { code: code }),
    name: _moduleNameOf(m || { code: code }),
    description: _moduleDescOf(m || {}),
    short_description: _moduleDescOf(m || {}),
    price: (m && m.price) || (m && m.Price) || null
  };
}

function _allModuleCatalog() {
  var map = {};
  function addList(list) {
    (list || []).forEach(function(m) {
      var code = _moduleCodeOf(m);
      if (!code) return;
      var key = _moduleCodeKey(code);
      if (!map[key]) map[key] = _canonicalModule(m, code);
    });
  }

  try {
    if (HUB && HUB.getCustomModuleCatalog) addList(HUB.getCustomModuleCatalog() || []);
  } catch(e) {}

  addList(_featureCatalog());

  try {
    if (!Object.keys(map).length && typeof _fallbackModuleCatalog === 'function') addList(_fallbackModuleCatalog() || []);
  } catch(e) {}

  ['TRIAL','NEGOSYO_HUB','BUSINESS_HUB','NEXORA_HUB'].forEach(function(plan) {
    _planCoreModuleCodes(plan).forEach(function(code) {
      var key = _moduleCodeKey(code);
      if (!map[key]) map[key] = _canonicalModule({ code: code, name: String(code).replace(/_/g, ' ') }, code);
    });
  });

  return Object.keys(map).sort().map(function(k) { return map[k]; });
}

function _customModuleCatalog() {
  return _allModuleCatalog().filter(function(m) { return _isOperationalModuleCode(_moduleCodeOf(m)); });
}

function _planCoreModuleCodes(planId) {
  var plan = _normalizePlanId(planId);
  if (plan === 'CUSTOM') return [];

  var hubCodes = null;
  try {
    if (HUB && HUB.getCoreModuleCodes) hubCodes = HUB.getCoreModuleCodes(plan);
  } catch(e) {}

  if (Array.isArray(hubCodes)) {
    return _uniqueModuleCodes(hubCodes.map(function(code) { return _moduleCodeKey(code); }).filter(_isOperationalModuleCode));
  }

  if (typeof _fallbackCoreModuleCodes === 'function') {
    return _uniqueModuleCodes((_fallbackCoreModuleCodes(plan) || []).map(function(code) { return _moduleCodeKey(code); }).filter(_isOperationalModuleCode));
  }

  return [];
}

function _planCoreModuleCatalog(planId) {
  var coreMap = {};
  _planCoreModuleCodes(planId).forEach(function(code) { coreMap[_moduleCodeKey(code)] = true; });

  var all = _customModuleCatalog();
  var included = all.filter(function(m) {
    return coreMap[_moduleCodeKey(_moduleCodeOf(m))];
  });

  var found = {};
  included.forEach(function(m) { found[_moduleCodeKey(_moduleCodeOf(m))] = true; });

  _planCoreModuleCodes(planId).forEach(function(code) {
    var key = _moduleCodeKey(code);
    if (!found[key]) included.push(_canonicalModule({ code: key, name: String(key).replace(/_/g, ' ') }, key));
  });

  return included;
}

function _planAddOnCatalog(planId, catalog) {
  var plan = _normalizePlanId(planId);
  var all = _customModuleCatalog();

  if (plan === 'CUSTOM') return all;

  var coreMap = {};
  _planCoreModuleCodes(plan).forEach(function(code) { coreMap[_moduleCodeKey(code)] = true; });

  return all.filter(function(m) {
    var code = _moduleCodeKey(_moduleCodeOf(m));
    return code && !coreMap[code];
  });
}

function _renderPlanBundleSummary(planId) {
  var plan = _normalizePlanId(planId);
  var tier = _planTier(planId) || {};
  var defs = _planDefs();
  var def = defs[plan] || {};
  var core = _planCoreModuleCatalog(planId) || [];

  var coreHtml = core.length ? core.map(function(feature) {
    var code = _moduleCodeOf(feature);
    var name = _moduleNameOf(feature);
    var desc = _moduleDescOf(feature);
    return '<div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;margin-bottom:8px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
      '<div style="font-size:13px;font-weight:800;color:#065f46;">Included: ' + _esc(name) + '</div>' +
      _adminModuleHelpButton(code, name, desc, 'included') +
      '</div>' +
      (desc ? '<div class="muted" style="font-size:11px;margin-top:2px;">' + _esc(desc) + '</div>' : '') +
      '</div>';
  }).join('') : '<div class="muted">No included modules for this plan.</div>';

  var limitHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Users</strong><br>' + (def.max_users === -1 ? 'Unlimited' : (def.max_users || tier.maxUsers || '')) + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Products</strong><br>' + (def.max_products === -1 ? 'Unlimited' : (def.max_products || tier.maxProducts || '')) + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Reports</strong><br>' + _esc(def.reports || tier.reportsLevel || '') + '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"><strong>Health</strong><br>' + ((def.health || tier.hasHealthIndicators) ? 'Included' : 'Not included') + '</div>' +
    '</div>';

  return '<div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:10px;padding:12px;margin-bottom:12px;">' +
    '<div style="font-weight:800;color:#1e3a5f;margin-bottom:4px;">' + _esc(_planLabel(planId)) + ' Included Bundle</div>' +
    '<div class="muted" style="font-size:12px;margin-bottom:8px;">Green modules are already included in this plan. They do not need checkboxes.</div>' +
    coreHtml + limitHtml +
    '</div>';
}

function _renderAddOnSelector(containerId, planId, selectedModuleCodes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var addOnPrice = _addOnPriceForPlan(planId);
  var addOns = _planAddOnCatalog(planId, _featureCatalog());
  var selectedMap = {};
  (selectedModuleCodes || []).forEach(function(code) { selectedMap[_moduleCodeKey(code)] = true; });

  container.innerHTML =
    '<div class="section-title">Available Add-On Modules</div>' +
    _renderPlanBundleSummary(planId) +
    '<div class="hint" style="margin-bottom:10px;">These are the same operational add-on modules the owner will see for this plan.</div>' +
    (addOns.length ? addOns.map(function(feature) {
      var code = _moduleCodeOf(feature);
      var name = _moduleNameOf(feature);
      var desc = _moduleDescOf(feature);
      return '<label style="display:block;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;align-items:flex-start;gap:10px;">' +
        '<input type="checkbox" data-module-code="' + _esc(code) + '"' + (selectedMap[_moduleCodeKey(code)] ? ' checked' : '') + ' style="margin-top:3px;">' +
        '<div style="flex:1;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<div style="font-size:13px;font-weight:800;color:#9a3412;">Add-on: ' + _esc(name) + '</div>' +
        _adminModuleHelpButton(code, name, desc, 'addon') +
        '</div>' +
        (desc ? '<div class="muted" style="font-size:11px;margin-top:2px;">' + _esc(desc) + '</div>' : '') +
        '<div style="font-size:11px;color:#9a3412;margin-top:4px;">Optional add-on' + (addOnPrice ? ' - ' + addOnPrice + '/mo' : '') + '</div>' +
        '</div></div></label>';
    }).join('') : '<div class="muted">No add-ons available for this plan.</div>');
}

/* UNIFIED_MODULE_SPLIT_OVERRIDE_END */

