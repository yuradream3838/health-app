# CLAUDE.md — AI向けプロジェクトガイド

このリポジトリで作業するAI（Claude等）が最初に読むための入口。詳細は各ドキュメントへ。

## これは何か
「体調管理」= 個人用の健康管理 **PWA**。体調・睡眠・飲酒・運動・タスク・目標を記録し、
シフト勤務前提の予定管理と減酒・生活改善支援を行う。

## 構成（重要）
- **アプリ本体は単一ファイル `health.html`**（HTML/CSS/JS を内包・ビルド不要・バニラJS）。
  変更はすべてこの1ファイルに対して行う。
- データは **localStorage のみ**（サーバDBなし）。キー接頭辞 `health_v2`。
- AIは外部プロキシ **`api.php`（ConoHa上）経由で Gemini** を呼ぶ。
- 配信は **GitHub Pages**（`https://yuradream3838.github.io`）。

## ドキュメント
- 全体仕様: **[SPEC.md](./SPEC.md)** — 画面構成・機能・データ・PWA・テスト
- APIの正確な契約: **[API.md](./API.md)** — リクエスト/レスポンス/エラーコード/制限/セキュリティ

## 必ず守るルール
1. **`api.php` はリポジトリにコミットしない**（Gemini APIキーを含む。サーバ側にのみ置く）。
2. リリース時は `health.html` 先頭の **`const APP_VERSION` を1つ上げる**（表示・SWキャッシュ更新に使用）。
3. 変更後は必ず **テストを実行**：`node test/syntax-check.js` と `node test/smoke.js`（`npm test`）。
4. AIプロキシのキー/URLは health.html の **`AI_ENDPOINT` / `AI_SECRET`** の1箇所で管理。
   エラーコード `__DAILY_LIMIT__` / `__GEMINI_RATE__` は名称固定（クライアントが特別扱い）。
5. クライアントの `X-Secret-Key` は公開露出前提。**実防御は api.php の Origin制限＋レート制限**。

## AIプロキシ契約（要約 / 詳細は API.md）
- `POST https://nuts024.com/health/api.php`、ヘッダ `X-Secret-Key`、JSONボディ。
- テキスト: `{system, prompt}` / 画像: `{system, prompt, image(base64), mimeType}`。
- 成功: `{text, remaining, model}`。エラー: `{error, message?}`（`__DAILY_LIMIT__`/`__GEMINI_RATE__` 等）。
- 制限（api.php v4.1）: 全体50/日、IP 15/時・30/日。モデルは flash-lite 系をフォールバック。

## よくある作業
- 機能追加/修正 → `health.html` を編集 → APP_VERSION++ → テスト → コミット。
- APIの挙動を確認 → **API.md** を参照（実ファイル api.php はサーバ側）。
- 仕様の全体像 → **SPEC.md** を参照。仕様を変えたら SPEC.md / API.md も更新する。
