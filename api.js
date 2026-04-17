// api.js — GAS API client
// Uses Content-Type: text/plain to avoid CORS preflight on GAS web apps

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzYpC9eeCgdXw7s-JO0V51Ys40sjPwYyb_9AOZUN9Wq7PNsgTq4rj4O7zLC3xVK1oIB/exec';

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

  async call(action, data) {
    const body = JSON.stringify({
      action,
      token:    this.token,
      storeKey: STORE_KEY,
      data:     data || {}
    });
    let response;
    try {
      response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('No internet connection');
    }
    let result;
    try { result = await response.json(); }
    catch (e) { throw new Error('Bad response from server'); }

    // Subscription expired — show payment wall instead of a generic error
    if (!result.success && result.errorCode === 'SUBSCRIPTION_EXPIRED') {
      showSubscriptionExpired(result.paymentInfo || {});
      throw new Error('SUBSCRIPTION_EXPIRED');
    }

    if (!result.success) throw new Error(result.error || 'Server error');
    return result.data;
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
  }
};

// ── Admin API client (used only by admin.html) ────────────────────────────────

const ADMIN_API = {
  token: localStorage.getItem('admin_token') || null,

  async call(action, data) {
    const body = JSON.stringify({
      action,
      adminToken: this.token,
      data:       data || {}
    });
    let response;
    try {
      response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
    } catch(e) { throw new Error('No internet connection'); }
    let result;
    try { result = await response.json(); }
    catch(e) { throw new Error('Bad response from server'); }
    if (!result.success) throw new Error(result.error || 'Server error');
    return result.data;
  },

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('admin_token', token);
    else localStorage.removeItem('admin_token');
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('admin_token');
  }
};
