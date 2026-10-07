const CACHE_NAME = 'rentmanor-shell-v24';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './accessibility.js',
  './auth.js',
  './account-scope.js',
  './errors.js',
  './property-row.js',
  './property-tabs.js',
  './media.js',
  './export.js',
  './pdf-report.js',
  './scoped-client.js',
  './validation.js',
  './recovery.js',
  './recovery-ui.js',
  './vendor/pdf-lib.js',
  './vendor/fontkit.js',
  './fonts/NotoSans-Regular.ttf',
  './sample-media/00000000-0000-4000-8000-000000000011.svg',
  './sample-media/00000000-0000-4000-8000-000000000012.svg',
  './sample-media/00000000-0000-4000-8000-000000000013.svg',
  './sample-media/00000000-0000-4000-8000-000000000031.svg',
  './sample-media/00000000-0000-4000-8000-000000000032.pdf',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache config.js. On failure do not return a fake JS body â€” that used to
  // execute as success without setting window.RENTAL_HOME_CONFIG and walled auth.
  // Network-only: a miss leaves private operations unavailable; local sample works.
  if (url.pathname.endsWith('/config.js') || url.pathname.endsWith('config.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then(response => {
        if (!response.ok) return Response.error();
        return response;
      }).catch(() => Response.error())
    );
    return;
  }

  if(url.searchParams.has('token')||url.pathname.includes('/storage/')||url.pathname.includes('/rest/'))return;
  const allowed=APP_SHELL.some(path=>new URL(path,self.location.href).pathname===url.pathname);if(!allowed)return;
  const networkFirst = url.pathname.endsWith('/') || /\.(?:html|js|css)$/.test(url.pathname);
  if (networkFirst) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
