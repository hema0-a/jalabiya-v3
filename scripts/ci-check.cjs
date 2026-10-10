/* ci-check.cjs — فحص تلقائي: يشغّل اختبارات التطبيق في Chromium ويفتح كل الصفحات.
   التشغيل محلياً:  npm i --no-save playwright && npx playwright install chromium && node scripts/ci-check.cjs */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8777;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ROUTES = 'dashboard customers orders appointments payments debts inventory workers expenses reports settings calendar pricing-calculator financial-center kpis portfolio commitments house-expenses loans referrals occasions activity-log trash cloud-sync'.split(' ');
const IGNORE = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|fonts\.googleapis/;

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem('jalabiya_v3_onboarding_done', '1'));
  const page = await ctx.newPage();
  let errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  let failed = 0;
  const base = `http://localhost:${PORT}/index.html`;

  /* 1) الاختبارات */
  await page.goto(base + '#/tests', { waitUntil: 'load' });
  await page.waitForSelector('text=تشغيل الاختبارات');
  await page.click('text=تشغيل الاختبارات');
  await page.waitForFunction(() => /⏱️/.test(document.getElementById('tests-output')?.textContent || ''), { timeout: 180000 }).catch(() => {});
  const out = await page.evaluate(() => document.getElementById('tests-output')?.textContent || '');
  const bad = out.split('\n').filter((l) => /❌|💥/.test(l));
  if (!out.includes('كل الاختبارات نجحت') || bad.length) { failed++; console.log('TESTS FAILED\n' + bad.join('\n') + '\n--- tail ---\n' + out.split('\n').slice(-15).join('\n') + '\n' + errs.join('\n')); }
  else console.log('tests: all passed');

  /* 2) كل الصفحات */
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  for (const r of ROUTES) {
    errs = [];
    await page.evaluate((x) => { location.hash = '#/' + x; }, r);
    await page.waitForTimeout(700);
    const len = await page.evaluate(() => (document.getElementById('app')?.innerText || '').length);
    if (errs.length || len < 100) { failed++; console.log('PAGE FAIL', r, len, errs.join(' | ')); }
  }
  console.log(failed ? `FAILED (${failed})` : `pages: ${ROUTES.length} ok`);

  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})();
