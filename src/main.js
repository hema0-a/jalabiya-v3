/* ==========================================================================
   main.js — DIAGNOSTIC VERSION
   ==========================================================================
   نسخة مؤقتة لتشخيص أي ملف يفشل في التحميل.
   تعرض النتائج مباشرة على الشاشة (بدون Console).
   ========================================================================== */

const output = [];
const render = () => {
  document.body.innerHTML =
    '<pre style="padding:16px;font-family:monospace;direction:ltr;text-align:left;background:#111;color:#0f0;min-height:100vh;margin:0;font-size:13px;white-space:pre-wrap;word-break:break-all">'
    + output.join('\n') + '</pre>';
};
const log = (msg) => { output.push(msg); render(); };

log('🚀 main.js running');

try {
  const c = await import('./core/config.js');
  log('✅ config.js → v' + c.APP_CONFIG.version + ' | stores=' + Object.keys(c.STORES).length);
} catch (e) { log('❌ config.js FAILED: ' + e.message); }

try {
  const ev = await import('./core/events.js');
  log('✅ events.js → events type=' + typeof ev.events);
} catch (e) { log('❌ events.js FAILED: ' + e.message); }

try {
  const s = await import('./core/sanitize.js');
  log('✅ sanitize.js → escapeHtml type=' + typeof s.escapeHtml);
} catch (e) { log('❌ sanitize.js FAILED: ' + e.message); }

try {
  const d = await import('./core/dom.js');
  log('✅ dom.js → el type=' + typeof d.el);
} catch (e) { log('❌ dom.js FAILED: ' + e.message); }

try {
  const u = await import('./core/utils.js');
  log('✅ utils.js → formatDate type=' + typeof u.formatDate);
} catch (e) { log('❌ utils.js FAILED: ' + e.message); }

log('🏁 DONE');
