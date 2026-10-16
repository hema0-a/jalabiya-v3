/* ==========================================================================
   v3365-diagnostics.test.js — «أبلغ عن مشكلة»: التقرير والخصوصية والواجهة (v3.3.65)
   ========================================================================== */

import { register } from '../registry.js';
import { modal } from '../../ui/modal.js';
import { openReportIssue } from '../../ui/report-issue.js';
import { APP_CONFIG } from '../../core/config.js';
import { SYSTEM_SECTIONS } from '../../pages/settings/sections-system.js';
import {
  redactText, sanitizeError, collectDiagnostics, formatReport, shareReport, copyReport,
} from '../../services/diagnostics.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ينتظر حتى يُرجع fn قيمة صادقة (حتى ms) — بدل sleep ثابت يتذبذب تحت الضغط. */
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) { /* ignore */ } await sleep(20); }
  return null;
}

register('v3.3.65 diagnostics (privacy + report)', async (t) => {
  /* ---- التنقية ---- */
  await t.test('1. redactText يحجب البريد والهاتف (لاتيني وهندي) والرموز الطويلة',
    redactText('خطأ للعميل ali@mail.com هاتفه 01012345678 و+20 101 234 5678 و٠١٠١٢٣٤٥٦٧٨ توكن ' + 'a'.repeat(40)) === 'خطأ للعميل [بريد] هاتفه [رقم] و[رقم] و[رقم] توكن [رمز]');
  await t.test('2. الأرقام القصيرة (مبالغ/عدّ/إصدار) لا تُحجب', redactText('فشل في 12 سجلاً من 300 — v3.3.65') === 'فشل في 12 سجلاً من 300 — v3.3.65');
  await t.test('3. الروابط تفقد ?query و#hash (قد تحمل معرّفات)',
    redactText('at https://x.github.io/app/src/a.js?id=123456789&t=1#/orders/5 ok') === 'at https://x.github.io/app/src/a.js ok');
  await t.test('4. إدخال غير نصي/فارغ لا يكسر', redactText(null) === '' && redactText(undefined) === '' && redactText(42) === '42');

  const e = sanitizeError({
    kind: 'promise', timestamp: 1700000000000, message: 'تعذّر حفظ 01099998888 ' + 'x'.repeat(500),
    stack: 'Error: x\n at a (http://h/src/a.js:1:1)\n at b\n at c\n at d\n at e\n at f',
    url: 'http://h/index.html#/customers/abc-secret-id?x=1',
  });
  await t.test('5. sanitizeError: يقصّ الرسالة ويحجب الهاتف ويقصّ المكدّس ويُبقي اسم الصفحة فقط (بلا معرّفات)',
    e.message.length <= 300 && !/01099998888/.test(e.message) && e.stack.split(' ⏎ ').length <= 4 && e.route === 'customers' && !/abc-secret/.test(JSON.stringify(e)));
  await t.test('6. sanitizeError مع مُدخل ناقص', sanitizeError({}).message === 'Unknown error' && sanitizeError(null).kind === 'unknown');

  /* ---- جمع التقرير بلا أي بيانات شخصية ---- */
  const diag = await collectDiagnostics({
    counts: { customers: 3, orders: 7, payments: 0 },
    errors: [{ kind: 'unhandled', timestamp: 1700000000000, message: 'boom 01011112222', stack: 'Error\n at x', url: 'http://h/#/orders' }],
  });
  const text = formatReport(diag, 'الشاشة بتهنج عند حفظ الطلب');
  await t.test('7. التقرير يحوي الإصدار والوصف والأعداد (بلا الأصفار) وآخر خطأ منقّى',
    text.includes('v' + APP_CONFIG.version) && text.includes('الشاشة بتهنج عند حفظ الطلب') && text.includes('customers=3') && text.includes('orders=7')
    && !text.includes('payments=0') && text.includes('boom [رقم]') && !text.includes('01011112222'));
  await t.test('8. لا بريد ولا هاتف ولا اسم عميل في التقرير الحقيقي',
    !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text) && !/\b01[0-9]{9}\b/.test(text));
  await t.test('9. الأقسام الأساسية موجودة وبيان الخصوصية',
    ['— التطبيق —', '— الجهاز —', '— التخزين', '— المزامنة', '— آخر الأخطاء', 'لا يحتوي هذا التقرير أسماء عملاء'].every((k) => text.includes(k)));
  await t.test('10. بلا وصف: يُكتب «لم يُكتب وصف» ولا يكسر', formatReport(diag, '').includes('(لم يُكتب وصف)'));

  /* ---- مقاومة الأعطال: كل جزء بمعزل ---- */
  const brokenNav = { get userAgent() { throw new Error('x'); }, storage: { estimate: async () => { throw new Error('no'); } }, serviceWorker: { getRegistration: async () => { throw new Error('sw'); } } };
  let d2, threw = false;
  try { d2 = await collectDiagnostics({ nav: brokenNav, counts: {}, errors: [] }); } catch (err) { threw = true; }
  const t2 = !threw && formatReport(d2, '');
  await t.test('11. فشل أجزاء (جهاز/تخزين/SW) لا يُسقط التقرير (يُكتب «تعذّر»)', !threw && typeof t2 === 'string' && t2.includes('تعذّر'));
  await t.test('12. سجل أخطاء ضخم: يُقصّ إلى 15 كحدّ أقصى',
    (await collectDiagnostics({ counts: {}, errors: Array.from({ length: 40 }, (_, i) => ({ message: 'e' + i, timestamp: 1 })) })).errors.length === 15);

  /* ---- المشاركة ---- */
  let shared = null;
  const r1 = await shareReport('نص', { nav: { share: async (d) => { shared = d; } } });
  await t.test('13. مشاركة: قائمة المشاركة بالنص والعنوان', r1 === 'shared' && shared.text === 'نص' && /تقرير مشكلة/.test(shared.title));
  const r2 = await shareReport('x', { nav: { share: async () => { const er = new Error('c'); er.name = 'AbortError'; throw er; } } });
  await t.test('14. إلغاء المشاركة لا يُعدّ خطأ ولا ينسخ ولا ينزّل', r2 === 'cancelled');
  let clip = null;
  const r3 = await shareReport('نسخ', { nav: { clipboard: { writeText: async (s) => { clip = s; } } } });
  await t.test('15. بلا قائمة مشاركة: يُنسخ للحافظة', r3 === 'copied' && clip === 'نسخ');
  const r4 = await copyReport('x', { nav: { clipboard: { writeText: async () => { throw new Error('denied'); } } } });
  await t.test('16. رفض الحافظة: copyReport يُرجع false بلا استثناء', r4 === false);
});

register('v3.3.65 report-issue dialog + settings', async (t) => {
  await t.test('1. قسم «الدعم» ضمن أقسام الإعدادات النظامية', SYSTEM_SECTIONS.some((s) => s.id === 'support'));
  const sec = SYSTEM_SECTIONS.find((s) => s.id === 'support');
  const body = document.createElement('div'); document.body.appendChild(body);
  try {
    await sec.render(body);
    await t.test('2. القسم يعرض الإصدار وزر «أبلغ عن مشكلة»', body.textContent.includes('v' + APP_CONFIG.version) && !!body.querySelector('#btn-report-issue'));
    body.querySelector('#btn-report-issue').click();
    const desc = await waitFor(() => document.querySelector('#report-issue-desc'));
    const prev = await waitFor(() => document.querySelector('#report-issue-text'));
    await t.test('3. النافذة تُفتح بخانة وصف ومعاينة كاملة للتقرير', !!desc && !!prev && prev.value.includes('تقرير مشكلة') && prev.readOnly === true);
    if (desc && prev) {
      desc.value = 'وصف تجريبي ٣٣٦٥';
      desc.dispatchEvent(new Event('input'));
    }
    await t.test('4. كتابة الوصف تحدّث المعاينة فوراً', !!prev && prev.value.includes('وصف تجريبي ٣٣٦٥'));
    const btns = [...document.querySelectorAll('.modal__footer button')].map((b) => b.dataset.action);
    await t.test('5. أزرار: مشاركة ونسخ وإغلاق', ['share', 'copy', 'close'].every((a) => btns.includes(a)));
    const closeBtn = document.querySelector('.modal__footer [data-action="close"]');
    if (closeBtn) closeBtn.click();
    const gone = await waitFor(() => !document.querySelector('#report-issue-desc'));
    await t.test('6. زر الإغلاق يغلق النافذة', !!gone);
  } finally { modal.closeAll(); body.remove(); }
});
