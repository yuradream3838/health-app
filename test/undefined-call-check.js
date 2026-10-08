#!/usr/bin/env node
// 呼び出し先チェック：health.html の中で「呼んでいるのに、どこにも定義が無い関数」を探す。
// 例：v14.93 で getAlexaHooks を消したのに出力処理が呼び続け、💾 データを出力が無反応になっていた。
// 依存ゼロの簡易チェック（構文解析はせず、文字列・コメントを消してから名前を照らし合わせる）。
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'health.html'), 'utf8');
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, js = '';
while ((m = re.exec(html))) { if (m[1].length > js.length) js = m[1]; }

// 文字列・テンプレート・コメント・正規表現リテラルの中身を消す（${…} の中のコードは残す）
function strip(src) {
  let out = '', i = 0; const n = src.length; const stack = [];
  const prevSignificant = () => { for (let k = out.length - 1; k >= 0; k--) { const c = out[k]; if (!/\s/.test(c)) return c; } return ''; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (stack.length && stack[stack.length - 1] === '`') {         // テンプレートの文字部分
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); out += '`'; i++; continue; }
      if (c === '$' && d === '{') { stack.push('${'); out += '${'; i += 2; continue; }
      i++; continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; out += q + q; continue; }
    if (c === '`') { stack.push('`'); out += '`'; i++; continue; }
    if (c === '{' && stack.length) { stack.push('{'); out += c; i++; continue; }
    if (c === '}' && stack.length) { const t = stack.pop(); out += c; i++; if (t === '${') { /* テンプレートへ戻る */ } continue; }
    if (c === '/') {                                                // 正規表現リテラル（直前が値でないとき）
      const p = prevSignificant();
      if (!p || /[(,=:[!&|?{};+\-*%<>~^]/.test(p) || /\b(return|typeof|case|in|of|void|delete|throw)$/.test(out.slice(-12).trimEnd())) {
        i++; let cls = false;
        while (i < n) { const e = src[i]; if (e === '\\') { i += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; else if (e === '\n') break; i++; }
        i++; while (i < n && /[a-z]/i.test(src[i])) i++; out += '/r/'; continue;
      }
    }
    out += c; i++;
  }
  return out;
}
const code = strip(js);

// 定義されている名前（関数宣言・const/let/var・関数の引数・アロー関数の引数・catch の引数・クラス）
const defined = new Set();
const add = s => (s || '').split(/[^\w$]+/).forEach(w => { if (w && !/^\d/.test(w)) defined.add(w); });
for (const r of code.matchAll(/\bfunction\s*\*?\s*([\w$]*)\s*\(([^)]*)\)/g)) { add(r[1]); add(r[2]); }
for (const r of code.matchAll(/\b(?:const|let|var)\s+([^;=]+?)\s*(?==|;|\bof\b|\bin\b)/g)) add(r[1]);
for (const r of code.matchAll(/(?:const|let|var)\s+[\w$]+\s*=[^,;]*(?:,\s*([\w$]+)\s*=)/g)) add(r[1]);
for (const r of code.matchAll(/,\s*([\w$]+)\s*=(?!=|>)/g)) add(r[1]);           // const a=1, b=2 の b
for (const r of code.matchAll(/\(([^()]*)\)\s*=>/g)) add(r[1]);
for (const r of code.matchAll(/([\w$]+)\s*=>/g)) add(r[1]);
for (const r of code.matchAll(/\bcatch\s*\(([^)]*)\)/g)) add(r[1]);
for (const r of code.matchAll(/\bclass\s+([\w$]+)/g)) add(r[1]);
for (const r of code.matchAll(/\bwindow\.([\w$]+)\s*=/g)) add(r[1]);

// ブラウザ・JS に最初からあるもの
const builtin = new Set(('if for while switch catch function return typeof new await async super import ' +
  'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask ' +
  'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape ' +
  'String Number Boolean Array Object Date RegExp Error TypeError Promise Map Set WeakMap Symbol BigInt JSON Math ' +
  'fetch alert confirm prompt atob btoa structuredClone getComputedStyle matchMedia URL Blob FileReader Image Notification ' +
  'AbortController Intl Uint8Array ArrayBuffer TextEncoder TextDecoder require console').split(/\s+/));

const missing = new Map();
const lines = code.split('\n');
lines.forEach((ln, idx) => {
  for (const r of ln.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = r[1];
    if (defined.has(name) || builtin.has(name)) continue;
    if (!missing.has(name)) missing.set(name, idx + 1);
  }
});

if (missing.size) {
  console.error('✗ 定義の無い関数を呼んでいます（消した関数の呼び残し・名前の打ち間違い）:');
  for (const [k, l] of missing) console.error(`   ${k}  （script の ${l} 行目あたり）`);
  process.exit(1);
}
console.log(`✓ 呼び出し先チェックOK（定義 ${defined.size} 個）`);
