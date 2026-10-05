# API リファレンス（AI分析プロキシ）

> AIが参照しやすいよう、`api.php`（Geminiプロキシ）と、それを呼ぶクライアント関数の
> **正確な契約**をまとめた常設リファレンス。実装は `health.html`（クライアント）と
> サーバー上の `api.php` / `alexa.php`（どちらもリポジトリ管理外）。
> 最終更新: アプリ v15.07 / api.php v4.1 / alexa.php v2.1。

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

---

## 10. 🔊 Alexa中継エンドポイント（`alexa.php` v2.1）

ブラウザからは他サイトへ `Authorization` ヘッダーを送れない（CORSのプリフライトで止まる）ため、
**サーバが代わりにトリガーURLを叩く**ための小さな中継。AIとは無関係で、`api.php` とは別ファイル。
役目は2つ：**①いますぐ叩く（中継）**と、**②決めた時刻に叩く（予約＋cron）**。

| 項目 | 値 |
|---|---|
| URL | `https://nuts024.com/health/alexa.php`（アプリ側の既定値・設定画面で変更可） |
| メソッド | `POST`（本処理） / `OPTIONS`（CORSプリフライト） |
| 認証 | ヘッダー `X-Secret-Key`（`AI_SECRET` と同値）＋ Origin 制限 |
| 置き場所 | `api.php` と同じフォルダ。**リポジトリには置かない** |

### 10-1. リクエスト（JSON・中継＝いますぐ叩く）
```json
{ "url": "https://…（トリガーのリクエスト先・httpsのみ）",
  "auth": "Bearer xxxxx",          // 任意。値だけなら Authorization ヘッダーに載せる
                                   //   「X-API-Key: xxx」のように「見出し: 値」ならその見出しで送る
                                   //   （見出しとみなすのは Authorization か、ハイフンを含む名前のときだけ。
                                   //     キー自体に : が入っていても壊さないため）
  "method": "GET" | "POST",        // 任意。既定は body があれば POST、無ければ GET
  "body": "…",                     // 任意（POSTのとき）
  "contentType": "application/json" // 任意
}
```

### 10-2. レスポンス
```json
{ "ok": true,  "status": 200, "body": "…（先頭2000文字）" }
{ "ok": false, "error": "STATUS", "status": 401, "message": "宛先が 401 を返しました" }
```

| `error` | HTTP | 意味 |
|---|---|---|
| `METHOD` | 405 | POST以外 |
| `ORIGIN` | 403 | 許可していない Origin |
| `AUTH` | 401 | `X-Secret-Key` 不一致 |
| `BODY` / `JSON` / `VERB` / `TOO_LONG` | 400 | 入力が不正 |
| `URL` | 400 | https以外／URLとして不正 |
| `HOST` | 403 | 許可外のホスト、または private/予約アドレスに解決された |
| `RATE` | 429 | 1時間あたりの上限（既定120回）を超えた |
| `FETCH` | 502 | 宛先に届かなかった（タイムアウト等） |
| `STATUS` | 200 | 宛先が 2xx 以外を返した（`ok:false` で返す） |

### 10-3. 予約（`action:"plan"`）とcron

アプリは**これから7日ぶんの「鳴らす時刻」**をまとめて預ける。サーバは受け取った配列で
予約ファイル（10-6）を**丸ごと置き換える**（差分ではない）。空配列を送れば予約は消える。

```json
{ "action": "plan",
  "items": [ { "at": 1790409600,          // UNIX秒（この時刻を過ぎたら叩く）
               "url": "https://…",        // httpsのみ。10-4の検査を通したもの
               "auth": "Bearer xxxxx",    // 任意（10-1と同じ書き方）
               "method": "GET",           // 任意
               "label": "通院（15分前）" } ]   // 任意・ログ用の表示名（60文字まで）
}
```
レスポンス：`{ "ok": true, "n": 12, "ticked": 1790409000, "now": 1790409300, "version": "2.1" }`
（保存した件数・**最後に時報が動いた時刻**（0＝一度も動いていない）・サーバーの今の時刻・版）。
アプリはこれで時報が止まっていないかを見る（10-5）。
`items` が配列でない＝`BODY`、URLが不正な項目は**その項目だけ落として**残りを保存する。
上限 `$PLAN_MAX`＝300件。

**時報（cron）**を**1分〜5分ごと**に回す。ConoHa WING のジョブスケジューラーに、次の**どちらか一方**を登録する：

```
# A) URLで（おすすめ：PHPの種類やフォルダの場所に左右されない）
curl -s "https://nuts024.com/health/alexa.php?tick=1" > /dev/null
# B) PHPで（ConoHa WING はドメインのフォルダが public_html の下にある）
/usr/bin/php /home/<アカウント名>/public_html/nuts024.com/health/alexa.php tick
```

- **B**：コマンドライン（CLI）でも、**CGI版のPHP**でも、Web のリクエストでなければ（`REQUEST_METHOD` が無ければ）時報として動く。
  引数の `tick` は `$argv`／`$_SERVER['argv']`／`$_GET`（php-cgi は引数を `$_GET` に入れることがある）のどれでもよい。
  v2.0 は CLI のときしか動かなかったので、ジョブスケジューラーのPHPがCGI版だと何もしていなかった。
- **A**：`GET ?tick=1`。時刻の来たものを叩くだけなので鍵は不要。**前回から20秒以内は何もしない**（`{"ok":true,"skipped":true}`）。
  返事は `{"ok":true,"fired":1,"kept":5}`。
- `at <= 今` の項目を順に叩き、**叩いたものは予約から消す**。未来の項目は残す
- 遅れて動いたときのために `$TICK_GRACE`＝**3600秒**より古いものは**叩かずに捨てる**
  （サーバが止まっていた間の予約を、復旧時にまとめて鳴らさないため）
- 結果はログ（10-6）に残す（時刻（日本時間）・label・HTTPステータス／`ERR …`／捨てたものは `SKIP 遅れすぎ（予定時刻）`）。直近200行
- アプリを開かなくても鳴るが、**予約は7日ぶんしかない**ので、1週間に一度はアプリを開く必要がある

### 10-4. 踏み台にされないための決まり
- **https のみ**。`gethostbyname` の結果が private/予約レンジなら拒否（社内やlocalhostを叩かせない）
- **リダイレクトを追わない**（`CURLOPT_FOLLOWLOCATION=false`）
- `$ALLOW_HOSTS` に宛先ホストを並べれば、そこだけに限定できる（空なら公開のhttpsならどこでも）
- レート制限は回数ファイル（10-6）に持つ（1時間枠）

### 10-4b. 状態（`action:"status"`）
アプリの「🩺 サーバーの状態を確認」から。**URL や認証の値は返さない**。

```json
{ "action": "status" }
→ { "ok": true, "version": "2.1", "now": 1790409300, "n": 5,
    "next": [ { "at": 1790409600, "label": "通院（15分前）" } ],      // 先頭5件
    "updated": 1790409000, "ticked": 1790409240, "lastFired": 1790405000,
    "log": [ "2026-10-05 17:00:01\t会議\t204" ] }                    // 直近10行（タブ区切り）
```
古い版（v2.0 より前）は `action` を知らないので `{ "ok": false, "error": "URL" }` が返る。アプリはこれを「古い版」と表示する。

### 10-6. 保存ファイル（外から読めない形）
| ファイル | 中身 |
|---|---|
| `alexa_plan.php` | 預かった予約（**トリガーURLと認証を含む**）・`updated`・`ticked`・`lastFired` |
| `alexa_tick.php` | 時報のログ（直近200行） |
| `alexa_rate.php` | 中継の回数（レート制限） |

- どれも**先頭に `<?php exit; ?>` を付けて保存**するので、ブラウザから開いても中身は返らない（読み書きは `alexa_read`／`alexa_write`）。
- v2.0 は `alexa_plan.json`／`alexa_tick.log`／`alexa_rate.json` として**公開フォルダにそのまま置いていた**（URLを知っていれば読めた）。
  v2.1 は最初に動いたときにこれらを新しいファイルへ移し、**元のファイルを消す**。
- ログの時刻は `Asia/Tokyo`。

### 10-5. クライアント側
- **いますぐ叩く**：`health.html` の `alexaCall(hook,done)`。設定→🔊 Alexa連携 の「中継サーバ経由」がONのときに使う。
- **予約を預ける**：`alexaSyncPlan(force,done)`（起動2.5秒後・1分ごとの見回り・予定や定期ルーティンの保存直後）。
  中身が前と同じなら送らない（12時間たてば送り直す）。「⏰ 時刻で鳴らす」をOFFにすると空配列を送る。
  返事の `ticked`／`now` を `state.alexaPlan.srv` に持ち、**時報が15分以上動いていない・一度も動いていない**ときは予約の欄に警告を出す（`alexaCronHealth`）。
  `error:"URL"`／`"HOST"` が返ったら「サーバーの alexa.php が古い版」と表示する。
- **状態を確認**：`alexaServerStatus`（`action:"status"`）→ `alexaSrvBox`。版・預かっている件数と次の予約・時報の状態・最後に鳴らした時刻・
  最近の記録（2xx＝届いた）を出し、時報が止まっていれば 10-3 の A／B のコマンドをコピーできる形で出す。

どちらも送るのは `{url, auth, 時刻, 表示名}` だけで、**体調などの記録は一切送らない**。
