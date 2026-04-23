// sw.js â€” Service Worker for offline-first Store PWA
const CACHE = 'store-pwa-v68';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './hubsuite.js',
  './config.js',
  './api.js',
  './db.js',
  './manifest.json',
  './scanner.html',
  './admin.html',
  './admin.js',
  './assets/branding/hubsuite.svg',
  './assets/branding/hubsuite-trial.svg',
  './assets/branding/negosyo-hub.svg',
  './assets/branding/business-hub.svg',
  './assets/branding/nexora-hub.svg',
  './vendor/html5-qrcode.min.js'
];

const NETWORK_ONLY_HOSTS = ['script.google.com'];
const NETWORK_ONLY_PATH_PREFIXES = ['/api'];

function isNetworkOnlyRequest(url) {
  return NETWORK_ONLY_HOSTS.some(function(host) {
    return url.hostname === host || url.hostname.endsWith('.' + host);
  }) || NETWORK_ONLY_PATH_PREFIXES.some(function(prefix) {
    return url.origin === self.location.origin &&
      (url.pathname === prefix || url.pathname.indexOf(prefix + '/') === 0);
  });
}

function isConfigRequest(request, url) {
  return request.method === 'GET' &&
    url.origin === self.location.origin &&
    /\/config\.js$/.test(url.pathname);
}

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
  var url = new URL(e.request.url);

  // Never cache GAS API calls â€” always go to network
  if (isConfigRequest(e.request, url)) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  if (isNetworkOnlyRequest(url)) {
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
        // Offline and not cached â€” return index.html for navigation requests
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

