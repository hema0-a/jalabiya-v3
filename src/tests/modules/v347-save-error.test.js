/* ==========================================================================
   v347-save-error.test.js — رسالة فشل الحفظ المفهومة (v3.4.7)
   ========================================================================== */

import { register } from '../registry.js';
import { describeSaveError, saveFailMessage, isQuotaError } from '../../core/save-error.js';

const err = (name, message, code) => { const e = new Error(message); if (name) e.name = name; if (code !== undefined) e.code = code; return e; };

register('v3.4.7 save-error — رسائل فشل الحفظ', async (t) => {
  await t.test('1. QuotaExceededError (بالاسم) ← رسالة امتلاء المساحة',
    isQuotaError(err('QuotaExceededError', 'x')) && /مساحة التخزين/.test(describeSaveError(err('QuotaExceededError', 'x'))));
  await t.test('2. الرمز القديم 22 أو كلمة quota في الرسالة ← نفس رسالة المساحة',
    /مساحة التخزين/.test(describeSaveError(err('', 'x', 22))) && /مساحة التخزين/.test(describeSaveError(new Error('The quota has been exceeded'))));
  await t.test('3. media-writes-disabled ← اطلب تحديث التطبيق',
    /حدّث التطبيق/.test(describeSaveError(err('', 'الكتابة غير مفعّلة', 'media-writes-disabled'))));
  await t.test('4. client-outdated ← اطلب تحديث التطبيق', /أقدم من المطلوبة/.test(describeSaveError(err('', 'x', 'client-outdated'))));
  await t.test('5. upgrade blocked by another tab ← أغلق النوافذ الأخرى', /أغلق النوافذ/.test(describeSaveError(new Error('[idb] upgrade blocked by another tab'))));
  await t.test('6. InvalidStateError / connection closing ← أعد تحميل الصفحة',
    /أعد تحميل الصفحة/.test(describeSaveError(err('InvalidStateError', 'x'))) && /أعد تحميل الصفحة/.test(describeSaveError(new Error('The database connection is closing.'))));
  await t.test('7. [idb] write aborted / batch failed / AbortError ← رسالة كتابة تعذّرت بلا نص خام',
    !/\[idb\]/.test(describeSaveError(new Error('[idb] write aborted'))) && /تعذّر إكمال الكتابة/.test(describeSaveError(new Error('[idb] batch failed'))) && /تعذّر إكمال الكتابة/.test(describeSaveError(err('AbortError', 'x'))));
  await t.test('8. رسالة عربية من التطبيق تُعرض كما هي', describeSaveError(new Error('الرصيد لا يكفي')) === 'الرصيد لا يكفي');
  await t.test('9. خطأ مجهول إنجليزي ← رسالة عامة مع تفصيل مقصوص بحد 80 حرفاً',
    (() => { const m = describeSaveError(new Error('x'.repeat(300))); return /غير متوقع/.test(m) && m.length < 160; })());
  await t.test('10. قيم غير Error (null / undefined / نص / كائن فارغ) لا تُلقي استثناء',
    [null, undefined, 'boom', {}, 42].every((v) => typeof describeSaveError(v) === 'string' && describeSaveError(v).length > 0));
  await t.test('11. saveFailMessage: بادئة افتراضية ومخصّصة',
    saveFailMessage(err('QuotaExceededError', 'x')).startsWith('فشل الحفظ: ') && saveFailMessage(new Error('الرصيد لا يكفي'), 'تعذّر الحفظ') === 'تعذّر الحفظ: الرصيد لا يكفي');
  await t.test('12. isQuotaError لا يخطئ في الأخطاء العادية', !isQuotaError(new Error('x')) && !isQuotaError(null) && !isQuotaError('طلب غير صالح'));
});
