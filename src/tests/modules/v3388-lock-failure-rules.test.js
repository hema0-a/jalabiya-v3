/* ==========================================================================
   v3388-lock-failure-rules.test.js — شاشة فشل القفل بلا innerHTML + حارس قواعد المشروع (v3.3.88)
   ==========================================================================
   1) renderLockFailure: كانت كتلة main.js تمسح #app بـ innerHTML = '' (مخالفة للقاعدة)؛ صارت بـ el()/clear().
   2) حارس عام يمنع رجوع المخالفات: innerHTML/outerHTML/insertAdjacentHTML/eval، وdocument.write إلا في
      استثناء الطباعة المعروف، والاستيراد الديناميكي إلا في main.js وملفات Firebase (CDN).
   ========================================================================== */

import { register } from '../registry.js';
import { renderLockFailure, LOCK_FAILURE_MESSAGE } from '../../ui/lock-failure.js';

/** يزيل التعليقات من نص js (تقريبياً: يحفظ // داخل الروابط) لفحص الكود الفعلي فقط. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** كل ملفات src (غير الاختبارات) من قائمة الكاش المسبق في sw.js. */
async function listSourceFiles() {
  const sw = await (await fetch('./sw.js')).text();
  return [...sw.matchAll(/'\.\/(src\/[^']+\.js)'/g)].map((m) => m[1]);
}

/** يجلب الملفات على دفعات ويعيد { المسار: النص بلا تعليقات }. */
async function loadSources(paths) {
  const out = {};
  for (let i = 0; i < paths.length; i += 20) {
    const batch = paths.slice(i, i + 20);
    const texts = await Promise.all(batch.map((p) => fetch('./' + p).then((r) => r.text())));
    batch.forEach((p, k) => { out[p] = stripComments(texts[k]); });
  }
  return out;
}

register('v3.3.88 lock-failure screen', async (t) => {
  const mkApp = () => {
    const app = document.createElement('div');
    app.id = 'app-test';
    app.setAttribute('inert', '');
    app.setAttribute('aria-hidden', 'true');
    app.style.visibility = 'hidden';
    app.appendChild(document.createElement('span')).textContent = 'محتوى قديم';
    document.body.appendChild(app);
    return app;
  };

  {
    const app = mkApp();
    let reloads = 0;
    const box = renderLockFailure(app, { reload: () => { reloads++; } });
    await t.test('1. يعرض الرسالة وزر «إعادة المحاولة» ويمسح المحتوى القديم',
      !!box && app.children.length === 1 && app.textContent.includes(LOCK_FAILURE_MESSAGE) && !app.textContent.includes('محتوى قديم')
      && [...app.querySelectorAll('button')].some((b) => b.textContent.trim() === 'إعادة المحاولة'));
    await t.test('2. يُظهر التطبيق المخفي (inert/aria-hidden/visibility) ليقرأ المستخدم الرسالة',
      !app.hasAttribute('inert') && !app.hasAttribute('aria-hidden') && app.style.visibility === 'visible');
    app.querySelector('button').click();
    await t.test('3. زر إعادة المحاولة يستدعي إعادة التحميل مرة واحدة', reloads === 1);
    await t.test('4. البنية: صندوق + سطر رسالة + زر فقط (نص عبر textContent لا HTML)', app.querySelectorAll('*').length === 3);
    app.remove();
  }

  {
    const app = mkApp();
    app.appendChild = () => { throw new Error('boom'); };   /* يحاكي فشل بناء الواجهة */
    let threw = false, ret;
    try { ret = renderLockFailure(app, { reload: () => {} }); } catch (e) { threw = true; }
    await t.test('5. فشل بناء العناصر: لا استثناء، ويُكتب نص بديل بـ textContent (لا شاشة فارغة) ويُرجع null',
      !threw && ret === null && app.textContent.includes(LOCK_FAILURE_MESSAGE) && app.querySelectorAll('*').length === 0
      && !app.hasAttribute('inert') && app.style.visibility === 'visible');
    app.remove();
  }

  await t.test('6. عنصر غير موجود: يُرجع null بلا استثناء', renderLockFailure(null) === null);

  /* ---- main.js: لا innerHTML، والإغلاق الآمن محفوظ ---- */
  const main = await (await fetch('./src/main.js')).text();
  const code = stripComments(main);
  await t.test('7. main.js بلا innerHTML ويُحمّل شاشة الفشل داخل مسار الفشل فقط', !/innerHTML/.test(code) && (code.match(/lock-failure\.js/g) || []).length === 1);
  const iImport = code.indexOf("import('./ui/lock-failure.js')");
  const iThrow = code.indexOf('throw e;', iImport);
  const iLock = code.lastIndexOf('ensureUnlocked', iImport);
  await t.test('8. الإغلاق الآمن (fail-closed) محفوظ: بعد عرض الرسالة يُعاد رمي الخطأ فلا يُفتح التطبيق',
    iLock > 0 && iImport > iLock && iThrow > iImport && !/Promise\.all\(\[[^\]]*lock-failure/.test(code));
});

register('v3.3.88 code rules guard (innerHTML / document.write / import())', async (t) => {
  const paths = await listSourceFiles();
  const src = await loadSources(paths);
  const hits = (re) => paths.filter((p) => re.test(src[p]));

  await t.test('1. فحص ما لا يقل عن 150 ملفاً من src (حتى لا ينجح الحارس على قائمة فارغة)', paths.length >= 150 && Object.keys(src).length === paths.length);
  const badHtml = hits(/\.(innerHTML|outerHTML)\s*(\+?=)|insertAdjacentHTML\s*\(/);
  await t.test('2. لا innerHTML ولا outerHTML ولا insertAdjacentHTML في أي ملف (القاعدة: el() فقط)' + (badHtml.length ? ' — مخالفات: ' + badHtml.join(', ') : ''),
    badHtml.length === 0);
  const dw = hits(/document\.write\s*\(/);
  await t.test('3. document.write حصراً في invoice-print.js (نافذة الطباعة — استثناء معروف وموثَّق)' + (dw.join() === 'src/services/invoice-print.js' ? '' : ' — وُجد في: ' + dw.join(', ')),
    dw.length === 1 && dw[0] === 'src/services/invoice-print.js');
  const dyn = hits(/\bimport\s*\(/);
  const allowedDynamic = new Set(['src/main.js', 'src/sync/firebase-config.js', 'src/sync/auth-sync.js', 'src/sync/firestore-sync.js']);
  const badDyn = dyn.filter((p) => !allowedDynamic.has(p));
  await t.test('4. الاستيراد الديناميكي حصراً في main.js وملفات Firebase (القاعدة: static imports)' + (badDyn.length ? ' — مخالفات: ' + badDyn.join(', ') : ''),
    badDyn.length === 0);
  await t.test('5. لا eval ولا new Function', hits(/\beval\s*\(/).length === 0 && hits(/new\s+Function\s*\(/).length === 0);
});
