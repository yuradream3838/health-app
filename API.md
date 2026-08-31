# API リファレンス（AI分析プロキシ）

> AIが参照しやすいよう、`api.php`（Geminiプロキシ）と、それを呼ぶクライアント関数の
> **正確な契約**をまとめた常設リファレンス。実装は `health.html`（クライアント）と
> サーバー上の `api.php`（リポジトリ管理外）。最終更新: アプリ v13.41 / api.php v4.1。

---

## 1. エンドポイント

| 項目 | 値 |
|---|---|
| URL | `https://nuts024.com/health/api.php` |
| メソッド | `POST`（本処理） / `GET`（デバッグのみ） / `OPTIONS`（CORSプリフライト） |
| 実体 | ConoHa WING 上の PHP。Google Gemini `generativelanguage.googleapis.com/v1beta` を代理呼び出し |
| 認証 | HTTPヘッダ `X-Secret-Key`（補助）＋ Origin/Referer 制限（主防御） |

### クライアント側の定数（health.html）
```js
const AI_ENDPOINT = "https://nuts024.com/health/api.php";
const AI_SECRET   = "songof3838";           // 公開露出前提。実防御はサーバ側
function aiHeaders(){ return {"Content-Type":"application/json","X-Secret-Key":AI_SECRET}; }
```
`api.php` 側の `$SECRET_KEY` はこの `AI_SECRET` と**同値である必要がある**。

---

## 2. リクエスト（POST・JSONボディ）

`Content-Type: application/json`、ヘッダ `X-Secret-Key: <AI_SECRET>`。

### 2-1. テキスト分析
```json
{
  "system": "システムプロンプト（役割・出力形式の指示）",
  "prompt": "ユーザープロンプト（必須）"
}
```

### 2-2. 画像つき（写真取り込み）
```json
{
  "system": "システムプロンプト",
  "prompt": "ユーザープロンプト（必須）",
  "image": "<base64文字列。data:プレフィックスなし>",
  "mimeType": "image/jpeg"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `system` | string | 任意 | Gemini の `system_instruction` に渡る |
| `prompt` | string | **必須** | 空だと 400 |
| `image` | string(base64) | 任意 | あれば Gemini の `inline_data` として添付。`data:...base64,` が付いていてもサーバ側で除去 |
| `mimeType` | string | 任意 | 既定 `image/jpeg` |

---

## 3. レスポンス

### 3-1. 成功（HTTP 200）
```json
{
  "text": "AIの応答テキスト",
  "remaining": 49,          // 全体1日上限の残り回数
  "model": "gemini-2.5-flash-lite"  // 実際に使われたモデル
}
```
クライアントは `data.text` を返し、`data.remaining != null` のとき
`state.aiAnalysisRemaining` に保存する。

### 3-2. エラー（`error` フィールドを持つJSON）
クライアント（`callAIText` / `callAIVision`）は `data.error` があれば例外を投げる。
`__DAILY_LIMIT__` と `__GEMINI_RATE__` は `message` を優先表示、それ以外は `error` 文字列を表示。

| HTTP | `error` | 意味 | クライアント表示 |
|---|---|---|---|
| 400 | `prompt is required` | prompt が空 | error文字列 |
| 401 | `Unauthorized` | `X-Secret-Key` 不一致 | error文字列 |
| 403 | `Forbidden` | Origin/Referer 不許可（直叩き等） | error文字列 |
| 405 | `Method not allowed` | POST以外 | error文字列 |
| 429 | `__DAILY_LIMIT__` | 全体1日上限 or IP上限に到達 | `message`（本日の上限/ネットワーク上限） |
| 429 | `__GEMINI_RATE__` | Gemini側レート制限 | `message`（混雑中） |
| 503 | `__GEMINI_RATE__` | 全モデル過負荷 | `message`（混雑中） |
| 500 | `サーバー側でAPIキーが未設定です` | `$GEMINI_KEY` 未設定 | error文字列 |
| 500 | `Gemini APIエラー (HTTP x, model: y): ...` | Gemini異常応答 | error文字列 |
| 500 | `AIからの応答が空でした。再試行してください` | 応答テキスト空 | error文字列 |
| 502 | `通信エラー: ...` | cURL失敗 | error文字列 |

> 特殊エラーコードは**文字列リテラル**として厳密一致で扱う：`__DAILY_LIMIT__` / `__GEMINI_RATE__`。

---

## 4. 制限（api.php v4.1 の既定値）

| 変数 | 値 | 意味 |
|---|---|---|
| `$DAILY_LIMIT` | 50 | 全体：1日あたり総リクエスト上限 |
| `$IP_HOUR_LIMIT` | 15 | IP単位：1時間あたり上限 |
| `$IP_DAY_LIMIT` | 30 | IP単位：1日あたり上限 |
| cURL timeout | 40秒 | 画像処理を考慮 |
| `maxOutputTokens` | 1500 | Gemini生成上限 |
| `temperature` | 0.7 | — |

- カウントは成功時のみ加算。保存ファイル：`api_count.json`（全体）/ `api_ip.json`（IP別・24hで自動掃除）
- モデルは順にフォールバック：`gemini-2.5-flash-lite` → `gemini-2.0-flash-lite` → `gemini-2.0-flash` → `gemini-2.5-flash`（503/429で次へ）

---

## 5. セキュリティモデル

- クライアントは公開配信のため `X-Secret-Key` は**隠せない（露出前提）**
- **主防御はサーバ側**：
  1. **Origin/Referer 厳格チェック** … `https://yuradream3838.github.io` のみ許可。Origin優先、無ければRefererを前方一致。どちらも無ければ拒否（curl等の直叩きを弾く）
  2. **レート制限** … IP時間/日＋全体日（上表）
  3. **シークレットキー** … 二次的チェック
- CORSヘッダは `api.php` が発行（`Access-Control-Allow-Origin: <許可Origin>` 他）。**重複発行は不可**（アプリが止まる）
- `api.php` は Gemini APIキーを保持するため**リポジトリに置かない**

---

## 6. デバッグエンドポイント

```
GET https://nuts024.com/health/api.php?debug=1&key=<SECRET_KEY>
```
設定状況をJSONで返す（`keyConfigured`, `keyLength`, `models`, 各上限, `currentCount`,
`yourIp`, `today`, `php_version` 等）。`key` が `$SECRET_KEY` と一致しないと拒否。

---

## 7. Gemini へのペイロード形（api.php 内部）

```json
{
  "system_instruction": { "parts": [ { "text": "<system>" } ] },
  "contents": [
    { "role": "user", "parts": [
        { "text": "<prompt>" },
        { "inline_data": { "mime_type": "<mime>", "data": "<base64>" } }
    ] }
  ],
  "generationConfig": { "maxOutputTokens": 1500, "temperature": 0.7 }
}
```
※ `inline_data` パートは画像がある場合のみ付与。

---

## 8. curl 例（防御の動作確認）

```bash
# 直叩き（Origin/Refererなし）→ 403 Forbidden が返れば防御OK
curl -i -X POST https://nuts024.com/health/api.php \
  -H "X-Secret-Key: songof3838" -d '{"prompt":"test"}'

# 正規のOriginを付ければ通る（本来はブラウザが自動付与）
curl -i -X POST https://nuts024.com/health/api.php \
  -H "Origin: https://yuradream3838.github.io" \
  -H "X-Secret-Key: songof3838" \
  -H "Content-Type: application/json" \
  -d '{"system":"","prompt":"ping"}'
```

---

## 9. 変更時の注意（AI・開発者向け）

- クライアントのキー/URL変更は `AI_ENDPOINT` / `AI_SECRET` の1箇所（health.html）
- 新しいリクエストフィールドを足す場合はクライアント（`callAIText`/`callAIVision`）と
  `api.php` の両方を対応させる
- エラーコード `__DAILY_LIMIT__` / `__GEMINI_RATE__` はクライアントが特別扱いするため名称固定
- `api.php` を変更したら `?debug=1` と直叩き403で動作確認
