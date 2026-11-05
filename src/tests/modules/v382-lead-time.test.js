/* ==========================================================================
   v382-lead-time.test.js — المدة المعتادة لكل صنف والاقتراح الذكي (v3.8.2)
   ========================================================================== */
import { register } from '../registry.js';
import {
  itemKeys, orderLeadDays, wasLate, learnLeadTimes, statsForItems, suggestLeadDays, isChronicallyLate, MIN_SAMPLES,
} from '../../services/lead-time.js';

const src = async (rel) => (await fetch(new URL('../../' + rel, import.meta.url))).text();
const DAY = 86400000;
const T0 = new Date(2026, 0, 1, 10).getTime();
const mk = (id, name, days, dueDays, extra) => ({
  id, status: 'delivered', items: [{ name }], createdAt: T0, readyAt: T0 + days * DAY,
  dueDate: dueDays == null ? undefined : T0 + dueDays * DAY, ...(extra || {}),
});

register('v3.8.2 المدة المعتادة', async (t) => {
  await t.test('1. itemKeys: توحيد عربي وبلا تكرار', itemKeys({ items: [{ name: 'جلابيّة ' }, { name: 'جلابية' }, { name: 'عباءة' }] }).length === 2 && itemKeys({}).length === 0);
  await t.test('2. orderLeadDays: ready/delivered فقط', orderLeadDays(mk('a', 'x', 5)) === 5 && orderLeadDays({ status: 'pending', createdAt: T0, readyAt: T0 + DAY }) === null);
  await t.test('3. orderLeadDays: بيانات ناقصة/معكوسة/خيالية ⟵ null', orderLeadDays({ status: 'ready', createdAt: T0 }) === null
    && orderLeadDays({ status: 'ready', createdAt: T0, readyAt: T0 - DAY }) === null && orderLeadDays(mk('a', 'x', 400)) === null && orderLeadDays(null) === null);
  await t.test('4. wasLate: يُسمح بنهاية يوم الموعد', wasLate(mk('a', 'x', 5, 5)) === false && wasLate(mk('a', 'x', 7, 5)) === true && wasLate(mk('a', 'x', 5)) === null);
  const list = [mk('1', 'جلابية', 4, 5), mk('2', 'جلابية', 6, 5), mk('3', 'جلابية', 5, 7), mk('4', 'جلابية', 10, 6), mk('5', 'عباية', 3, 5), mk('6', 'عباية', 3, 5)];
  const L = learnLeadTimes(list);
  const j = L.get('جلابيه');
  await t.test('5. التعلّم لكل صنف: العدد والمتوسط والوسيط', j.count === 4 && j.avgDays === 6.3 && j.medianDays === 5);
  await t.test('6. p80 = مدة يلتزم بها 80%', j.p80Days === 10);
  await t.test('7. نسبة التأخر 50% (2 من 4)', j.lateCount === 2 && j.lateRate === 50);
  await t.test('8. عيّنات أقل من الحد ⟵ غير موثوق', L.get('عبايه').count === 2 && L.get('عبايه').reliable === false && MIN_SAMPLES === 3);
  await t.test('9. الطلبات المختلطة لا تدخل', (() => {
    const mixed = { ...mk('m', 'جلابية', 20), items: [{ name: 'جلابية' }, { name: 'عباية' }] };
    return learnLeadTimes([mixed, mixed, mixed]).size === 0;
  })());
  await t.test('10. الطلبات غير المنتهية لا تدخل', learnLeadTimes([{ ...mk('p', 'س', 3), status: 'pending' }]).size === 0);
  await t.test('11. statsForItems: الموثوق فقط وبلا تكرار ومرتّب بالأطول', (() => {
    const st = statsForItems(L, ['جلابية', 'جلابيّة', 'عباية', 'غير معروف']);
    return st.length === 1 && st[0].name === 'جلابية';
  })());
  await t.test('12. suggestLeadDays: الأطول p80 أو null', suggestLeadDays([{ p80Days: 3 }, { p80Days: 8 }]) === 8 && suggestLeadDays([]) === null && suggestLeadDays(null) === null);
  await t.test('13. isChronicallyLate: عتبتان', isChronicallyLate(j) === true && isChronicallyLate({ lateCount: 1, lateRate: 100 }) === false && isChronicallyLate({ lateCount: 5, lateRate: 10 }) === false && isChronicallyLate(null) === false);
  await t.test('14. مدخلات فارغة لا تكسر', learnLeadTimes(null).size === 0 && learnLeadTimes([null, {}]).size === 0 && statsForItems(null, null).length === 0);
  const ui = await src('ui/lead-time-strip.js');
  await t.test('15. الشريط: بلا innerHTML ولا import ديناميكي', !/innerHTML\s*=/.test(ui) && !/\bimport\(/.test(ui));
  const sch = await src('pages/orders/form-schedule.js');
  const frm = await src('pages/orders/form.js');
  await t.test('16. مربوط بنموذج الطلب (يُحدَّث مع تغيّر البنود)', sch.includes('buildLeadTimeStrip(') && frm.includes('leadStrip.refresh()') && frm.includes('dueHint, leadStrip, capStrip'));
});
