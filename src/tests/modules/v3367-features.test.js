/* ==========================================================================
   v3367-features.test.js — شريط سعة الأيام · تصفية الديون بالعمر (v3.3.67)
   ========================================================================== */

import { register } from '../registry.js';
import { buildCapacityStrip, describeChosenDay } from '../../services/capacity-strip.js';
import { buildCapacityStripView } from '../../ui/capacity-strip-view.js';
import { filterOverdueByAge } from '../../services/receivables.js';
import { addDaysNoon, weekdayOf } from '../../core/day-math.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

register('v3.3.67 capacity strip', async (t) => {
  const now = Date.now();
  const day3 = addDaysNoon(now, 3);
  const day5 = addDaysNoon(now, 5);
  const off = weekdayOf(addDaysNoon(now, 1));
  const orders = [
    { id: 'o1', amount: 900, dueDate: day3, status: 'pending' },
    { id: 'o2', amount: 700, dueDate: day5, status: 'in_progress' },
    { id: 'o3', amount: 400, dueDate: day5, status: 'pending' },
  ];
  const cfg = { dailyOrderLimit: 1000, dayOffWeekday: off };
  t.test('1. بلا حد يومي ⟵ مصفوفة فارغة', buildCapacityStrip(orders, { dailyOrderLimit: 0 }, now).length === 0);
  const strip = buildCapacityStrip(orders, cfg, now, 14);
  t.test('2. 14 يوماً', strip.length === 14);
  t.test('3. الإجازة تُعلَّم off ولا تتسع', strip[1].status === 'off' && strip[1].off && !strip[1].fits);
  t.test('4. يوم 90% ⟵ near', strip[3].status === 'near');
  t.test('5. يوم 110% ⟵ exceeded ولا يتسع', strip[5].status === 'exceeded' && !strip[5].fits);
  t.test('6. يوم فارغ ⟵ ok ويتسع', strip[0].status === 'ok' || strip[0].status === 'off' ? true : false);
  const withAmt = buildCapacityStrip(orders, { ...cfg, orderAmount: 200 }, now, 14);
  t.test('7. طلب 200 لا يتسع في يوم عليه 900 من 1000', withAmt[3].fits === false);
  const excl = buildCapacityStrip(orders, { ...cfg, excludeOrderId: 'o1' }, now, 14);
  t.test('8. استثناء الطلب الجاري يُفرغ يومه', excl[3].amount === 0);
  t.test('9. عدد الأيام محصور (0 ⟵ 14، 999 ⟵ 60)',
    buildCapacityStrip(orders, cfg, now, 0).length === 14 && buildCapacityStrip(orders, cfg, now, 999).length === 60);

  t.test('10. وصف يوم مزدحم ⟵ danger مع مبلغ الطلب', describeChosenDay(orders, { ...cfg, orderAmount: 300 }, day3, now).level === 'danger');
  t.test('11. وصف يوم شبه ممتلئ ⟵ warn', describeChosenDay(orders, cfg, day3, now).level === 'warn');
  t.test('12. وصف يوم فارغ ⟵ ok', describeChosenDay([], cfg, day3, now).level === 'ok' || weekdayOf(day3) === off);
  t.test('13. وصف يوم الإجازة ⟵ off', describeChosenDay(orders, cfg, addDaysNoon(now, 1), now).level === 'off');
  t.test('14. بلا حد أو تاريخ غير صالح ⟵ none',
    describeChosenDay(orders, { dailyOrderLimit: 0 }, day3).level === 'none' && describeChosenDay(orders, cfg, NaN).level === 'none');
});

register('v3.3.67 capacity strip view', async (t) => {
  const now = Date.now();
  const picks = [];
  const cfg = { dailyOrderLimit: 1000, dayOffWeekday: weekdayOf(addDaysNoon(now, 1)) };
  const view = buildCapacityStripView({ getOrders: () => [], getConfig: () => cfg, onPick: (ts) => picks.push(ts) });
  document.body.appendChild(view);
  view.refreshNow();
  const days = view.querySelectorAll('.capstrip__day');
  t.test('1. 14 زراً', days.length === 14);
  t.test('2. زر الإجازة معطّل', view.querySelector('[data-status="off"]').disabled === true);
  const first = [...days].find((b) => !b.disabled);
  first.click();
  t.test('3. الضغط على يوم يستدعي onPick بتاريخه', picks.length === 1 && typeof picks[0] === 'number');
  view.querySelector('[data-status="off"]').click();
  t.test('4. الضغط على الإجازة لا يختار', picks.length === 1);
  const none = buildCapacityStripView({ getOrders: () => [], getConfig: () => ({ dailyOrderLimit: 0 }), onPick() {} });
  none.refreshNow();
  t.test('5. بلا حد يومي ⟵ مخفي', none.style.display === 'none' && none.children.length === 0);
  const bad = buildCapacityStripView({ getOrders: () => { throw new Error('x'); }, getConfig: () => cfg, onPick() {} });
  bad.refreshNow();
  t.test('6. خطأ في الجلب لا يكسر', bad.style.display === 'none');
  view.refresh(); view.refresh();
  await sleep(60);
  t.test('7. refresh متكرر يرسم مرة سليمة', view.querySelectorAll('.capstrip__day').length === 14);
  view.remove();
});

register('v3.3.67 debts age filter', async (t) => {
  const list = [
    { customerId: 'a', overdue: 100, oldestDays: 3 },
    { customerId: 'b', overdue: 200, oldestDays: 10 },
    { customerId: 'c', overdue: 300, oldestDays: 45 },
    { customerId: 'd', overdue: 0, oldestDays: 0, pending: 50 },
    { customerId: 'e', overdue: 50, oldestDays: 90 },
  ];
  t.test('1. 0 ⟵ كل المتأخرين (بلا من لا دين عليه)', filterOverdueByAge(list, 0).length === 4);
  t.test('2. +7 ⟵ b,c,e', filterOverdueByAge(list, 7).map((x) => x.customerId).join() === 'b,c,e');
  t.test('3. +30 ⟵ c,e', filterOverdueByAge(list, 30).length === 2);
  t.test('4. +60 ⟵ e', filterOverdueByAge(list, 60)[0].customerId === 'e');
  t.test('5. مدخلات سيئة آمنة', filterOverdueByAge(null, 5).length === 0 && filterOverdueByAge(list, 'x').length === 4);
  t.test('6. لا تعدّل الأصل', list.length === 5);
});

register('v3.3.68 backup nudge', async (t) => {
  const { backupNudge, NUDGE_MIN_RECORDS, NUDGE_AFTER_DAYS, NUDGE_SNOOZE_DAYS } = await import('../../services/backup-nudge.js');
  const now = Date.now(); const D = 86400000;
  t.test('1. بيانات قليلة ⟵ لا تذكير', backupNudge({ recordCount: NUDGE_MIN_RECORDS - 1 }, now).show === false);
  const never = backupNudge({ recordCount: 50 }, now);
  t.test('2. لم تُحفظ نسخة خارجية قط ⟵ تذكير never', never.show && never.never && never.text.includes('50'));
  t.test('3. نسخة حديثة ⟵ لا تذكير', backupNudge({ recordCount: 50, externalAt: now - 3 * D }, now).show === false);
  const old = backupNudge({ recordCount: 50, externalAt: now - (NUDGE_AFTER_DAYS + 2) * D }, now);
  t.test('4. نسخة قديمة ⟵ تذكير بعدد الأيام', old.show && !old.never && old.days === NUDGE_AFTER_DAYS + 2 && old.text.includes(String(NUDGE_AFTER_DAYS + 2)));
  t.test('5. التأجيل يُسكت', backupNudge({ recordCount: 50, snoozedAt: now - D }, now).show === false);
  t.test('6. انتهاء التأجيل يعيد التذكير', backupNudge({ recordCount: 50, snoozedAt: now - (NUDGE_SNOOZE_DAYS + 1) * D }, now).show === true);
  t.test('7. مدخلات فارغة آمنة', backupNudge().show === false && backupNudge(null, now).show === false);
});
