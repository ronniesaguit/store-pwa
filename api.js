// api.js — Cloudflare Workers API client

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
    var emptyErr = new Error('Bad response from server');
    emptyErr.canFallback = response.status === 404 || response.status === 405;
    throw emptyErr;
  }

  try {
    return JSON.parse(text);
  } catch(e) {
    var parseErr = new Error('Bad response from server');
    parseErr.canFallback = response.status === 404 || response.status === 405;
    throw parseErr;
  }
}

_persistApiBaseOverrideFromUrl();

// Store key for this store installation — set from URL ?k= param or localStorage
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

    // Silent re-auth on token expiry — transparent to the user
    if (!result.success && this._isExpired(result.error) && !this._reauthing) {
      const ok = await this._silentReAuth();
      if (ok) result = await this._raw(action, data);
    }

    if (!result.success && result.errorCode === 'SUBSCRIPTION_EXPIRED') {
      showSubscriptionExpired(result.paymentInfo || {});
      throw new Error('SUBSCRIPTION_EXPIRED');
    }
    if (!result.success) {
      const err = new Error(result.error || 'Server error');
      if (result.errorCode) err.code = result.errorCode;
      throw err;
    }
    return result.data;
  },

  async _raw(action, data) {
    const body = JSON.stringify({
      action, token: this.token, storeKey: STORE_KEY, data: data || {}
    });
    return _postToApiTargets(body);
  },

  _isExpired(msg) {
    if (!msg) return false;
    const m = msg.toLowerCase();
    return m.includes('session expired') || m.includes('not logged in') || m.includes('please log in');
  },

  async _silentReAuth() {
    const raw = localStorage.getItem('_ak');
    if (!raw) return false;
    try {
      this._reauthing = true;
      const decoded = atob(raw);
      const sep = decoded.indexOf(':');
      const username = decoded.substring(0, sep);
      const password = decoded.substring(sep + 1);
      const result = await this._raw('login', { username, password });
      if (!result.success) return false;
      this.setToken(result.data.token);
      // Update cached session and data silently
      if (result.data.products)   { try { window.state && (state.products   = result.data.products);   } catch(e){} }
      if (result.data.categories) { try { window.state && (state.categories = result.data.categories); } catch(e){} }
      return true;
    } catch(e) {
      return false;
    } finally {
      this._reauthing = false;
    }
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
  }
};

// ── Admin API client (used only by admin.html) ────────────────────────────────

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
    const raw = localStorage.getItem('_aak');
    if (!raw) return false;
    try {
      this._reauthing = true;
      const decoded = atob(raw);
      const sep = decoded.indexOf(':');
      const username = decoded.substring(0, sep);
      const password = decoded.substring(sep + 1);
      const result = await this._raw('adminLogin', { username, password });
      if (!result.success) return false;
      this.setToken(result.data.token);
      return true;
    } catch(e) {
      return false;
    } finally {
      this._reauthing = false;
    }
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
