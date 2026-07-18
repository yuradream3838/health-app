// 体調管理アプリ Service Worker v2.0
// HTML(ドキュメント)は常に最新をネットワークから取得し、オフライン時のみキャッシュを使う。
// これにより「古いバージョンが表示される」問題を防ぐ。
const CACHE_NAME = "health-app-v2";
const ASSETS = ["./health.html", "./manifest.json", "./icon.svg"];

// インストール：主要ファイルをキャッシュ（オフライン用）
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// 有効化：古いキャッシュを削除して即座に制御を奪う
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// フェッチ戦略
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // 外部API（天気・AI）はキャッシュせずそのまま
  if (url.origin !== location.origin) return;

  // ドキュメント（HTML/ナビゲーション）は「常に最新」：
  //   ネットワークをno-storeで取得（ブラウザHTTPキャッシュも迂回）。
  //   成功時はオフライン用にSWキャッシュへ複製。失敗時のみキャッシュを返す。
  const isDoc = e.request.mode === "navigate"
    || url.pathname.endsWith("health.html")
    || url.pathname.endsWith("/");

  e.respondWith((async () => {
    try {
      const res = await fetch(e.request, { cache: isDoc ? "no-store" : "no-cache" });
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});

// クライアントからの即時更新要求
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
