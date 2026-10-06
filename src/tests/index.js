/* ==========================================================================
   index.js — قائمة وحدات الاختبار (Entry Point)
   ==========================================================================
   Dynamic imports per file to isolate failures.
   ========================================================================== */

const _testFiles = [
  './modules/core.test.js',
  './modules/data.test.js',
  './modules/repos.test.js',
  './modules/security.test.js',
  './modules/ui.test.js',
  './modules/pages.test.js',
  './modules/orders.test.js',
  './modules/dashboard.test.js',
  './modules/pages2.test.js',
  './modules/settings.test.js',
  './modules/appointments-page.test.js',
  './modules/pricing.test.js',
  './modules/financial.test.js',
  './modules/kpis.test.js',
  './modules/portfolio.test.js',
  './modules/commitments.test.js',
  './modules/house-expenses.test.js',
];

const _failed = [];
for (const f of _testFiles) {
  try {
    await import(f);
  } catch (e) {
    console.error('[tests] import failed:', f, e);
    _failed.push({ file: f, error: e.message || String(e) });
  }
}

if (_failed.length > 0) {
  const list = _failed.map((x) => '❌ ' + x.file + '\n   → ' + x.error).join('\n\n');
  throw new Error('فشل في ' + _failed.length + ' ملف:\n\n' + list);
}

export { runAll, register } from './registry.js';
