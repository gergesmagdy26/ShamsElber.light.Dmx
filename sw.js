const CACHE_NAME = 'shamselber-light-dmx-v5.5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json?v=3',
  './FB_IMG_1794520985975.jpg',
  './css/styles.css?v=5.5',
  './css/workspace-ui.css?v=5.5',
  './css/settings.css?v=5.5',
  './css/paper.css?v=5.5',
  './css/three-view.css?v=5.5',
  './js/db.js?v=5.5',
  './js/vectors.js?v=5.5',
  './js/canvas-engine.js?v=5.5',
  './js/vendor/three.min.js?v=5.5',
  './js/three-view.js?v=5.5',
  './js/export-utils.js?v=5.5',
  './js/settings.js?v=5.5',
  './js/paper-project.js?v=5.5',
  './js/workspace-ui.js?v=5.5',
  './js/app.js?v=5.5',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './project/data.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => cache.add(url))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.pathname.startsWith('/api/')) return;
  if (reqUrl.pathname.endsWith('/project/data.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./project/data.json', clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./project/data.json'))
    );
    return;
  }
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('./index.html');
        })
      )
  );
});
