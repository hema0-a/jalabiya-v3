/* ==========================================================================
   audit-3318.test.js — إعادة هيكلة حساب الأيام والحد اليومي (v3.3.18)
   ========================================================================== */

import { register } from '../registry.js';
import { toTimestamp, startOfDay, endOfDay, addDaysNoon, dayKey, dayDiff, isSameDay, weekdayOf } from '../../core/day-math.js';
import { buildDayLedger, getDayAmount, getDayLoad, suggestDueDate, planOrder, isValidWorkPlan } from '../../services/order-scheduler.js';
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
  const two = (a, b) => getDayLoad([ord('p', a, 0), ord('q', b, 0)], dayAt(0), { limit: 700 });
  await t.test('12. حالات الشريط: 559 عادي، 560 قريب، 700 قريب (لا تجاوز)، 400+300.01 تجاوز',
    L(559).status === 'ok' && L(560).status === 'near' && L(700).status === 'near' && two(400, 300.01).status === 'exceeded' && two(400, 300).status === 'near');
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


  /* --- طلب أكبر من الحد: يُوزَّع فعلياً على أيام العمل --- */
  const big = { dayOffWeekday: farOff(), dailyOrderLimit: 700, minDays: 1, maxLookaheadDays: 60 };
  const rb = suggestDueDate([], { ...big, orderAmount: 5000 });
  await t.test('21. 5000 ÷ 700 → 8 أيام عمل (يتخطى الإجازة): يبدأ غداً وينتهي اليوم التاسع',
    rb.daysNeeded === 8 && sameDay(rb.startTimestamp, 1) && sameDay(rb.timestamp, 9) && /يوزَّع على 8/.test(rb.reason));
  const placed = [{ id: 'big', amount: 5000, dueDate: rb.timestamp, status: 'pending' }];
  const loadOn = (n, list = placed) => getDayLoad(list, dayAt(n), { limit: 700, dayOffWeekday: farOff() });
  await t.test('22. الحِمل: 700 على كل يوم عمل من 1 إلى 8 عدا الإجازة، والباقي 100 على يوم التسليم، والإجازة فارغة',
    [1, 2, 3, 4, 5, 7, 8].every((n) => loadOn(n).amount === 700 && !loadOn(n).exceeded) &&
    loadOn(9).amount === 100 && loadOn(6).amount === 0);
  const r2 = suggestDueDate(placed, { ...big, orderAmount: 600 });
  await t.test('23. طلب 600 يتسع في سعة اليوم الأخير المتبقية (600) ولا يُدفع بعده', sameDay(r2.timestamp, 9));
  const r3 = suggestDueDate(placed, { ...big, orderAmount: 5000 });
  await t.test('24. طلب كبير ثانٍ يبدأ باليوم الذي فيه سعة جزئية (اليوم 9: 600 متاحة)',
    sameDay(r3.startTimestamp, 9) && r3.workPlan[0].amount === 600 && r3.workPlan.reduce((a, p) => a + p.amount, 0) === 5000);


  /* --- خطة العمل المحفوظة والسعة الجزئية --- */
  const d1 = dayAt(1), d2 = dayAt(2);
  const planned = [{ id: 'p', amount: 500, dueDate: d2.getTime(), status: 'pending',
    workPlan: [{ day: dayKey(d1), amount: 300 }, { day: dayKey(d2), amount: 200 }] }];
  const lg = buildDayLedger(planned, { dailyLimit: 700, dayOffWeekday: farOff() });
  await t.test('26. خطة محفوظة صالحة تُحسب كما هي (300 + 200 لا 500 على يوم التسليم)',
    lg.get(dayKey(d1)).piasters === 30000 && lg.get(dayKey(d2)).piasters === 20000 && isValidWorkPlan(planned[0]));
  const stale = [{ ...planned[0], amount: 800 }];
  const ls = buildDayLedger(stale, { dailyLimit: 700, dayOffWeekday: farOff() });
  await t.test('27. خطة لا يطابق مجموعها المبلغ (بعد تعديل المبلغ) تُتجاهل ويُستخدم التوزيع الافتراضي',
    isValidWorkPlan(stale[0]) === false && ls.get(dayKey(d2)).piasters === 10000);

  const jit = planOrder([], { ...big, orderAmount: 1500, endDate: dayAt(4).getTime(), minDays: 0 });
  await t.test('28. موعد يدوي (اليوم 4): الخطة في آخر لحظة 700 + 700 + 100 على الأيام 4 و3 و2',
    jit && jit.plan.length === 3 && jit.plan[0].amount === 100 && jit.plan[2].amount === 700 &&
    jit.plan[2].day === dayKey(dayAt(4)) && jit.plan[0].day === dayKey(dayAt(2)));
  await t.test('29. موعد يدوي مبكر لا تتسع له السعة → null (يُحذَّر المستخدم)',
    planOrder([], { ...big, orderAmount: 5000, endDate: dayAt(1).getTime(), minDays: 0 }) === null);

  const partial = [ord('a', 500, 1), ord('b', 500, 2), ord('c', 500, 3)];
  const rp = suggestDueDate(partial, { ...big, orderAmount: 500 });
  await t.test('30. 200 متاحة في كل من 3 أيام + طلب 500 → ينتهي اليوم 3 (200+200+100) بدل اليوم 4',
    sameDay(rp.timestamp, 3) && rp.workPlan.length === 3 && rp.workPlan.reduce((a, p) => a + p.amount, 0) === 500);
  const rs = suggestDueDate([], { ...big, orderAmount: 500 });
  await t.test('31. جدول فارغ وطلب 500 → يوم واحد بلا تفتيت', sameDay(rs.timestamp, 1) && rs.workPlan.length === 1);
  const tiny = [ord('t', 650, 1)];
  const rt = suggestDueDate(tiny, { ...big, orderAmount: 1000 });
  await t.test('32. يوم متبقٍ فيه 50 (أقل من 10% من الحد) لا يُستخدم لطلب كبير: يبدأ اليوم 2',
    sameDay(rt.startTimestamp, 2));

  /* --- خاصية: أي تسلسل اقتراحات لا يتجاوز الحد اليومي في أي يوم، ولا يبدأ قبل الغد --- */
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let propOk = true, propMsg = '';
  for (let run = 0; run < 25 && propOk; run++) {
    const cfg2 = { dayOffWeekday: Math.floor(rnd() * 7), dailyOrderLimit: 300 + Math.floor(rnd() * 900), minDays: 1, maxLookaheadDays: 90 };
    let list = [];
    for (let i = 0; i < 12; i++) {
      const amount = Math.round((50 + rnd() * 6000) * 100) / 100;
      const sg = suggestDueDate(list, { ...cfg2, orderAmount: amount });
      if (/لا يوجد/.test(sg.reason)) continue;
      if (dayDiff(new Date(), sg.startTimestamp) < 1) { propOk = false; propMsg = 'يبدأ قبل الغد'; break; }
      list.push({ id: 'o' + i, amount, dueDate: sg.timestamp, status: 'pending', workPlan: sg.workPlan });
    }
    for (let m = 0; m < 4; m++) {          /* مواعيد يدوية: خطة «في آخر لحظة» لا تتجاوز الحد أيضاً */
      const amount = Math.round((50 + rnd() * 4000) * 100) / 100;
      const end = dayAt(1 + Math.floor(rnd() * 25)).getTime();
      const pl = planOrder(list, { ...cfg2, orderAmount: amount, endDate: end, minDays: 0 });
      if (pl) list.push({ id: 'm' + m, amount, dueDate: end, status: 'pending', workPlan: pl.plan });
    }
    const led = buildDayLedger(list, { dailyLimit: cfg2.dailyOrderLimit, dayOffWeekday: cfg2.dayOffWeekday });
    for (const [, v] of led) {
      if (v.piasters > Math.round(cfg2.dailyOrderLimit * 100)) { propOk = false; propMsg = 'تجاوز الحد'; break; }
    }
  }
  await t.test('25. خاصية (25 سيناريو: 12 اقتراحاً + 4 مواعيد يدوية): لا يوم يتجاوز الحد ولا بدء قبل الغد ' + propMsg, propOk);

  /* --- حالة الموعد والتأخر --- */
  await t.test('19. getDeadlineInfo: اليوم/غداً/أمس/بعد 7 أيام بغض النظر عن ساعة الحفظ',
    getDeadlineInfo(dayAt(0, 0)).status === 'today' && getDeadlineInfo(dayAt(0, 23, 59)).status === 'today' &&
    getDeadlineInfo(dayAt(1)).status === 'tomorrow' &&
    getDeadlineInfo(dayAt(-1)).status === 'overdue' && getDeadlineInfo(dayAt(-1)).daysLeft === -1 &&
    getDeadlineInfo(dayAt(7)).daysLeft === 7);
  await t.test('20. isPastDue: لا تأخر حتى آخر لحظة من يوم الموعد',
    isPastDue(dayAt(0).getTime(), endOfDay(dayAt(0))) === false && isPastDue(dayAt(0).getTime(), endOfDay(dayAt(0)) + 1) === true);
});
