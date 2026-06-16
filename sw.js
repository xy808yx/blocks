// BLOCKS service worker — versioned cache-first so the app boots offline at the gym.
const V = 'blocks-v12';
const FONTS = 'blocks-fonts-v1';
const ASSETS = ['./', './index.html', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== V && k !== FONTS).map(k => caches.delete(k))))
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
  // Display font (Google Fonts): cache-first so type renders offline after first load.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.open(FONTS).then(c =>
        c.match(e.request).then(hit => {
          const net = fetch(e.request).then(res => {
            if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }
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
