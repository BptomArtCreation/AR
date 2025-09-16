self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ar-cache-v1').then(cache => cache.addAll([
      '/', '/index.html', '/styles.css', '/app.js',
      '/detector.js', '/overlay.js', '/capture.js', '/xr.js', '/util.js',
      '/manifest.webmanifest'
    ]))
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});