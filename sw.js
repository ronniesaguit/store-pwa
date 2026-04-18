// sw.js — Service Worker for offline-first Store PWA
const CACHE = 'store-pwa-v31';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './api.js',
  './db.js',
  './manifest.json',
  './scanner.html',
  './admin.html',
  './admin.js'
];

// Install: pre-cache all static assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting(); // activate immediately
    })
  );
});

// Activate: remove old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); // take control immediately
    })
  );
});

// Fetch: cache-first for static, network-only for GAS API calls
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Never cache GAS API calls — always go to network
  if (url.includes('script.google.com')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response(
        JSON.stringify({ success: false, error: 'No internet connection' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }));
    return;
  }

  // Cache-first for everything else (app shell, JS files)
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cache valid GET responses
        if (e.request.method === 'GET' && response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        // Offline and not cached — return index.html for navigation requests
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
