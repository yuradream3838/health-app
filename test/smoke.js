#!/usr/bin/env node
// スモークテスト：health.html を実ブラウザで開き、全タブ・サブタブを描画して
// JSエラー（pageerror / console.error）が1件も出ないことを確認する。
// あわせて主要機能（バックアップ・文字サイズ・ルーティン編集など）を軽く叩く。
//
// 必要環境：
//   - playwright-core（`npm i -D playwright-core` もしくは環境変数 PLAYWRIGHT_CORE でパス指定）
//   - Chromium 実行ファイル（環境変数 CHROMIUM_PATH で指定。無指定なら
//     PLAYWRIGHT_BROWSERS_PATH 配下 or playwright 既定を探索）
// 実行：node test/smoke.js

const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_CORE) tries.push(process.env.PLAYWRIGHT_CORE);
  tries.push('playwright-core', 'playwright');
  tries.push('/tmp/node_modules/playwright-core');
  for (const t of tries) { try { return require(t); } catch (_) {} }
  console.error('✗ playwright-core が見つかりません。`npm i -D playwright-core` を実行するか PLAYWRIGHT_CORE でパスを指定してください。');
  process.exit(2);
}

function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(base).filter(d => d.startsWith('chromium'));
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(base, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (_) {}
  return null; // playwright 既定に任せる
}

(async () => {
  const { chromium } = loadPlaywright();
  const exe = findChromium();
  const HTML = 'file://' + path.join(__dirname, '..', 'health.html');

  const launchOpts = { args: ['--no-sandbox'] };
  if (exe) launchOpts.executablePath = exe;

  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(HTML);
  await page.waitForTimeout(500);

  // 1) メインタブ全走査
  const TABS = ['予定', '日記', 'タスク', '達成', '分析', '設定'];
  for (const t of TABS) {
    await page.evaluate(t => { state.widget = false; state.tab = t; render(); }, t);
    await page.waitForTimeout(120);
  }

  // 2) 各ハブのサブタブ全走査
  const SUBS = {
    予定: ['scheduleSubTab', ['日', '週', '月', '🔍検索']],
    日記: ['diarySubTab', ['生活記録', '睡眠', 'トレーニング', '体調記録', 'アルコール']],
    タスク: ['taskSubTab', ['ルーティン', '定期ルーティン', '目標', 'TODO', '買物']],
    達成: ['achieveSubTab', ['達成', '未来投資', 'つながり', '動機づけ面談', 'if-then']],
    分析: ['analysisSubTab', ['日次ログ', '週次分析', '総合分析']],
  };
  for (const [tab, [key, subs]] of Object.entries(SUBS)) {
    for (const s of subs) {
      await page.evaluate(a => { state.widget = false; state.tab = a.tab; state[a.key] = a.s; render(); }, { tab, key, s });
      await page.waitForTimeout(80);
    }
  }

  // 3) ウィジェット（既定ランディング）
  await page.evaluate(() => { state.widget = true; state.viewDate = todayStr(); render(); });
  await page.waitForTimeout(120);

  // 4) 主要機能のAPIチェック（存在・基本動作）
  const checks = await page.evaluate(() => {
    const out = {};
    out.aiCentralized = typeof AI_ENDPOINT === 'string' && typeof aiHeaders === 'function';
    out.todoEditable = typeof getTodoItems === 'function' && Array.isArray(getTodoItems()) && getTodoItems().length > 0;
    out.backup = typeof backupDaysAgo === 'function' && typeof exportData === 'function';
    out.fontScale = (() => { const before = getFontScale(); setFontScale(1.15); const z = document.body.style.zoom; setFontScale(before); return z === '1.15'; })();
    out.featureIndex = Array.isArray(FEATURE_INDEX) && FEATURE_INDEX.length > 0;
    return out;
  });

  await browser.close();

  // 結果判定
  let ok = true;
  console.log('— 機能チェック —');
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${v ? '✓' : '✗'} ${k}`);
    if (!v) ok = false;
  }
  console.log(`— JSエラー: ${errors.length} 件 —`);
  errors.slice(0, 10).forEach(e => console.log('  ' + e));

  if (ok && errors.length === 0) {
    console.log('\n✓ スモークテスト PASS');
    process.exit(0);
  } else {
    console.error('\n✗ スモークテスト FAIL');
    process.exit(1);
  }
})().catch(e => { console.error('✗ 実行エラー:', e); process.exit(2); });
