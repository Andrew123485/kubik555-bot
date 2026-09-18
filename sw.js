// Service Worker for Offline PWA Support (v36 — Water Lagoon & 3D Splashes)
const CACHE_NAME = 'dice-oracle-v36';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './three.min.js',
  './GLTFLoader.js',
  './market_dice.glb'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }

  const url = e.request.url;
  const isStaticAsset = url.includes('.glb') || url.includes('.js') || url.includes('.png') || url.includes('.jpg') || url.includes('.woff');

  // Cache-First for 3D model, textures, and scripts for instant 0ms rendering
  if (isStaticAsset) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // Network-First for HTML so updates are received immediately
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((networkRes) => {
      if (networkRes && networkRes.status === 200) {
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return networkRes;
    }).catch(() => {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
