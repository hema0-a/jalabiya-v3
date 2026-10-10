/* ==========================================================================
   audit-3327.test.js — ربط الدفعات غير المربوطة بطلب (v3.3.27)
   ========================================================================== */

import { register } from '../registry.js';
import { computeReceivables } from '../../services/receivables.js';

const DAY = 86400000;
const NOW = 1_800_000_000_000;
const cust = [{ id: 'c1', name: 'أحمد', phone: '0100' }];

register('audit v3.3.27 link payments', async (t) => {
  const o1 = { id: 'o1', customerId: 'c1', amount: 1000, status: 'delivered', deliveredAt: NOW - 10 * DAY };
  const loose = { id: 'p9', customerId: 'c1', amount: 400, date: NOW - 2 * DAY };

  let r = computeReceivables([o1], [loose], cust, NOW);
  const row = r.customers[0];
  await t.test('1. الدفعة غير المربوطة تظهر في unlinkedPayments بمعرّفها ومبلغها دون خصمها',
    row.unlinkedPayments.length === 1 && row.unlinkedPayments[0].id === 'p9'
    && row.unlinkedPayments[0].amount === 400 && row.overdue === 1000);

  /* بعد الربط (orderId) يُخصم المبلغ وتختفي من القائمة */
  r = computeReceivables([o1], [{ ...loose, orderId: 'o1' }], cust, NOW);
  await t.test('2. بعد ربطها بالطلب: المتأخر 600 ولا دفعات غير مربوطة',
    r.customers[0].overdue === 600 && r.customers[0].unlinkedPayments.length === 0
    && r.customers[0].unlinkedCredit === 0);

  /* دفعة صفرية أو بلا معرّف لا تُعرض للربط */
  r = computeReceivables([o1], [
    { id: 'z', customerId: 'c1', amount: 0 },
    { customerId: 'c1', amount: 50 },
  ], cust, NOW);
  await t.test('3. دفعة صفرية أو بلا معرّف لا تُعرض للربط',
    r.customers[0].unlinkedPayments.length === 0);

  /* عميل بلا دفعات */
  r = computeReceivables([o1], [], cust, NOW);
  await t.test('4. عميل بلا دفعات: القائمة فارغة ولا أخطاء',
    Array.isArray(r.customers[0].unlinkedPayments) && r.customers[0].unlinkedPayments.length === 0);
});
