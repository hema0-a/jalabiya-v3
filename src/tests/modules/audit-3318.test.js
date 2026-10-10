/* ==========================================================================
   audit-3318.test.js — إعادة هيكلة حساب الأيام والحد اليومي (v3.3.18)
   ========================================================================== */

import { register } from '../registry.js';
import { toTimestamp, startOfDay, endOfDay, addDaysNoon, dayKey, dayDiff, isSameDay, weekdayOf } from '../../core/day-math.js';
import { buildDayLedger, getDayAmount, getDayLoad, suggestDueDate } from '../../services/order-scheduler.js';
import { getDeadlineInfo, isPastDue } from '../../services/order-timing.js';
import { localDateInput, parseDateInput } from '../../core/utils.js';

const dayAt = (n, h = 12, mi = 0) => {
  const b = new Date();
  return new Date(b.getFullYear(), b.getMonth(), b.getDate() + n, h, mi, 0, 0);
};
const ord = (id, amount, n, extra = {}) => ({ id, amount, dueDate: dayAt(n).getTime(), status: 'pending', ...extra });
const farOff = () => dayAt(6).getDay();
const sameDay = (ts, n) => isSameDay(ts, dayAt(n));

register('audit v3.3.18 day math & daily limit', async (t) => {
  /* --- day-math --- */
  let dstOk = true;
  for (let d = 0; d < 400 && dstOk; d += 1) {
    for (const k of [1, 2, 7, 30]) {
      const a = new Date(2026, 0, 1 + d, 12), b = new Date(2026, 0, 1 + d + k, 12);
      if (dayDiff(a, b) !== k || dayDiff(b, a) !== -k) { dstOk = false; break; }
    }
  }
  await t.test('1. dayDiff دقيق طوال 400 يوم (يشمل أي تغيير توقيت صيفي)', dstOk);

  let addOk = true;
  for (let d = 0; d < 400 && addOk; d += 3) {
    const base = new Date(2026, 0, 1 + d, 12).getTime();
    const r = new Date(addDaysNoon(base, 5));
    const e = new Date(2026, 0, 1 + d + 5, 12);
    if (r.getFullYear() !== e.getFullYear() || r.getMonth() !== e.getMonth() || r.getDate() !== e.getDate() || r.getHours() !== 12) addOk = false;
  }
  await t.test('2. addDaysNoon يعيد ظهر اليوم الصحيح بالتقويم', addOk);

  await t.test('3. 00:00 و12:00 و23:59 تعطي مفتاح اليوم نفسه',
    dayKey(dayAt(2, 0)) === dayKey(dayAt(2, 12)) && dayKey(dayAt(2, 23, 59)) === dayKey(dayAt(2, 12)));
  await t.test('4. قيم غير صالحة: NaN / نص فارغ بلا استثناء',
    Number.isNaN(dayDiff(null, 5)) && dayKey('') === '' && Number.isNaN(startOfDay('abc')) && Number.isNaN(weekdayOf(undefined)));
  await t.test('5. toTimestamp يفهم الرقم والنص الرقمي ونص ISO و Date',
    toTimestamp('1760000000000') === 1760000000000 && toTimestamp(5) === 5 &&
    toTimestamp(new Date(7)) === 7 && !Number.isNaN(toTimestamp('2026-10-10')) && Number.isNaN(toTimestamp(Infinity)));
  await t.test('6. endOfDay يقع في اليوم نفسه وبعده بمللي ثانية يوم جديد',
    isSameDay(endOfDay(dayAt(1)), dayAt(1)) && !isSameDay(endOfDay(dayAt(1)) + 1, dayAt(1)));

  /* --- سجلّ الحِمل --- */
  const ords = [ord('a', 400, 1), ord('b', 300, 1, { status: 'delivered' }), ord('c', 100, 1, { status: 'cancelled' }), ord('d', 50, 2)];
  const led = buildDayLedger(ords);
  const k1 = dayKey(dayAt(1));
  await t.test('7. السجلّ يستثني المسلَّم والملغى ويعدّ الباقي', led.get(k1).piasters === 40000 && led.get(k1).count === 1 && led.get(dayKey(dayAt(2))).piasters === 5000);
  await t.test('8. includeDelivered يضيف المسلَّم ولا يضيف الملغى',
    buildDayLedger(ords, { includeDelivered: true }).get(k1).piasters === 70000);
  await t.test('9. getDayAmount يتجاهل ساعة الحفظ', getDayAmount(ords, dayAt(1, 0)) === 400 && getDayAmount(ords, dayAt(1, 23, 59)) === 400);

  /* --- دقة المليم --- */
  const floatCase = [ord('x', 0.01, 1), ord('y', 0.13, 1)];
  const r9 = suggestDueDate(floatCase, { dayOffWeekday: farOff(), dailyOrderLimit: 2, orderAmount: 1.86, minDays: 1 });
  await t.test('10. السعة المتبقية 1.86 تساوي المبلغ 1.86 تماماً → يُقبل غداً (خطأ الفاصلة العائمة)', sameDay(r9.timestamp, 1) && r9.remainingAfter === 0);
  const r10 = suggestDueDate(floatCase, { dayOffWeekday: farOff(), dailyOrderLimit: 2, orderAmount: 1.87, minDays: 1 });
  await t.test('11. مليم واحد زيادة → يُتخطّى غداً', sameDay(r10.timestamp, 2));

  /* --- حِمل اليوم --- */
  const L = (amount) => getDayLoad([ord('z', amount, 0)], dayAt(0), { limit: 700 });
  await t.test('12. حالات الشريط: 559 عادي، 560 قريب، 700 قريب (لا تجاوز)، 700.01 تجاوز',
    L(559).status === 'ok' && L(560).status === 'near' && L(700).status === 'near' && L(700.01).status === 'exceeded');
  const l400 = L(400);
  await t.test('13. المتبقي والنسبة والعدد', l400.remaining === 300 && l400.percent === 57 && l400.count === 1 && l400.amount === 400);
  await t.test('14. بلا حد يومي → status none ولا تجاوز', getDayLoad([ord('z', 9999, 0)], dayAt(0), { limit: 0 }).status === 'none');
  await t.test('15. المسلَّم اليوم يستهلك سعة اليوم في الشريط',
    getDayLoad([ord('z', 500, 0, { status: 'delivered' })], dayAt(0), { limit: 700 }).amount === 500);

  /* --- الاقتراح --- */
  const r = suggestDueDate([ord('a', 400, 1)], { dayOffWeekday: farOff(), dailyOrderLimit: 700, orderAmount: 200, minDays: 1 });
  await t.test('16. الاقتراح ظهر اليوم ويحمل حِمل اليوم والمتبقي بعد الطلب',
    sameDay(r.timestamp, 1) && new Date(r.timestamp).getHours() === 12 && r.dayLoad === 400 && r.remainingAfter === 100);
  const r0 = suggestDueDate([], { dayOffWeekday: farOff(), dailyOrderLimit: 700, orderAmount: 100, minDays: 0 });
  await t.test('17. minDays = 0 يسمح باليوم نفسه', sameDay(r0.timestamp, 0) && r0.reason === 'اليوم');
  await t.test('18. التاريخ المقترح يمرّ عبر حقل التاريخ والحفظ بلا انزياح',
    isSameDay(parseDateInput(localDateInput(r.timestamp)), r.timestamp));

  /* --- حالة الموعد والتأخر --- */
  await t.test('19. getDeadlineInfo: اليوم/غداً/أمس/بعد 7 أيام بغض النظر عن ساعة الحفظ',
    getDeadlineInfo(dayAt(0, 0)).status === 'today' && getDeadlineInfo(dayAt(0, 23, 59)).status === 'today' &&
    getDeadlineInfo(dayAt(1)).status === 'tomorrow' &&
    getDeadlineInfo(dayAt(-1)).status === 'overdue' && getDeadlineInfo(dayAt(-1)).daysLeft === -1 &&
    getDeadlineInfo(dayAt(7)).daysLeft === 7);
  await t.test('20. isPastDue: لا تأخر حتى آخر لحظة من يوم الموعد',
    isPastDue(dayAt(0).getTime(), endOfDay(dayAt(0))) === false && isPastDue(dayAt(0).getTime(), endOfDay(dayAt(0)) + 1) === true);
});
