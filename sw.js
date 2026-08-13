// BLOCKS service worker — versioned cache-first so the app boots offline at the gym.
const V = 'blocks-v67';
const ASSETS = ['./', './index.html', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Cache-first with background refresh: instant offline boot, silent update fetch.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // No webfont branch: the app dropped its condensed display face, so there is no third-party
  // request left to cache and nothing to fetch before type renders. The old blocks-fonts-v1 cache
  // is no longer exempted above, so it is evicted on activate.
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const refresh = fetch(e.request).then(res => {
        if (res && res.ok) caches.open(V).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
