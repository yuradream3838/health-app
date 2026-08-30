#!/usr/bin/env node
// 構文チェック：health.html から最大の <script> を抽出し `node --check` にかける。
// 依存ゼロ。壊れた構文を最速で検出するゲート。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, '..', 'health.html');
const html = fs.readFileSync(HTML, 'utf8');

const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, best = '';
while ((m = re.exec(html))) { if (m[1].length > best.length) best = m[1]; }

if (!best) { console.error('✗ script が見つかりません'); process.exit(1); }

const tmp = path.join(os.tmpdir(), 'health-syntax-' + process.pid + '.js');
fs.writeFileSync(tmp, best);
const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
fs.unlinkSync(tmp);

if (r.status === 0) {
  console.log(`✓ 構文OK（${best.length.toLocaleString()} bytes）`);
  process.exit(0);
} else {
  console.error('✗ 構文エラー:\n' + (r.stderr || r.stdout));
  process.exit(1);
}
