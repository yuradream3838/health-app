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
1. **⚠ 仕様を変えたら SPEC.md / API.md を必ず同じコミットで更新する**（下記「ドキュメント同期ルール」）。
2. **`api.php` はリポジトリにコミットしない**（Gemini APIキーを含む。サーバ側にのみ置く）。
3. リリース時は `health.html` 先頭の **`const APP_VERSION` を1つ上げる**（表示・SWキャッシュ更新に使用）。
4. 変更後は必ず **テストを実行**：`node test/syntax-check.js` と `node test/smoke.js`（`npm test`）。
5. AIプロキシのキー/URLは health.html の **`AI_ENDPOINT` / `AI_SECRET`** の1箇所で管理。
   エラーコード `__DAILY_LIMIT__` / `__GEMINI_RATE__` は名称固定（クライアントが特別扱い）。
6. クライアントの `X-Secret-Key` は公開露出前提。**実防御は api.php の Origin制限＋レート制限**。

## ドキュメント同期ルール（重要）
アプリ／APIの**仕様**を変更したら、**同じ作業のうちに対応するドキュメントも更新する**こと。

| 変更した内容 | 更新するドキュメント |
|---|---|
| APIのリクエスト/レスポンス/エラーコード/制限値/認証（api.php・callAIText/callAIVision 等） | **API.md**（必要なら SPEC.md の7章も） |
| 画面・タブ・機能・データ保存キー・バックアップ・PWA・テスト構成 | **SPEC.md**（関係すれば CLAUDE.md の要約も） |
| バージョン | 各docの「最終更新: v○○」表記も合わせて更新 |

- 「バグ修正だけで仕様は変わらない」場合はドキュメント更新不要。ただし挙動・契約・
  数値・画面構成が変わるなら更新必須。
- 迷ったら **API.md / SPEC.md を読み直し、記述と実装がズレていないか確認**してから終える。
- pre-commit フックが、health.html を変更したのに .md を更新していないコミットで警告する
  （導入は下記）。警告は**確認を促すためのもの**で、仕様変更でなければそのまま進めてよい。

## AIプロキシ契約（要約 / 詳細は API.md）
- `POST https://nuts024.com/health/api.php`、ヘッダ `X-Secret-Key`、JSONボディ。
- テキスト: `{system, prompt}` / 画像: `{system, prompt, image(base64), mimeType}`。
- 成功: `{text, remaining, model}`。エラー: `{error, message?}`（`__DAILY_LIMIT__`/`__GEMINI_RATE__` 等）。
- 制限（api.php v4.1）: 全体50/日、IP 15/時・30/日。モデルは flash-lite 系をフォールバック。

## よくある作業
- 機能追加/修正 → `health.html` を編集 → APP_VERSION++ → **SPEC.md/API.md を必要に応じ更新** → テスト → コミット。
- APIの挙動を確認 → **API.md** を参照（実ファイル api.php はサーバ側）。
- 仕様の全体像 → **SPEC.md** を参照。仕様を変えたら SPEC.md / API.md も更新する。

## セットアップ（初回のみ）
リポジトリ同梱の git フックを有効化（ドキュメント更新忘れを警告）:
```bash
git config core.hooksPath hooks
```
