// 体調管理アプリ Service Worker v1.0
const CACHE_NAME = "health-app-v1";
const ASSETS = ["./health.html", "./manifest.json", "./icon.svg"];

// インストール：主要ファイルをキャッシュ
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// 有効化：古いキャッシュを削除
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// フェッチ：ネットワーク優先、失敗時キャッシュ（アプリ更新を確実に反映しつつオフライン対応）
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // 外部API（天気・AI）はキャッシュしない
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
