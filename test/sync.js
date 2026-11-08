#!/usr/bin/env node
// ☁️ ConoHa 同期の結合テスト（v15.69・双方向 v15.70）：本物の server/sync.php.example を PHP の組み込みサーバで動かし、
// スマホ・PC の2つの端末（別々のブラウザ）で、設定 → 送る → PCで読み込む → 自動で届く → 両方で記録したとき自動で混ぜる（新しいほうが残る）
// → 過去の版に戻す → 合言葉違い・サーバの中身が暗号化されていること を確かめる。
// php が無い環境では SKIP（終了コード0）。実行: node test/sync.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

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


const ROOT = path.join(__dirname, '..');
if (spawnSync('php', ['-v']).status !== 0) { console.log('SKIP（php が無いため）'); process.exit(0); }
const { chromium } = loadPlaywright();
const EXE = findChromium();
(async () => {
  const SRV = fs.mkdtempSync(path.join(os.tmpdir(), 'health-sync-'));
  const tpl = fs.readFileSync(path.join(ROOT, 'server/sync.php.example'), 'utf8').replace("['https://yuradream3838.github.io']", "['https://yuradream3838.github.io','null']");
  const writePhp = hash => fs.writeFileSync(path.join(SRV, 'sync.php'), tpl.replace("'ここにアプリの「サーバに貼る値」を貼る'", `'${hash}'`));
  writePhp('ここにアプリの「サーバに貼る値」を貼る');
  const php = spawn('php', ['-S', '127.0.0.1:8765', '-t', SRV], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
  const URL = 'http://127.0.0.1:8765/sync.php';
  const b = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: ['--no-sandbox'] });
  const mk = async () => { const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', acceptDownloads: true });
    await ctx.route('**/*', r => { const u = r.request().url(); return (u.startsWith('file:') || u.startsWith('http://127.0.0.1:8765/')) ? r.continue() : r.abort(); });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e))); p.on('dialog', d => d.accept());
    p.downloads = 0; p.on('download', () => p.downloads++);
    await p.goto('file://' + path.join(ROOT, 'health.html')); await p.waitForTimeout(900); return p; };
  const A = await mk(), B = await mk(), r = {};
  const setup = (p, pass, dev) => p.evaluate(async ({ pass, dev, URL }) => {
    state.widget = false; state.tab = '設定'; openSetting('sync', true); render();
    const q = s => document.querySelector(s);
    q('[data-syncin="pass1"]').value = pass; q('[data-syncin="pass2"]').value = pass; q('[data-syncin="device"]').value = dev; q('[data-syncin="url"]').value = URL;
    q('[data-syncbtn="setup"]').click();
    for (let i = 0; i < 100 && !getSyncCfg().auth; i++) await new Promise(r => setTimeout(r, 100));
    return getSyncCfg().authHash; }, { pass, dev, URL });
  const click = (p, k) => p.evaluate(async k => { const t0 = state.syncMsg; document.querySelector(`[data-syncbtn="${k}"]`).click();
    for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); if (state.syncMsg && !/^⏳/.test(state.syncMsg) && state.syncMsg !== t0) break; } return state.syncMsg; }, k);
  // スマホ：記録がある
  await A.evaluate(() => { for (let i = 0; i < 5; i++) setDaily(addDays(todayStr(), -i), { water: 1 + i / 10, foods: ['納豆'] }); state.logs.push({ dateStr: todayStr(), hour: 9, score: 7, mental: 6, symptoms: [], note: 'ひみつのメモABC' }); saveStorage(); flushStorage(); });
  const hash = await setup(A, 'correct horse battery staple', 'スマホ');
  r.hashOk = /^[0-9a-f]{64}$/.test(hash) && await A.evaluate(() => !!document.querySelector('[data-synchash]'));
  r.check401 = await click(A, 'check');
  writePhp(hash); await new Promise(r => setTimeout(r, 2500));   // PHP の組み込みサーバがファイルの書き換えに気づくまで
  r.checkEmpty = await click(A, 'check');
  r.up1 = await click(A, 'up');
  await A.evaluate(() => { document.querySelector('[data-syncbtn="auto"]').click(); });
  // 暗号化されている
  const bin = fs.readFileSync(path.join(SRV, 'sync_data/hist/1.bin')); r.encrypted = bin.slice(0, 3).toString() === 'HS1' && !bin.includes(Buffer.from('ひみつのメモABC')) && !bin.includes(Buffer.from('納豆'));
  r.htaccess = fs.existsSync(path.join(SRV, 'sync_data/.htaccess'));
  // PC：同じ合言葉で設定 → 読み込む
  await setup(B, 'correct horse battery staple', 'PC');
  r.pcCheck = await click(B, 'check');
  r.pcDown = await click(B, 'down');
  r.pcData = await B.evaluate(() => `${state.dailies.length}:${state.logs.some(l => l.note === 'ひみつのメモABC')}:${getSyncCfg().rev}:${!!getSyncCfg().dirtyAt}`);
  r.pcDownloads = B.downloads;
  // PC で記録 → 送る → スマホは開いたとき（画面に戻ったとき）に自動で読み込む
  await B.evaluate(() => { document.querySelector('[data-syncbtn="auto"]').click(); setDaily(todayStr(), { meds: [{ uid: 1, name: 'PCで記録', hour: 10, min: 0 }] }); flushStorage(); });
  r.pcUp = await click(B, 'up');
  r.phoneAuto = await A.evaluate(async () => { await syncCheckRemote(); return `${(getDaily(todayStr()).meds || []).map(m => m.name).join()}:${getSyncCfg().rev}`; });
  // ── 両方の端末で記録したとき（双方向・v15.70）：日ごと・項目ごとに、新しく変えたほうを残して自動で混ぜる ──
  const T = () => 'todayStr()';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const chg = (p, code) => p.evaluate(new Function(`return (async () => { ${code}; flushStorage(); syncStampNow(); })()`));
  const up = p => p.evaluate(async () => { const x = await syncUpload(false); return `${x.ok}:${x.rev}:${!!x.merged}`; });
  const day = (p, off) => p.evaluate(off => { const d = getDaily(addDays(todayStr(), off)); return `${d.water}|${(d.foods || []).join('/')}`; }, off);
  // ① 同じ日の違う項目：PC は水分、スマホは食べたもの → 両方残る
  await chg(B, "setDaily(todayStr(), { water: 2.5 })"); await wait(20);
  await chg(A, "setDaily(todayStr(), { foods: ['卵'] }); setDaily(addDays(todayStr(), -1), { water: 9 })");
  r.m1up = [await up(B), await up(A)].join(' ');
  r.m1A = await day(A, 0); r.m1Ay = await day(A, -1);
  await B.evaluate(() => syncCheckRemote()); r.m1B = await day(B, 0) + ' ' + await day(B, -1);
  // ② 同じ項目：スマホが先に変え（3.0）、PC が後で変えた（3.5）。スマホが先に送っても、後で変えた PC の 3.5 が残る
  await chg(A, "setDaily(todayStr(), { water: 3.0 })"); await wait(20); await chg(B, "setDaily(todayStr(), { water: 3.5 })");
  r.m2up = [await up(A), await up(B)].join(' ');
  await A.evaluate(() => syncCheckRemote()); r.m2 = await day(A, 0) + ' ' + await day(B, 0);
  // ③ 逆：PC が先に変え（4.0）、スマホが後で変えた（4.5）。PC が先に送っても、スマホの 4.5 が残る
  await chg(B, "setDaily(todayStr(), { water: 4.0 })"); await wait(20); await chg(A, "setDaily(todayStr(), { water: 4.5 })");
  r.m3up = [await up(B), await up(A)].join(' ');
  await B.evaluate(() => syncCheckRemote()); r.m3 = await day(A, 0) + ' ' + await day(B, 0);
  // ④ 消したことも新しければ残る：PC は昨日の食べたものを足し、スマホは今日の体調記録（ひみつのメモ）を消す
  await chg(B, "setDaily(addDays(todayStr(), -1), { foods: ['鮭'] })"); await wait(20);
  await chg(A, "state.logs = state.logs.filter(l => l.note !== 'ひみつのメモABC'); saveStorage()");
  r.m4up = [await up(B), await up(A)].join(' ');
  await B.evaluate(() => syncCheckRemote());
  r.m4 = await A.evaluate(() => `${state.logs.some(l => l.note === 'ひみつのメモABC')}|${(getDaily(addDays(todayStr(), -1)).foods || []).join()}`) + ' ' + await B.evaluate(() => `${state.logs.some(l => l.note === 'ひみつのメモABC')}|${(getDaily(addDays(todayStr(), -1)).foods || []).join()}`);
  r.noConflict = await A.evaluate(() => !getSyncCfg().conflict && !document.querySelector('[data-syncconflict]')) && await B.evaluate(() => !getSyncCfg().conflict);
  // 上書き（混ぜられないときの手段）も動く
  r.force = await A.evaluate(async () => { const x = await syncUpload(true); return `${x.ok}:${x.rev}`; });
  // 自動送信：変更から2分たったら
  r.auto = await A.evaluate(async () => { setDaily(todayStr(), { water: 5.2 }); flushStorage(); const before = getSyncCfg().rev; syncAutoTick(Date.now() + 3 * 60000);
    for (let i = 0; i < 50 && getSyncCfg().rev === before; i++) await new Promise(r => setTimeout(r, 100)); return `${before}->${getSyncCfg().rev}:${!!getSyncCfg().dirtyAt}`; });
  // 過去の版に戻す（版2＝PCの記録だけの頃）→ 次に送ると PC でもその内容になる（戻したことが一番新しい変更）
  r.hist = await A.evaluate(async () => { document.querySelector('[data-syncbtn="hist"]').click(); for (let i = 0; i < 50 && !(state.syncHist && state.syncHist.items); i++) await new Promise(r => setTimeout(r, 100));
    const n = state.syncHist.items.length; document.querySelector('[data-synchist="2"]').click(); for (let i = 0; i < 50 && !/^✅/.test(state.syncMsg || ''); i++) await new Promise(r => setTimeout(r, 100));
    const x = await syncUpload(false); return `${n}:${getDaily(todayStr()).water}:${x.ok}`; });
  await B.evaluate(() => syncCheckRemote()); r.histB = await day(B, 0);
  // 合言葉が違う端末
  const C = await mk(); await setup(C, 'wrong passphrase 12345', 'X'); r.wrong = await click(C, 'check');
  await A.evaluate(() => { state.syncHistOpen = false; render(); document.querySelector('[data-syncpanel]').scrollIntoView(); });
  if (process.argv[2]) await A.screenshot({ path: path.join(process.argv[2], 'sync.png') });
  console.log(JSON.stringify(r, null, 1));
  const errs = [...A.errs, ...B.errs, ...C.errs];
  const ok = r.hashOk && /合言葉がサーバと合いません/.test(r.check401) && /サーバはまだ空です/.test(r.checkEmpty) && /送りました（版1）/.test(r.up1) && r.encrypted && r.htaccess
    && /版1/.test(r.pcCheck) && /読み込みました/.test(r.pcDown) && r.pcData === '5:true:1:false' && r.pcDownloads === 0 && /版2/.test(r.pcUp) && r.phoneAuto === 'PCで記録:2'
    && r.m1A === '2.5|卵' && r.m1Ay === '9|納豆' && r.m1B === '2.5|卵 9|納豆' && r.m2 === '3.5|卵 3.5|卵' && r.m3 === '4.5|卵 4.5|卵'
    && r.m4 === 'false|鮭 false|鮭' && r.noConflict && /^true:\d+$/.test(r.force) && /^\d+->\d+:false$/.test(r.auto) && /:1:true$/.test(r.hist) && r.histB === '1|納豆'
    && /合言葉がサーバと合いません/.test(r.wrong) && errs.length === 0;
  console.log(ok ? '✓ 同期テスト PASS' : '✗ 同期テスト FAIL', errs); await b.close(); php.kill(); fs.rmSync(SRV, { recursive: true, force: true }); process.exit(ok ? 0 : 1);
})();
