// db.js — IndexedDB wrapper for offline storage

const DB_NAME = 'StoreAppDB';
const DB_VERSION = 1;
let _db = null;

const DB = {
  ready: null,

  init() {
    this.ready = new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function() { reject(req.error); };
      req.onsuccess = function() { _db = req.result; resolve(); };
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('products'))
          db.createObjectStore('products', { keyPath: 'Product_ID' });
        if (!db.objectStoreNames.contains('categories'))
          db.createObjectStore('categories', { keyPath: 'Category_Name' });
        if (!db.objectStoreNames.contains('syncQueue'))
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      };
    });
    return this.ready;
  },

  _run(storeName, mode, fn) {
    return new Promise(function(resolve, reject) {
      try {
        var tx = _db.transaction([storeName], mode);
        var store = tx.objectStore(storeName);
        var req = fn(store);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror   = function() { reject(req.error); };
      } catch(e) { reject(e); }
    });
  },

  getAll(storeName) {
    return this._run(storeName, 'readonly', function(s) { return s.getAll(); });
  },

  put(storeName, item) {
    return this._run(storeName, 'readwrite', function(s) { return s.put(item); });
  },

  clear(storeName) {
    return this._run(storeName, 'readwrite', function(s) { return s.clear(); });
  },

  get(storeName, key) {
    return this._run(storeName, 'readonly', function(s) { return s.get(key); });
  },

  add(storeName, item) {
    return this._run(storeName, 'readwrite', function(s) { return s.add(item); });
  },

  // Products
  async saveProducts(products) {
    await this.clear('products');
    for (var i = 0; i < products.length; i++) {
      await this.put('products', products[i]);
    }
  },
  getProducts() { return this.getAll('products'); },

  // Categories — keyed by Category_Name for simplicity
  async saveCategories(cats) {
    await this.clear('categories');
    for (var i = 0; i < cats.length; i++) {
      // Ensure keyPath exists
      if (!cats[i].Category_Name) continue;
      await this.put('categories', cats[i]);
    }
  },
  getCategories() { return this.getAll('categories'); },

  // Sync queue
  async addToSyncQueue(item) {
    item.timestamp = Date.now();
    item.synced = false;
    return this.add('syncQueue', item);
  },
  async getSyncQueue() {
    var all = await this.getAll('syncQueue');
    return all.filter(function(i) { return !i.synced; });
  },
  async markSynced(id) {
    var item = await this.get('syncQueue', id);
    if (item) { item.synced = true; await this.put('syncQueue', item); }
  }
};
