// api.js — GAS API client
// Uses Content-Type: text/plain to avoid CORS preflight on GAS web apps

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzze0SpX-MVDYPMI4vZZ0Q_LLbz4ZUfEcRW2NlMgULP9xDTj5glbIq83ERCNJcl-Nd6/exec';

const API = {
  token: localStorage.getItem('store_token') || null,

  async call(action, data) {
    const body = JSON.stringify({ action, token: this.token, data: data || {} });
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
