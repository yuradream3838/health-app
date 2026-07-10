<?php
// 体調管理アプリ AI分析API (Gemini版) v3.0 改良版
// ConoHa WING の nuts024.com/health/ フォルダに設置
//
// 【設定手順】
// 1. https://aistudio.google.com/apikey でAPIキーを無料発行
// 2. 下の $GEMINI_KEY にキーを貼り付け
// 3. このファイルをConoHa WINGにアップロード
//
// 【動作確認】
// ブラウザで以下にアクセス（キーの設定状況・カウントを確認）:
// https://nuts024.com/health/api.php?debug=1&key=songof3838

$ALLOWED_ORIGIN = "https://yuradream3838.github.io";
$SECRET_KEY     = "songof3838";
$GEMINI_KEY     = ""; // ★ここにGeminiのAPIキーを入れる★
$GEMINI_MODELS  = [
    "gemini-2.5-flash-lite",   // 第1候補（軽量・無料枠が緩い）
    "gemini-2.0-flash-lite",   // 第2候補
    "gemini-2.0-flash",        // 第3候補
    "gemini-2.5-flash",        // 第4候補
];
$DAILY_LIMIT    = 50; // 1日あたりの利用上限
$COUNT_FILE     = __DIR__ . "/api_count.json";

// ── デバッグモード ──
if(($_GET["debug"] ?? "") === "1"){
    header("Content-Type: application/json; charset=utf-8");
    if(($_GET["key"] ?? "") !== $SECRET_KEY){
        echo json_encode(["error"=>"デバッグにはkeyが必要です"]); exit;
    }
    $countData = file_exists($COUNT_FILE) ? json_decode(file_get_contents($COUNT_FILE), true) : null;
    $canWrite  = @file_put_contents($COUNT_FILE, file_exists($COUNT_FILE) ? file_get_contents($COUNT_FILE) : '{}') !== false;
    echo json_encode([
        "keyConfigured"    => !empty($GEMINI_KEY),
        "keyLength"        => strlen($GEMINI_KEY),
        "models"           => $GEMINI_MODELS,
        "dailyLimit"       => $DAILY_LIMIT,
        "countFile"        => $COUNT_FILE,
        "countFileExists"  => file_exists($COUNT_FILE),
        "countFileWritable"=> $canWrite,
        "currentCount"     => $countData,
        "today"            => date("Y-m-d"),
        "php_version"      => phpversion(),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

header("Access-Control-Allow-Origin: " . $ALLOWED_ORIGIN);
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Secret-Key");
header("Content-Type: application/json; charset=utf-8");

if($_SERVER["REQUEST_METHOD"] === "OPTIONS"){ http_response_code(200); exit; }

if(($_SERVER["HTTP_X_SECRET_KEY"] ?? "") !== $SECRET_KEY){
    http_response_code(401); echo json_encode(["error"=>"Unauthorized"]); exit;
}
if($_SERVER["REQUEST_METHOD"] !== "POST"){
    http_response_code(405); echo json_encode(["error"=>"Method not allowed"]); exit;
}
if(empty($GEMINI_KEY)){
    http_response_code(500); echo json_encode(["error"=>"サーバー側でAPIキーが未設定です"]); exit;
}

// ── 回数制限チェック（堅牢版）──
$today = date("Y-m-d");
$count = ["date"=>$today, "n"=>0];
$countReadable = false;
if(file_exists($COUNT_FILE)){
    $raw = @file_get_contents($COUNT_FILE);
    if($raw !== false){
        $c = json_decode($raw, true);
        if(is_array($c) && isset($c["date"], $c["n"])){
            $countReadable = true;
            if($c["date"] === $today) $count = $c;
            // 日付が違えば $count は初期値（=リセット）
        }
    }
}

// カウントが読めた場合のみ上限チェック（ファイル異常時は誤ブロックしない）
if($countReadable && $count["n"] >= $DAILY_LIMIT){
    http_response_code(429);
    echo json_encode(["error"=>"__DAILY_LIMIT__", "message"=>"本日の利用上限に達しました（明日リセットされます）"]); exit;
}

$body   = json_decode(file_get_contents("php://input"), true);
$prompt = $body["prompt"] ?? "";
$system = $body["system"] ?? "";
if(empty($prompt)){
    http_response_code(400); echo json_encode(["error"=>"prompt is required"]); exit;
}

// ── Gemini API 呼び出し（モデルフォールバック付き）──
$payload = json_encode([
    "system_instruction" => ["parts" => [["text" => $system]]],
    "contents" => [["role"=>"user","parts"=>[["text"=>$prompt]]]],
    "generationConfig" => ["maxOutputTokens" => 1500, "temperature" => 0.7]
]);

$response = false; $httpCode = 0; $curlErr = ""; $usedModel = "";
foreach($GEMINI_MODELS as $model){
    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$GEMINI_KEY}";
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ["Content-Type: application/json"],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    $usedModel = $model;
    // 503(過負荷)・429(レート制限)なら次のモデルへフォールバック
    if($httpCode === 503 || $httpCode === 429) continue;
    break; // 成功またはその他のエラーはループを抜ける
}

// ── Geminiのエラーを区別して返す ──
if($response === false){
    http_response_code(502);
    echo json_encode(["error"=>"通信エラー: ".$curlErr]); exit;
}
if($httpCode === 429){
    // Gemini自体のレート制限（1分15回など）
    $errBody = json_decode($response, true);
    $detail = $errBody["error"]["message"] ?? "";
    http_response_code(429);
    echo json_encode(["error"=>"__GEMINI_RATE__", "message"=>"アクセスが集中しています。1分ほど待ってから再試行してください", "detail"=>$detail]); exit;
}
if($httpCode === 503){
    http_response_code(503);
    echo json_encode(["error"=>"__GEMINI_RATE__", "message"=>"すべてのAIモデルが混雑しています。数分後に再試行してください"]); exit;
}
if($httpCode !== 200){
    $errBody = json_decode($response, true);
    $errMsg = $errBody["error"]["message"] ?? "不明なエラー";
    http_response_code(500);
    echo json_encode(["error"=>"Gemini APIエラー (HTTP {$httpCode}, model: {$usedModel}): ".$errMsg]); exit;
}

$data = json_decode($response, true);
$text = "";
foreach(($data["candidates"][0]["content"]["parts"] ?? []) as $part){
    $text .= $part["text"] ?? "";
}
if($text === ""){
    http_response_code(500);
    echo json_encode(["error"=>"AIからの応答が空でした。再試行してください"]); exit;
}

// ── カウント更新（成功時のみ）──
$count["n"]++;
@file_put_contents($COUNT_FILE, json_encode($count), LOCK_EX);

echo json_encode(["text"=>$text, "remaining"=>max(0, $DAILY_LIMIT - $count["n"]), "model"=>$usedModel]);
