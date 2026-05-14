// api.js â€” Cloudflare Workers API client

const API_BASE_STORAGE_KEY = 'store_api_base';
const APP_CONFIG = window.__STORE_APP_CONFIG__ || {};

function _normalizeApiBase(raw) {
  if (!raw) return '';
  var value = String(raw).trim();
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).toString();
  } catch(e) {
    return value.replace(/\/+$/, '');
  }
}

function _persistApiBaseOverrideFromUrl() {
  var fromUrl = new URLSearchParams(window.location.search).get('api');
  if (fromUrl == null) return;
  var value = String(fromUrl).trim();
  if (!value || value.toLowerCase() === 'reset') {
    localStorage.removeItem(API_BASE_STORAGE_KEY);
  } else {
    localStorage.setItem(API_BASE_STORAGE_KEY, value);
  }
}

function _getApiTargets() {
  var override = localStorage.getItem(API_BASE_STORAGE_KEY) || '';
  var primary = _normalizeApiBase(override || APP_CONFIG.apiBase || '/api');
  var fallback = _normalizeApiBase(APP_CONFIG.apiFallbackBase || '');
  var targets = [];
  if (primary) targets.push(primary);
  if (fallback && targets.indexOf(fallback) === -1) targets.push(fallback);
  return targets.length ? targets : [_normalizeApiBase('/api')];
}

async function _postToApiTargets(body) {
  var targets = _getApiTargets();
  var lastErr = null;

  for (var i = 0; i < targets.length; i++) {
    try {
      return await _postToApi(targets[i], body);
    } catch(e) {
      lastErr = e;
      if (!e.canFallback || i === targets.length - 1) throw e;
    }
  }

  throw lastErr || new Error('No internet connection');
}

function _describeBadApiResponse(response, text) {
  var status = 'HTTP ' + String((response && response.status) || 0);
  if (response && response.statusText) status += ' ' + response.statusText;

  var contentType = '';
  try { contentType = String((response && response.headers && response.headers.get('content-type')) || ''); } catch(e) {}

  var snippet = String(text || '').replace(/\s+/g, ' ').trim();
  if (snippet.length > 180) snippet = snippet.slice(0, 177) + '...';

  var looksHtml = /^<!doctype html/i.test(snippet) || /^<html/i.test(snippet) || contentType.toLowerCase().indexOf('text/html') !== -1;
  if (looksHtml) {
    return status + ' returned HTML instead of JSON. Check the /api route and Cloudflare Pages UPSTREAM_API_BASE.';
  }
  if (!snippet) {
    return status + ' returned an empty response body.';
  }
  return status + ': ' + snippet;
}

function _shouldFallbackBadApiResponse(response, text) {
  var status = (response && response.status) || 0;
  if (status === 404 || status === 405 || status === 502 || status === 503 || status === 504) return true;

  var contentType = '';
  try { contentType = String((response && response.headers && response.headers.get('content-type')) || ''); } catch(e) {}
  var snippet = String(text || '').replace(/\s+/g, ' ').trim();
  if (!snippet) return true;

  return /^<!doctype html/i.test(snippet) || /^<html/i.test(snippet) || contentType.toLowerCase().indexOf('text/html') !== -1;
}

async function _postToApi(url, body) {
  var response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow'
    });
  } catch(e) {
    var networkErr = new Error('No internet connection');
    networkErr.canFallback = true;
    throw networkErr;
  }

  var text = '';
  try { text = await response.text(); } catch(e) {}

  if (!text) {
    var emptyErr = new Error(_describeBadApiResponse(response, text));
    emptyErr.canFallback = _shouldFallbackBadApiResponse(response, text);
    throw emptyErr;
  }

  try {
    return JSON.parse(text);
  } catch(e) {
    var parseErr = new Error(_describeBadApiResponse(response, text));
    parseErr.canFallback = _shouldFallbackBadApiResponse(response, text);
    throw parseErr;
  }
}

_persistApiBaseOverrideFromUrl();

// â”€â”€ Staff repair helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// These guard the staff module-gate retry logic in API.call / API._raw.
// Defined as no-ops here so the repair paths don't run until properly implemented.
var _STAFF_MGMT_ACTIONS = ['getStaff','getStaffById','createStaff','updateStaff',
  'assignStaffRole','setStaffPassword','setStaffStatus','deactivateStaff',
  'getCustomRoles','createCustomRole','updateCustomRole','assignCustomRole',
  'listRoleAssignments'];
function _isStaffManagementAction(action) { return _STAFF_MGMT_ACTIONS.indexOf(action) !== -1; }
function _isStaffModuleGateResult(result) {
  return !!(result && !result.success &&
    (result.errorCode === 'MODULE_DISABLED' ||
     (typeof result.error === 'string' && result.error.toLowerCase().indexOf('staff_management') !== -1)));
}
function _isStaffReadAction(action) { return action === 'getStaff' || action === 'getStaffById'; }
function _staffRepairContext() { return {}; }

// Store key for this store installation â€” set from URL ?k= param or localStorage
const STORE_KEY = (function() {
  var fromUrl = new URLSearchParams(window.location.search).get('k');
  if (fromUrl) {
    localStorage.setItem('store_key', fromUrl);
    // Clean up URL without reloading
    try {
      var clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
    } catch(e) {}
  }
  return localStorage.getItem('store_key') || '';
})();

const API = {
  token: localStorage.getItem('store_token') || null,
  _reauthing: false,

  async call(action, data) {
    let result = await this._raw(action, data);

    // Silent re-auth on token expiry â€” transparent to the user
    if (!result.success && this._isExpired(result.error) && !this._reauthing) {
      const ok = await this._silentReAuth();
      if (ok) result = await this._raw(action, data);
    }

    // GitHub Pages can call the Worker directly, bypassing the Pages proxy repair.
    // Staff is now a core module, so repair legacy tenant access once and retry.
    if (!result.success && _isStaffManagementAction(action) && _isStaffModuleGateResult(result)) {
      const refreshed = await this._silentReAuth();
      if (refreshed) result = await this._raw(action, data);
    }
    if (!result.success && _isStaffManagementAction(action) && _isStaffModuleGateResult(result) && !_isStaffReadAction(action)) {
      const repaired = await this._repairCoreStaffAccess();
      if (repaired) result = await this._raw(action, data);
    }

    if (!result.success && result.errorCode === 'SUBSCRIPTION_EXPIRED') {
      showSubscriptionExpired(result.paymentInfo || {});
      throw new Error('SUBSCRIPTION_EXPIRED');
    }
    if (!result.success) {
      const err = new Error(result.error || 'Server error');
      if (result.errorCode) err.code = result.errorCode;
      err.action = action;
      err.apiTarget = result._apiTarget || '';
      try {
        console.warn('[HubSuite API rejected]', {
          action: action,
          apiTarget: err.apiTarget || '(unknown)',
          errorCode: result.errorCode || null,
          error: result.error || null,
          storeKeyPresent: !!STORE_KEY
        });
      } catch(e) {}
      throw err;
    }
    return result.data;
  },

  async _raw(action, data) {
    const payloadData = _isStaffManagementAction(action)
      ? Object.assign({}, _staffRepairContext(), data || {})
      : (data || {});
    const body = JSON.stringify({
      action, token: this.token, storeKey: STORE_KEY, data: payloadData
    });
    return _postToApiTargets(body);
  },

  _isExpired(msg) {
    if (!msg) return false;
    const m = msg.toLowerCase();
    return m.includes('session expired') || m.includes('not logged in') || m.includes('please log in');
  },

  async _silentReAuth() {
    // SECURITY: disabled password based silent reauth. User must log in again when token expires.
    localStorage.removeItem('_ak');
    return false;
  },

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('store_token', token);
    else localStorage.removeItem('store_token');
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('store_token');
    localStorage.removeItem('store_session');
    localStorage.removeItem('_ak');
  },

  // Approvals
  async getApprovals(filters) {
    return this.call('getApprovals', filters || {});
  },
  async getApproval(id) {
    return this.call('getApprovalById', { id });
  },
  async approveApproval(id, note) {
    return this.call('approveApproval', { id, decisionNote: note });
  },
  async rejectApproval(id, note) {
    return this.call('rejectApproval', { id, decisionNote: note });
  },

  // Stock adjustment
  async createStockAdjustment(data) {
    return this.call('createStockAdjustment', data);
  },

  // Staff Management
  async getStaff() {
    return this.call('getStaff');
  },
  async getStaffById(id) {
    return this.call('getStaffById', { id });
  },
  async createStaff(data) {
    return this.call('createStaff', data);
  },
  async updateStaff(id, data) {
    return this.call('updateStaff', { id, ...data });
  },
  async assignStaffRole(id, role) {
    return this.call('assignStaffRole', { id, role });
  },
  async setStaffPassword(id, password) {
    return this.call('setStaffPassword', { id, password });
  },
  async setStaffStatus(id, status) {
    return this.call('setStaffStatus', { id, status });
  },

  // Advanced Reports
  async getAdvancedReport(type, period) {
    return this.call('getAdvancedReport', { type, period });
  },

  // Inventory Advanced
  async getInventoryAdvancedSummary() {
    return this.call('getInventoryAdvancedSummary');
  },
  async getInventoryMovements(filters) {
    return this.call('getInventoryMovements', filters || {});
  },
  async getProductInventoryDetail(productId) {
    return this.call('getProductInventoryDetail', { productId });
  },
  async createRestock(data) {
    return this.call('createRestock', data);
  },

  // Remaining module contracts
  async getReceivingHistory(filters) { return this.call('getReceivingHistory', filters || {}); },
  async getReceivingById(id) { return this.call('getReceivingById', { id }); },
  async getPurchaseRequisitions(filters) { return this.call('getPurchaseRequisitions', filters || {}); },
  async createPurchaseRequisition(data) { return this.call('createPurchaseRequisition', data); },
  async getFulfillmentOrders(filters) { return this.call('getFulfillmentOrders', filters || {}); },
  async fulfillOrder(id) { return this.call('fulfillOrder', { id }); },
  async createBranchTransfer(data) { return this.call('createBranchTransfer', data); },
  async submitBranchTransfer(id) { return this.call('submitBranchTransfer', { id }); },
  async approveBranchTransfer(id) { return this.call('approveBranchTransfer', { id }); },
  async markBranchTransferSent(id) { return this.call('markBranchTransferSent', { id }); },
  async receiveBranchTransfer(id) { return this.call('receiveBranchTransfer', { id }); },
  async cancelBranchTransfer(id) { return this.call('cancelBranchTransfer', { id }); },
  async getBranchLocations() { return this.call('getBranchLocations', {}); },
  async getVendorPayments(filters) { return this.call('getVendorPayments', filters || {}); },
  async createVendorPayment(data) { return this.call('createVendorPayment', data); },
  async getCustomerReturns(filters) { return this.call('getCustomerReturns', filters || {}); },
  async createCustomerReturn(data) { return this.call('createCustomerReturn', data); },
  async getPromotions(filters) { return this.call('getPromotions', filters || {}); },
  async createPromotion(data) { return this.call('createPromotion', data); },
  async getVoids(filters) { return this.call('getVoids', filters || {}); },
  async voidSale(data) { return this.call('voidSale', data); },
  async updateNotificationSettings(data) { return this.call('updateNotificationSettings', data); },
  async updateInventoryAlertSettings(data) { return this.call('updateInventoryAlertSettings', data); },
  async updateIntegrationSettings(data) { return this.call('updateIntegrationSettings', data); },
  async updateTaxSettings(data) { return this.call('updateTaxSettings', data); },
  async updateLoggingSettings(data) { return this.call('updateLoggingSettings', data); },
  async updateApprovalThresholds(data) { return this.call('updateApprovalThresholds', data); },
  async getRegistryStatus() { return this.call('getRegistryStatus', {}); }
};

// â”€â”€ Admin API client (used only by admin.html) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ADMIN_API = {
  token: localStorage.getItem('admin_token') || null,
  _reauthing: false,

  async call(action, data) {
    let result = await this._raw(action, data);

    // Silent re-auth on token expiry
    if (!result.success && this._isExpired(result.error) && !this._reauthing) {
      const ok = await this._silentReAuth();
      if (ok) result = await this._raw(action, data);
    }

    if (!result.success) throw new Error(result.error || 'Server error');
    return result.data;
  },

  async _raw(action, data) {
    const body = JSON.stringify({ action, adminToken: this.token, data: data || {} });
    return _postToApiTargets(body);
  },

  _isExpired(msg) {
    if (!msg) return false;
    const m = msg.toLowerCase();
    return m.includes('session expired') || m.includes('not logged in') || m.includes('admin not logged in');
  },

  async _silentReAuth() {
    // SECURITY: disabled admin password based silent reauth. Admin must log in again when token expires.
    localStorage.removeItem('_aak');
    return false;
  },

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('admin_token', token);
    else localStorage.removeItem('admin_token');
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('_aak');
  }
};

