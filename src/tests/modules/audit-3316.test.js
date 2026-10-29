/* ==========================================================================
   audit-3316.test.js — اقتراح تاريخ التسليم لا يتجاوز الحد اليومي (v3.3.16)
   ==========================================================================
   كان الاقتراح يوزّع الطلب على أيام (يأخذ السعة المتبقية من يوم ممتلئ جزئياً ثم
   يكمل في اليوم التالي) ويُعيد آخر يوم، بينما الطلب يُحفظ بتاريخ واحد ويُحسب
   كاملاً عليه — فيتجاوز ذلك اليوم الحد اليومي.
   ========================================================================== */

import { register } from '../registry.js';
import { suggestDueDate, getDayAmount } from '../../services/order-scheduler.js';

/** يوم بحساب التقويم: n أيام من اليوم، عند الساعة h. */
function dayAt(n, h = 12) {
  const b = new Date();
  return new Date(b.getFullYear(), b.getMonth(), b.getDate() + n, h, 0, 0, 0);
}
const wd = (n) => dayAt(n).getDay();
const ord = (id, amount, n, extra = {}) => ({ id, amount, dueDate: dayAt(n).getTime(), status: 'pending', ...extra });
/** يوم إجازة لا يتداخل مع الأيام 1..4 */
const farOff = () => wd(6);
const cfg = (o = {}) => ({ dayOffWeekday: farOff(), dailyOrderLimit: 700, minDays: 1, maxLookaheadDays: 60, orderAmount: 500, ...o });
const sameDay = (ts, n) => {
  const a = new Date(ts), b = dayAt(n);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

register('audit v3.3.16 order scheduler', async (t) => {
  /* سيناريو المستخدم: غداً إجازة وفيه 400، طلب 500 → بعد غد */
  let r = suggestDueDate([ord('a', 400, 1)], cfg({ dayOffWeekday: wd(1) }));
  await t.test('1. غداً إجازة وممتلئ جزئياً → يُقترح بعد غد', sameDay(r.timestamp, 2));

  /* غداً يوم عمل فيه 400: الـ500 لا تتسع (300 متبقية) → تخطٍّ */
  r = suggestDueDate([ord('a', 400, 1)], cfg());
  await t.test('2. 400 موجودة + طلب 500 (سعة 300) → يُتخطّى غداً', sameDay(r.timestamp, 2));

  /* الانحدار: غداً 400 وبعد غد 400 → كان يقترح بعد غد على أساس 900 > 700.
     الآن تُستغل السعة الجزئية: 300 غداً + 200 بعد غد، فلا يتجاوز أي يوم الحد وينتهي بعد غد */
  r = suggestDueDate([ord('a', 400, 1), ord('b', 400, 2)], cfg());
  const placed3 = [ord('a', 400, 1), ord('b', 400, 2), { id: 'new', amount: 500, dueDate: r.timestamp, status: 'pending', workPlan: r.workPlan }];
  const maxLoad = Math.max(...[1, 2, 3, 4].map((n) => getDayAmount(placed3, dayAt(n), { dailyLimit: 700, dayOffWeekday: farOff() })));
  await t.test('3. لا يتجاوز أي يوم الحد (أقصى حِمل ' + maxLoad + ') وينتهي بعد غد بالسعة الجزئية', maxLoad <= 700 && sameDay(r.timestamp, 2));

  r = suggestDueDate([ord('a', 200, 1)], cfg());
  await t.test('4. السعة المتبقية = المبلغ تماماً (200+500≤700) → يُقبل غداً', sameDay(r.timestamp, 1));

  r = suggestDueDate([ord('a', 201, 1)], cfg());
  await t.test('5. يتجاوز بجنيه واحد (201+500) → يُتخطّى', sameDay(r.timestamp, 2));

  r = suggestDueDate([ord('a', 100, 1)], cfg({ orderAmount: 900 }));
  await t.test('6. طلب 900 (أكبر من الحد) مع 100 محجوزة غداً → 600 غداً + 300 بعد غد (يستغل السعة الجزئية)',
    sameDay(r.startTimestamp, 1) && sameDay(r.timestamp, 2) && r.overLimit === true && r.daysNeeded === 2);

  r = suggestDueDate([ord('a', 600, 1, { status: 'delivered' }), ord('b', 600, 1, { status: 'cancelled' })], cfg());
  await t.test('7. المسلَّم والملغى لا يشغلان اليوم', sameDay(r.timestamp, 1));

  r = suggestDueDate([ord('a', 600, 1)], cfg({ excludeOrderId: 'a' }));
  await t.test('8. استثناء الطلب الجاري تعديله', sameDay(r.timestamp, 1));

  r = suggestDueDate([{ id: 'a', amount: 400, dueDate: dayAt(1, 0).getTime(), status: 'pending' }, ord('b', 200, 1)], cfg());
  await t.test('9. تاريخ مخزَّن 00:00 و12:00 كلاهما يُحسب على نفس اليوم (600+500>700)', sameDay(r.timestamp, 2));

  r = suggestDueDate([{ id: 'a', amount: '400', dueDate: String(dayAt(1).toISOString()), status: 'pending' }], cfg());
  await t.test('10. dueDate نصي ISO ومبلغ نصي يُفهمان', sameDay(r.timestamp, 2));

  /* لا يقع أبداً على يوم الإجازة */
  let neverOff = true;
  for (let off = 0; off < 7; off++) {
    const x = suggestDueDate([ord('a', 400, 1), ord('b', 400, 2)], cfg({ dayOffWeekday: off }));
    if (new Date(x.timestamp).getDay() === off) neverOff = false;
  }
  await t.test('11. لا يُقترح يوم الإجازة مهما كان (7 حالات)', neverOff);

  /* حد 0 = بلا حد */
  r = suggestDueDate([ord('a', 9999, 1)], cfg({ dailyOrderLimit: 0 }));
  await t.test('12. بلا حد يومي → أول يوم غير إجازة', sameDay(r.timestamp, 1));

  /* الأفق ممتلئ */
  const full = []; for (let i = 1; i <= 5; i++) full.push(ord('f' + i, 700, i));
  r = suggestDueDate(full, cfg({ maxLookaheadDays: 5, dayOffWeekday: 99 }));
  await t.test('13. أفق ممتلئ → رسالة «لا يوجد يوم كافٍ» بلا استثناء', /لا يوجد يوم/.test(r.reason));

  /* دقة التقويم: التاريخ المقترح = اليوم + minDays بالتقويم لكل قيم minDays */
  let calOk = true;
  for (let m = 1; m <= 40; m++) {
    const x = suggestDueDate([], cfg({ minDays: m, dayOffWeekday: 99 }));
    if (!sameDay(x.timestamp, m)) calOk = false;
  }
  await t.test('14. minDays=1..40 → التاريخ يطابق اليوم+n بالتقويم (متحمّل للتوقيت الصيفي)', calOk);
});
