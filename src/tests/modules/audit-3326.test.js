/* ==========================================================================
   audit-3326.test.js — مستحقات العملاء (v3.3.26): الحساب والتصنيف والأعمار
   ========================================================================== */

import { register } from '../registry.js';
import { computeReceivables, buildReminderText } from '../../services/receivables.js';

const DAY = 86400000;
const NOW = 1_800_000_000_000;
const cust = [{ id: 'c1', name: 'أحمد', phone: '0100' }, { id: 'c2', name: 'سعيد', phone: '' }];

register('audit v3.3.26 receivables', async (t) => {
  /* المتبقي = المبلغ − (الدفعات + المقدم غير المسجّل) */
  const o1 = { id: 'o1', customerId: 'c1', amount: 1000, deposit: 200, status: 'delivered', deliveredAt: NOW - 5 * DAY };
  const p1 = [{ id: 'p1', orderId: 'o1', customerId: 'c1', amount: 300 }];
  let r = computeReceivables([o1], p1, cust, NOW);
  await t.test('1. المتبقي يحتسب المقدم والدفعات معاً (1000 − 200 − 300 = 500) والطلب المسلَّم دين متأخر',
    r.customers.length === 1 && r.customers[0].overdue === 500 && r.totals.overdue === 500 && r.totals.customersOverdue === 1);

  /* المقدم المسجّل كدفعة (isDeposit) لا يُحتسب مرتين */
  const o2 = { id: 'o2', customerId: 'c1', amount: 1000, deposit: 200, status: 'delivered', deliveredAt: NOW - DAY };
  r = computeReceivables([o2], [{ orderId: 'o2', customerId: 'c1', amount: 200, isDeposit: true }], cust, NOW);
  await t.test('2. المقدم المسجّل كدفعة لا يُخصم مرتين (المتبقي 800)', r.customers[0].overdue === 800);

  /* ملغى + مسدّد بالكامل لا يظهران */
  r = computeReceivables([
    { id: 'x1', customerId: 'c1', amount: 500, status: 'cancelled' },
    { id: 'x2', customerId: 'c1', amount: 500, status: 'delivered', deliveredAt: NOW },
  ], [{ orderId: 'x2', customerId: 'c1', amount: 500 }], cust, NOW);
  await t.test('3. الطلب الملغى والمسدَّد بالكامل لا يظهران', r.customers.length === 0 && r.totals.overdue === 0);

  /* غير المسلَّم: رصيد عند التسليم لا دين */
  r = computeReceivables([{ id: 'ip', customerId: 'c2', amount: 700, deposit: 100, status: 'in_progress' }], [], cust, NOW);
  await t.test('4. طلب لم يُسلَّم: «عند التسليم» لا «متأخر» ولا عمر له',
    r.customers[0].pending === 600 && r.customers[0].overdue === 0 && r.totals.customersOverdue === 0 &&
    r.customers[0].orders[0].ageDays === null);

  /* شرائح العمر */
  const mk = (id, days) => ({ id, customerId: 'c1', amount: 100, status: 'delivered', deliveredAt: NOW - days * DAY });
  r = computeReceivables([mk('a', 3), mk('b', 20), mk('c', 45), mk('d', 100)], [], cust, NOW);
  const byId = Object.fromEntries(r.buckets.map((b) => [b.id, b.count]));
  await t.test('5. توزيع الأعمار: 3 أيام، 20، 45، 100 → كل واحد في شريحته',
    byId.d0_7 === 1 && byId.d8_30 === 1 && byId.d31_60 === 1 && byId.d60p === 1 && r.customers[0].oldestDays === 100);

  /* دفعات غير مربوطة تُعرض ولا تُخصم */
  r = computeReceivables([mk('u', 10)], [{ id: 'g', customerId: 'c1', amount: 40 }], cust, NOW);
  await t.test('6. دفعة غير مربوطة بطلب تُعرض كرصيد ولا تُخصم تلقائياً',
    r.customers[0].overdue === 100 && r.customers[0].unlinkedCredit === 40);

  /* الترتيب + عميل مجهول */
  r = computeReceivables([
    { id: 's', customerId: 'c1', amount: 100, status: 'delivered', deliveredAt: NOW },
    { id: 'b', customerId: 'zz', amount: 900, status: 'delivered', deliveredAt: NOW },
  ], [], cust, NOW);
  await t.test('7. الترتيب بالأكبر ديناً أولاً، والعميل المحذوف يُسمّى «عميل غير معروف»',
    r.customers[0].customerId === 'zz' && r.customers[0].name === 'عميل غير معروف' && r.customers[1].name === 'أحمد');

  /* robustness */
  r = computeReceivables(null, undefined, null, NOW);
  await t.test('8. مدخلات فارغة/تالفة لا تُسقط الحساب', r.customers.length === 0 && r.totals.overdue === 0);

  await t.test('9. نص التذكير يحوي الاسم والمبلغ والورشة',
    /أحمد/.test(buildReminderText('أحمد', '500', 'ورشة النور')) && /500/.test(buildReminderText('أحمد', '500', 'ورشة النور')) &&
    /ورشة النور/.test(buildReminderText('أحمد', '500', 'ورشة النور')));
});
