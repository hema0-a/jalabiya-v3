/* ==========================================================================
   audit-3314.test.js — اختبارات انحدار لإصلاحات الفحص الشامل
   ========================================================================== */

import { register } from '../registry.js';
import * as idb from '../../data/idb.js';
import { STORES } from '../../core/config.js';
import { localDateInput } from '../../core/utils.js';
import { getPeriodCoverage } from '../../services/commitments-calculator.js';

register('audit v3.3.14 write durability', async (t) => {
  const id = 'dur-test-' + Date.now();
  const v0 = idb.getWriteVersion();
  await idb.put(STORES.CUSTOMERS, { id, name: 'اختبار', createdAt: 1, updatedAt: 1 });
  await t.test('1. put يُنهي المعاملة ويزيد عدّاد الكتابة',
    idb.getWriteVersion() === v0 + 1 && (await idb.get(STORES.CUSTOMERS, id)).name === 'اختبار');

  let rejected = false;
  try { await idb.put(STORES.CUSTOMERS, { id: id + '-bad', fn() {} }); }
  catch (e) { rejected = true; }
  await t.test('2. قيمة غير قابلة للتخزين ترفض الوعد (لا نجاح كاذب)', rejected);

  await idb.remove(STORES.CUSTOMERS, id);
  await t.test('3. remove يُنهي المعاملة ويحذف السجل',
    (await idb.get(STORES.CUSTOMERS, id)) === undefined);
});

register('audit v3.3.14 periodic commitments', async (t) => {
  const now = new Date(2026, 9, 10);                       /* 10 أكتوبر 2026 */
  const at = (monthsAgo) => new Date(2026, 9 - monthsAgo, 15).getTime();
  const q = { id: 'q', amount: 3000, frequency: 'quarterly' };

  await t.test('4. التزام ربع سنوي دُفع قبل شهرين = مغطّى (لا يُعدّ متأخراً)',
    getPeriodCoverage(q, [{ commitmentId: 'q', amount: 3000, date: at(2) }], now).covered === true);

  await t.test('5. دُفع قبل 4 أشهر = غير مغطّى (حان موعد الدورة)',
    getPeriodCoverage(q, [{ commitmentId: 'q', amount: 3000, date: at(4) }], now).covered === false);

  const a = { id: 'a', amount: 12000, frequency: 'annual' };
  await t.test('6. سنوي: دفعة كاملة قبل 8 أشهر مغطّى، وجزئية غير مغطّى',
    getPeriodCoverage(a, [{ commitmentId: 'a', amount: 12000, date: at(8) }], now).covered === true &&
    getPeriodCoverage(a, [{ commitmentId: 'a', amount: 5000, date: at(8) }], now).covered === false);

  const o = { id: 'o', amount: 5000, frequency: 'once' };
  await t.test('7. مرة واحدة: دفعتان تكملان المبلغ = مسدّد',
    getPeriodCoverage(o, [
      { commitmentId: 'o', amount: 2000, date: at(10) },
      { commitmentId: 'o', amount: 3000, date: at(1) },
    ], now).covered === true);

  await t.test('8. الشهري والأسبوعي يُقاسان بالشهر الحالي (null)',
    getPeriodCoverage({ id: 'm', amount: 100, frequency: 'monthly' }, [], now) === null &&
    getPeriodCoverage({ id: 'w', amount: 100, frequency: 'weekly' }, [], now) === null);
});

register('audit v3.3.14 local date inputs', async (t) => {
  const lateNight = new Date(2026, 9, 11, 0, 30);          /* 11 أكتوبر 00:30 محلي */
  await t.test('9. localDateInput يعيد التاريخ المحلي (لا تاريخ UTC)',
    localDateInput(lateNight) === '2026-10-11');
  await t.test('10. localDateInput يملأ الأصفار (شهر/يوم مفرد)',
    localDateInput(new Date(2026, 0, 5, 12)) === '2026-01-05');
});
