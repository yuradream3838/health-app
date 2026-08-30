# テスト（回帰チェック）

`health.html` は単一ファイルの大きなアプリなので、変更後に壊れていないかを
素早く確認するための最小限のテストを用意しています。

## 内容

| ファイル | 種類 | 依存 | 目的 |
|---|---|---|---|
| `test/syntax-check.js` | 構文チェック | なし（Node標準のみ） | 最大の `<script>` を抽出し `node --check` にかける |
| `test/smoke.js` | スモークテスト | Chromium ＋ playwright-core | 実ブラウザで全タブ・サブタブを描画し、JSエラー0を確認 |

## 実行方法

```bash
# 構文チェックだけ（依存なし・一瞬）
node test/syntax-check.js

# スモークテスト（要 Chromium ＋ playwright-core）
npm i -D playwright-core      # 初回のみ
node test/smoke.js

# まとめて
npm test
```

## スモークテストの環境変数（任意）

自動探索で見つからない場合のみ指定します。

- `CHROMIUM_PATH` … Chromium 実行ファイルの絶対パス
- `PLAYWRIGHT_BROWSERS_PATH` … Chromium を探すディレクトリ（既定 `/opt/pw-browsers`）
- `PLAYWRIGHT_CORE` … `playwright-core` モジュールのパス

例：
```bash
CHROMIUM_PATH=/path/to/chrome node test/smoke.js
```

## チェックしていること

- メインタブ全走査：予定 / 日記 / タスク / 達成 / 分析 / 設定
- サブタブ全走査（各ハブ）
- ウィジェット（既定ランディング）
- 主要機能の存在・基本動作：AI呼び出しの一元化、ルーティン編集、
  バックアップ、文字サイズ、機能一覧
- 上記すべてで `pageerror` / `console.error` が **0件** であること

いずれか失敗すると終了コード非0で落ちるので、CIやコミット前チェックに使えます。
