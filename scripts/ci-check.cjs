/* ci-check.cjs — فحص تلقائي: يشغّل اختبارات التطبيق في Chromium ويفتح كل الصفحات.
   npm run setup                  ← مرة واحدة (playwright + Chromium)
   npm run test:browser           ← الاختبارات + كل الصفحات
   npm run test:browser -- --only=tests | --only=pages
   npm run test:browser -- --headed   ← تشاهد المتصفح وهو يعمل
   عند الفشل: لقطات شاشة + مخرجات الاختبارات تُحفظ في test-results/ */
const fs = require('fs');
const path = require('path');
const { createServer, listen, ROOT } = require('./lib/static-server.cjs');
const { scanNarrow } = require('./lib/narrow-scan.cjs');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* ثبّته محلياً: npm run setup */ }
  console.error('playwright غير مثبّت. شغّل: npm run setup');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const SHOTS = path.join(ROOT, 'test-results');
const ROUTES = 'dashboard customers orders appointments payments debts inventory workers expenses reports settings calendar pricing-calculator financial-center kpis portfolio commitments house-expenses loans referrals occasions activity-log trash cloud-sync pickups messages quotes season-compare data-care wall'.split(' ');
const IGNORE = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|fonts\.googleapis/;
const HEADED = process.argv.includes('--headed');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7); /* --only=tests | --only=pages | --only=narrow */

(async () => {
  const server = createServer();
  const { port } = await listen(server, Number(process.env.PORT) || 0);
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem('jalabiya_v3_onboarding_done', '1'));
  const page = await ctx.newPage();
  let errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  let failed = 0;
  const base = `http://127.0.0.1:${port}/index.html`;
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }).catch(() => {});

  /* 1) الاختبارات */
  if (!ONLY || ONLY === 'tests') {
  await page.goto(base + '#/tests', { waitUntil: 'load' });
  await page.waitForSelector('text=تشغيل الاختبارات');
  await page.click('text=تشغيل الاختبارات');
  await page.waitForFunction(() => /⏱️/.test(document.getElementById('tests-output')?.textContent || ''), { timeout: 180000 }).catch(() => {});
  const out = await page.evaluate(() => document.getElementById('tests-output')?.textContent || '');
  const bad = out.split('\n').filter((l) => /❌|💥/.test(l));
  if (!out.includes('كل الاختبارات نجحت') || bad.length) { failed++; console.log('TESTS FAILED\n' + bad.join('\n') + '\n--- tail ---\n' + out.split('\n').slice(-15).join('\n') + '\n' + errs.join('\n')); }
  else console.log('tests: all passed');
  fs.writeFileSync(path.join(SHOTS, 'tests-output.txt'), out);
  if (failed) await shot('tests-failed');
  }

  /* 2) كل الصفحات */
  if (!ONLY || ONLY === 'pages') {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  for (const r of ROUTES) {
    errs = [];
    await page.evaluate((x) => { location.hash = '#/' + x; }, r);
    await page.waitForTimeout(700);
    const len = await page.evaluate(() => (document.getElementById('app')?.innerText || '').length);
    if (errs.length || len < 100) { failed++; console.log('PAGE FAIL', r, len, errs.join(' | ')); await shot('page-' + r); }
  }
  console.log(failed ? `FAILED (${failed})` : `pages: ${ROUTES.length} ok`);
  }

  /* 3) شاشات ضيقة (320 و360): لا تجاوز لحدود الصفحة أو النوافذ */
  if (!ONLY || ONLY === 'narrow') {
    const probs = await scanNarrow(browser, base, [320, 360], ROUTES, async (n, pg) => { await pg.screenshot({ path: path.join(SHOTS, n + '.png') }).catch(() => {}); });
    if (probs.length) { failed += probs.length; console.log('NARROW FAIL\n' + probs.join('\n')); }
    else console.log('narrow: 320/360px ok');
  }

  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})();
