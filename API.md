# API リファレンス（AI分析プロキシ）

> AIが参照しやすいよう、`api.php`（Geminiプロキシ）と、それを呼ぶクライアント関数の
> **正確な契約**をまとめた常設リファレンス。実装は `health.html`（クライアント）と
> サーバー上の `api.php` / `alexa.php` / `sync.php` / `propose.php`（どれもリポジトリ管理外。sync.php・propose.php はひな形 `server/*.php.example` だけを管理）。
> 最終更新: アプリ v15.79 / api.php v4.1 / alexa.php v2.3 / sync.php v2.1 / propose.php v1。

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

## 10. 🔊 Alexa中継エンドポイント（`alexa.php` v2.3）

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

アプリは**これから7日ぶんの「鳴らす時刻」**（前日の夜の分で、まだ時刻が来ていないものを含む・v15.30）をまとめて預ける。サーバは受け取った配列で
予約ファイル（10-6）を**丸ごと置き換える**（差分ではない）。
ただし **「時刻が来た・90秒以内に来る、まだ鳴らしていない予約」は置き換えても残す**（同じ時刻・同じURLは二重にしない。`carried`＝残した件数）。
アプリは時刻が過ぎた予約を一覧から外して送り直すので、残さないと**時報（cron）が回ってくる前に消えてしまう**（v2.2 までの不具合）。
`"clear": true` を付けたとき（「⏰ 時刻で鳴らす」や連携そのものをOFFにしたとき）は残さず**全部消す**。

```json
{ "action": "plan",
  "clear": true,                        // 任意。OFFにしたときだけ（直前・未実行の予約も消す）
  "items": [ { "at": 1790409600,          // UNIX秒（この時刻を過ぎたら叩く）
               "url": "https://…",        // httpsのみ。10-4の検査を通したもの
               "auth": "Bearer xxxxx",    // 任意（10-1と同じ書き方）
               "method": "GET",           // 任意
               "label": "通院（15分前）" } ]   // 任意・ログ用の表示名（60文字まで）
}
```
レスポンス：`{ "ok": true, "n": 12, "carried": 1, "ticked": 1790409000, "interval": 300, "now": 1790409300, "version": "2.3" }`
（保存した件数・**最後に時報が動いた時刻**（0＝一度も動いていない）・**ふだんの時報の間隔**（秒・直近12回の差の中央値。2回未満は0）・サーバーの今の時刻・版）。
アプリが「特定の日だけ止める」で止めたものは、そもそも `items` に入らない（サーバ側に止める仕組みはない）。
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
→ { "ok": true, "version": "2.3", "now": 1790409300, "n": 5,
    "next": [ { "at": 1790409600, "label": "通院（15分前）" } ],      // 先頭5件
    "updated": 1790409000, "ticked": 1790409240, "lastFired": 1790405000,
    "interval": 300, "ticks": [1790408640, 1790408940, 1790409240],   // ふだんの間隔（秒）・直近12回の時報の時刻
    "log": [ "2026-10-05 17:00:01\t会議\t204" ] }                    // 直近10行（タブ区切り）
```
古い版（v2.0 より前）は `action` を知らないので `{ "ok": false, "error": "URL" }` が返る。アプリはこれを「古い版」と表示する。

### 10-6. 保存ファイル（外から読めない形）
| ファイル | 中身 |
|---|---|
| `alexa_plan.php` | 預かった予約（**トリガーURLと認証を含む**）・`updated`・`ticked`・`ticks`（直近12回）・`lastFired` |
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
  返事の `ticked`／`now` を `state.alexaPlan.srv` に持ち、**時報が15分以上動いていない・一度も動いていない・間隔が10分より長い**ときは予約の欄に警告を出す（`alexaCronHealth`）。
  `error:"URL"`／`"HOST"` が返ったら「サーバーの alexa.php が古い版」と表示する。
  一覧は**時刻が過ぎるまで**入れる（v15.08 までは30秒前に外していた）。OFFのときは `clear:true`。
  返事の `version` が **2.3 より古い**と、予約の欄と状態の確認に「v2.3 に更新してください」と出す（`alexaSrvOutdated`）。
- **状態を確認**：`alexaServerStatus`（`action:"status"`）→ `alexaSrvBox`。版・預かっている件数と次の予約・時報の状態・最後に鳴らした時刻・
  最近の記録（2xx＝届いた）を出し、時報が止まっていれば 10-3 の A／B のコマンドをコピーできる形で出す。

どちらも送るのは `{url, auth, 時刻, 表示名}` だけで、**体調などの記録は一切送らない**。

---

## 11. ☁️ 同期エンドポイント（`sync.php` v2.1・アプリ v15.69〜／v2 はアプリ v15.72〜／v2.1＝v2＋読み取り専用トークン）

- 置き場所：`https://nuts024.com/health/sync.php`（クライアントの既定 `SYNC_URL_DEFAULT`。⚙設定で変えられる）。
- ひな形：リポジトリの `server/sync.php.example`。`SYNC_AUTH_HASH` を書き込んだ `sync.php` は**コミットしない**（`.gitignore` 済み）。
- 保存先：`sync.php` と同じフォルダの `sync_data/`（初回に自動で作る。`.htaccess` で外から読めなくする）。
  `sync_data/meta.json`（版の一覧）と `sync_data/hist/{rev}.bin`（各版）。**残す版（v2）**＝新しい `KEEP_HISTORY`=50 個＋日本時間の1日1つ（その日の最後の版）を `KEEP_DAYS`=30 日分＋1か月に1つ（その月の最後の版）を `KEEP_MONTHS`=12 か月分。それ以外は送られてきたときに消す（v1 は50個だけ）。
  `sync_data/archive/{name}.bin`＋`archive/index.json`（年ごとの記録。**版とは別で消さない**・v2）。

### 11-1. 認証・CORS
- ヘッダ `X-Sync-Auth`：64桁の16進。サーバは `sha256(この文字列)` が `SYNC_AUTH_HASH` と同じかを `hash_equals` で比べる。違えば **401** `{"error":"auth"}`（0.4秒待ってから返す）。
- この値と暗号の鍵は、クライアントが合言葉から PBKDF2-SHA256（salt `health_v2-sync-v1`・250,000回・512bit）で作る：前半256bit＝AES-GCMの鍵（端末の中だけ）、後半256bit＝`X-Sync-Auth`。`SYNC_AUTH_HASH` に貼る値は ⚙設定 →「サーバに貼る値」。
- **読み取り専用トークン（v2.1・任意）**：`SYNC_READ_HASH` に、アプリの合言葉とは無関係なランダムな値（64桁の16進）の SHA-256 を貼ると、その値を `X-Sync-Auth` に入れた呼び出しでも `meta`・`list`・`get`・`alist`・`aget` が通る（Muse など読むだけの道具用）。`put`・`aput` は **403** `{"error":"readonly"}` で断る。`SYNC_READ_HASH` が空（既定）なら無効（v2 と同じ）。無効にするには空に戻すだけ。
  取れるのは**暗号化されたままのデータ**だけで、中身を読むにはアプリの合言葉から作る鍵が別に要る（鍵を渡した相手は過去の版・年ごとの記録も含めて全部読める。トークンは「書けない・消せない」を守る仕組み）。ブラウザから呼ぶ道具は、そのサイトを `ALLOWED_ORIGINS` に足さないと 403 `origin`。
- `Origin` があって `ALLOWED_ORIGINS`（`https://yuradream3838.github.io`）に無ければ **403** `{"error":"origin"}`。`OPTIONS` は 204（`X-Sync-Auth, X-Base-Rev, X-Device, X-Archive, Content-Type` を許可、`X-Rev` を公開）。
- `X-Device`：端末の名前（`encodeURIComponent` したもの。サーバで戻して40文字まで保存）。

### 11-2. 操作（`?a=`）
| a | メソッド | 内容 | 返事 |
|---|---|---|---|
| `meta`（省略時） | GET | 今の版 | 200 `{rev, savedAt, size, device}`（空なら `rev:0`） |
| `list` | GET | 過去の版の一覧（新しい順） | 200 `{rev, items:[{rev, savedAt, size, device}]}` |
| `get` | GET | データ（暗号化されたまま）。`&id=版` で過去の版 | 200 バイナリ＋ヘッダ `X-Rev`／404 `{"error":"none"}` |
| `put` | POST | 新しい版を預ける（本文はバイナリ・先頭が `HS1`・最大20MB） | 200 `{rev, savedAt}`／409／400／413 |
| `alist` | GET | 年ごとの記録の一覧（新しい順・v2） | 200 `{items:[{name, savedAt, size, device}]}` |
| `aget` | GET | 年ごとの記録（暗号化されたまま）。`&name=` | 200 バイナリ／404／400 `name` |
| `aput` | POST | 年ごとの記録を預ける（ヘッダ `X-Archive`＝名前 `[0-9A-Za-z_-]{1,40}`、アプリは `y2025` の形）。同じ名前があれば、前のものを `名前_YYYYMMDDHHMMSS` に名前を変えて残す | 200 `{name, savedAt}`／400 `name`/`empty`/`format`／413 |

- `put` のヘッダ `X-Base-Rev`：この端末が最後に送った／読み込んだ版。はじめては `none`、上書きは `force`。
  サーバの今の版と違えば（`none` でサーバにデータがあるときも）**409** `{"error":"conflict", rev, savedAt, device}` を返して**保存しない**（別の端末のデータを黙って消さない）。
- エラー：400 `empty`/`format`/`id`/`action`/`name`、403 `readonly`（読み取り専用トークンで書こうとした・v2.1）、405 `method`、413 `too_large`、500 `mkdir`/`lock`/`write`。

### 11-3. 本文の形（クライアントが作る）
`"HS1"`(3byte) ＋ 圧縮フラグ(1byte：1＝gzip／0＝なし) ＋ IV(12byte) ＋ AES-GCM の暗号文。
中身は手動のバックアップと同じ JSON（`buildBackupPayload()`）。サーバは中身を読めない。

### 11-4. クライアント側（health.html）
- 設定は端末ごと：`localStorage["health_v2_sync"]`＝`{url, device, auth, key, authHash, on, rev, upAt, downAt, dirtyAt, conflict, err, errAt}`（合言葉そのものは保存しない）。
- `safeSet` で `health_v2…` に保存するたびに「送っていない変更あり」（`dirtyAt`）。`_sync`・`_nudges`・`_lastbackup` は除く。サーバから読み込んでいる最中の保存も除く。
- 自動（`on`）：変更から2分たったら毎分のチェックで送る（失敗が続くときは5分あける）／画面を閉じたとき（`visibilitychange`）に送る／開いたとき・画面に戻ったとき・**開いている間も3分ごと（`SYNC_CHECK_MS`・v15.73。画面が隠れているとき・記録の画面を開いているとき・文字を入力中は待つ）**に `meta` を見て、サーバの方が新しく送っていない変更がなければ自動で読み込む。両方に変更があれば `conflict` にして選んでもらう。
- 読み込むときに送っていない変更があれば、先に今のデータをファイル（`health_backup_日付_before_sync.json`）に書き出す。
- **年ごとの記録（v15.72）**：「データがいっぱい」で年を書き出すと（`exportArchiveYear`）、☁️同期を設定していれば `aput` で `y年` として預ける（中身は書き出すファイルと同じ `kind:"archive"`・同じ暗号化）。⚙設定の「🗄 年ごとの記録」で一覧（`alist`）→「👁 見る」（`aget` → `viewBackupPayload`＝見るだけ・今のデータは触らない）／「📥 戻す」（`mergeArchive`＝今のデータに足す）／まだ消していない年も「☁️ この年を預ける」。
- **過去の版を見る（v15.72）**：「🕘 過去の版」の「👁 見る」は `get&id=` を見るだけで開く（「この版に戻す」は置き換え）。
- **見ている間は同期しない（v15.72）**：バックアップ・過去の版・年ごとの記録を見ている間（`state.viewingBackup`）は、送る・読み込む・変えた時刻の記録をしない（見ている中身を今のデータとして送らないため）。
- **双方向（v15.70）**：中身に `_syncStamps`（`{ユニット: 最後に変えた時刻(ms)}`）を付けて送る（サーバは中身を読まないので sync.php は変更なし）。
  - ユニット：`dailies|日付|項目`（日記の項目ごと）。**一覧の項目（飲酒・服薬・食べたもの・射精・昼寝…）は1件ずつ**（v15.71）：`dailies|日付|項目|#鍵`（鍵＝`u`+uid → `t`+記録時刻 → `v`+中身）と、一覧があることを表す `dailies|日付|項目|[]`。組み立てるときは時刻のある一覧を時刻順に並べる／`logs|日付|h時`（体調記録は時ごと・v15.71。それまでは日ごと）／`todos|日付|id`／`schedule|日付`／`weather|日付`／`modeLog|始まった日`／それ以外のトップの項目は丸ごと（`goals`・`foodNutri` など）。
  - 時刻は端末の `localStorage["health_v2_syncstamps"]`。保存のたび（1.5秒まとめて）に、前に見た中身と比べて変わった・消えたユニットに今の時刻を付ける（消したことも記録）。
  - **重複**（v15.71）：同じ日の同じ一覧で、片方の端末にしかない記録どうしが同じしるし（`id`/`name`/`label`/`tag`/`cat` と時刻 `hour`/`min`/`startNextDay`/`t`/`start`）なら、変えた時刻が新しいほうだけ残し、消した方に今の時刻を付ける（時刻のない記録は重複を見ない）。
  - `put` が **409** のとき：サーバの最新を取ってきて、ユニットごとに**時刻が新しいほう**を残して混ぜ、この端末に反映してから、その版を基準に送り直す（最大2回）。時刻が同じ（どちらも記録なし）なら、片方にしかなければそれを残し、両方にあって違えば新しく書き出したほうを残す。混ぜられないとき（読めない等）だけ `conflict` にして選んでもらう。
  - 開いたとき：サーバの方が新しく、この端末にも送っていない変更があれば、送る（＝混ぜて送る）。変更がなければそのまま読み込み、サーバの時刻も取り込む。
  - 過去の版に戻したときは、戻して変わったユニットに今の時刻を付ける（次に送ると、ほかの端末でも戻した内容が残る）。

---

## 12. 📨 提案の受け箱（`propose.php` v1・アプリ v15.78〜）

Muse（読むだけの道具）が、本体のデータ（`sync.php` の `put`）には触らずに、**目標の追加・予定の追加の「提案」だけ**を置く入口。
アプリが取り込んで確かめ、本人がアプリで「反映する」を押したものだけを、アプリ自身が反映する（設計：連携ハブ `handoff/2026-11-14-scoped-write-design.md`）。

- 置き場所：`sync.php` と同じフォルダ（`https://nuts024.com/health/propose.php`）。アプリは同期のURLの `sync.php` を `propose.php` に替えて使う（`propUrl()`。`_sync.propUrl` があればそれ）。
- ひな形：`server/propose.php.example`。`SYNC_AUTH_HASH`（sync.php と同じ値）・`PROP_CREATE_HASH`（提案トークンの SHA-256）を書き込んだ `propose.php` は**コミットしない**（`.gitignore` 済み）。
- 保存先：`sync_data/proposals/{id}.bin`＋`index.json`（暗号文のまま）。初回に `proposals/.htaccess` と空の `index.html` を自分で作る（sync.php の `.htaccess` が無くても外から読めない）。保留は **14日**で期限切れ、保留が **50件**あると `pcreate` は 429。

### 12-1. 認証・CORS
- どちらも `X-Sync-Auth`（予備に `X-Prop-Auth`）で受け、SHA-256 で見分ける：本物（`SYNC_AUTH_HASH`）／提案トークン（`PROP_CREATE_HASH`・空なら無効）。どちらでもなければ 401（0.4秒待つ）。読み取り専用トークンでは通らない。
- CORS は sync.php と同じ（`ALLOWED_ORIGINS`・許可外の Origin は 403・Origin なしは通す・OPTIONS 204・許可ヘッダ `X-Sync-Auth, X-Prop-Auth, Content-Type`）。

### 12-2. 操作（`?a=`）
| a | メソッド | 認証 | 内容 | 返事 |
|---|---|---|---|---|
| `pcreate` | POST | 提案トークンだけ | 提案を置く（本文は先頭 `HS1` の暗号文・最大64KB） | 200 `{id, createdAt}`／403 `forbidden`（本物では作れない）／400 `empty`/`format`／413／429 `too_many` |
| `plist` | GET | どちらでも | 保留中の一覧（中身は返さない）。期限切れはここで掃除 | 200 `{items:[{id, createdAt, size}]}`（新しい順） |
| `pget` | GET | 本物だけ | 提案の中身（暗号文のまま）。`&id=` | 200 バイナリ／403／404／400 `id` |
| `pdel` | POST | 本物だけ | 提案を片付ける（反映・却下どちらでも）。`&id=` | 200 `{deleted}`／403／400 `id` |

- `id` は `YYYYMMDDHHMMSS_8桁16進`（`[0-9A-Za-z_-]{1,40}` 以外は 400）。

### 12-3. 提案の中身（復号すると JSON）
暗号化は同期と同じ（11-3：`HS1`＋圧縮フラグ＋IV＋AES-GCM。鍵は合言葉から作る前半32バイト）。
```json
{"v":1, "createdAt":"…", "reason":"なぜ提案するか（任意・1000文字まで）",
 "ops":[
   {"type":"goal.add", "parentId":null, "node":{"text":"…", "periodType":"weekly", "periodKey":"weekly_2026-11-16", "note":""}},
   {"type":"schedule.add", "date":"2026-11-20", "entry":{"title":"…", "startH":10, "startM":0, "endH":11, "endM":0, "allDay":false, "note":""}},
   {"type":"shopping.add", "text":"生姜", "cat":"food"}
 ]}
```
- `ops` は1〜20個。**受け付けるのは `goal.add`・`schedule.add`・`shopping.add`（v15.79〜）だけ**（それ以外がひとつでもあれば、その提案は「読めない提案」扱い）。
- `goal.add`：目標ツリー（`state.goalTree`）への追加だけ（変更・削除は対象外）。`text` 1〜200文字、`periodType`＝yearly/quarterly/monthly/weekly/daily、`periodKey` はアプリの形（`pkParse` で読めて、weekly は月曜の日付・daily は正しい日付・monthly は1〜12月・quarterly は Q1〜Q4）、`note` 1000文字まで。`parentId` は null（いちばん上）か、ある目標の id（無ければ「読めない提案」）。`id`・`done:false`・`children:[]`・`collapsed:false` はアプリが付ける。同じ親に同じ文面・同じ期間の目標があれば足さない。
- `schedule.add`：`date` は正しい日付。受け付ける項目は `title`（1〜100文字）・`startH`/`startM`/`endH`/`endM`（終日でなければ必須・0〜23/0〜59、endH は24まで）・`allDay`・`note`（1000文字まで）だけで、**ほかの項目は捨てる**。`uid`（`Date.now()+Math.random()`）・色（`EV_DEFAULT`）はアプリが付ける。同じ日・同じ開始時刻・同じ名前の予定があれば足さない。
- `shopping.add`（v15.79〜）：買物リスト（`state.tasks.shopping`）への追加だけ（変更・削除・買った印は対象外）。`text` 1〜100文字（前後の空白は除く）、`cat` は省略可で、付けるなら `want`/`daily`/`food` のどれか（それ以外は「読めない提案」）。省略時はアプリの既定の `food`（🍎 食品）。ほかの項目（`done`・`uid` など）は捨てる。`uid`（`Date.now()`。重ならないよう1ずつずらす）・`done:false` はアプリが付け、末尾に足す。同じ文面の**まだ買っていない**項目があれば足さない（同じ提案の中の重複も1つにする）。買った（done）項目と同じ文面なら足す。保存は通常の `saveTasks`（同期の単位は `tasks` 全体）。

### 12-4. アプリ側（health.html）
- **取り込み**（`propRefresh`）：同期の見回り（起動して4秒後・画面に戻ったとき・開いている間3分ごと）のついでに `plist` → まだ持っていない提案を `pget` → `syncDecode` で復号して端末に控える（`localStorage["health_v2_propcache"]`。同期の対象にしない）。サーバに無くなった提案（期限切れ・別の端末で決めた）は控えからも外す。☁️同期が ON のときだけ（⚙設定の「📨 提案を確かめる」はいつでも）。
- **表示**：ホームの「📨 Claude からの提案 N件」（ウィジェットの項目 `proposals`・宣言の下・反映待ちがあるときだけ）。提案ごとに、届いた日時・理由（`reason`）・操作を読みやすく（目標＝文面・期間・親／予定＝日時・名前・メモ／買物＝「🛒 買物リストに追加：「生姜」（🍎 食品）」。すでにあるものは「足しません」）出し、［✓ 反映する］［却下する］。決まった形を確かめてから出す（`propValidate`。表示するたびに今のデータで確かめ直す）。
- **読めない・形が違う提案**は表示せず、⚙設定の同期カードに「⚠ 読めない提案が N件あります［消す］」（`pdel` で片付ける）。
- **反映**（`propDecide(id,true)`・提案ごと）：直前にサーバの最新と混ぜる（`syncMergeFromServer`）→ 確かめ直す → 目標・予定・買物リストに追加（`saveGoalTree`/`saveSchedule`/`saveTasks`。変えた時刻は通常どおり付く）→ 処理済みの ID を記録 → `pdel` → すぐに送る（`syncUpload(false)`）。却下は反映せずに記録と `pdel` だけ。
- **二重に反映しない**：処理済みの ID を端末に残す（直近100件・`localStorage["health_v2_propdone"]`）。サーバに残っていても表示しない（`pdel` に失敗していたら次の見回りでもう一度片付ける）。予定・目標・買物（まだ買っていないもの）は同じものがあれば足さない。
- 自動では反映しない。バックアップを見ている間は取り込まない・決められない。

