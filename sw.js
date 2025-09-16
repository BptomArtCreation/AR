// 提升版本避免舊快取
const CACHE = 'ar-cache-v6';
const ASSETS = [
  '.', 'index.html', 'arjs.html', 'styles.css', 'app.js',
  'detector.js', 'overlay.js', 'capture.js', 'util.js',
  'manifest.webmanifest',
  'assets/overlay.png', 'assets/overlay.mp4',
  // 視需求加入 3D 模型與 NFT 資料集（請改成你的實際檔名）
  // 'assets/model.glb',
  // 'assets/nft/target-image.iset',
  // 'assets/nft/target-image.fset',
  // 'assets/nft/target-image.fset3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});