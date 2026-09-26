// 서비스 워커: 앱 파일을 기기에 저장해 두어 인터넷이 없는 연습실에서도 열리게 합니다.
// 앱 파일을 바꾸면 VERSION 을 올려 주세요. (tests/run-tests.js 가 PRECACHE 목록의 파일이 모두 있는지 확인합니다)
const VERSION = 'v1';
const CACHE = `page-turner-${VERSION}`;
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/score-model.js',
  'js/score-follower.js',
  'js/audio-analyzer.js',
  'js/demo-player.js',
  'js/score-view.js',
  'js/app.js',
  'vendor/opensheetmusicdisplay.min.js',
  'vendor/jszip.min.js',
  'samples/sample-score.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('page-turner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 앱 화면에서 "새로고침" 을 누르면 기다리던 새 버전으로 바꿉니다.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// 저장해 둔 파일을 먼저 쓰고(빠르고 오프라인에서도 됨), 없으면 네트워크에서 받아 저장합니다.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
