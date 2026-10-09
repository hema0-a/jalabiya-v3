/* ==========================================================================
   audit-3310.test.js — اختبارات انحدار لإصلاحات v3.3.10
   ========================================================================== */

import { register } from '../registry.js';
import { isPastDue, dueDayEndMs } from '../../services/order-timing.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';
import { customers } from '../../data/repos/customers.js';
import { expenses } from '../../data/repos/expenses.js';
import { getKpisData, invalidateCache as invKpis } from '../../services/kpis-calculator.js';
import { getFinancialData, invalidateCache as invFin } from '../../services/financial-calculator.js';

const DAY = 86400000;

register('audit v3.3.10 regressions', async (t) => {
  /* --- موعد التسليم: التأخير بعد نهاية اليوم (مستقل عن المنطقة الزمنية) --- */
  const d = new Date();
  const todayDue = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 3, 0, 0).getTime(); // كما يحفظه النموذج في مصر
  const tenAM = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0, 0).getTime();
  const tomorrow8 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0).getTime();
  await t.test('1. طلب موعده اليوم ليس متأخراً الساعة 10 صباحاً', isPastDue(todayDue, tenAM) === false);
  await t.test('2. نفس الطلب متأخر صباح اليوم التالي', isPastDue(todayDue, tomorrow8) === true);
  await t.test('3. بلا موعد → ليس متأخراً، ونهاية اليوم NaN',
    isPastDue(null) === false && Number.isNaN(dueDayEndMs(null)));

  /* --- بيانات الحسابات (قاعدة الاختبار فقط) --- */
  await customers.clear(); await orders.clear(); await payments.clear(); await expenses.clear();
  invKpis(); invFin();
  const now = Date.now();
  const c = await customers.create({ name: 'عميل اختبار' });
  const due = now - 5 * DAY;
  const a = await orders.create({ customerId: c.id, status: 'delivered', amount: 1000,
    items: [{ name: 'جلابية سادة', price: 1000, quantity: 1 }], notes: 'ملاحظة 1',
    createdAt: now - 10 * DAY, dueDate: due, deliveredAt: now - 6 * DAY });
  await orders.create({ customerId: c.id, status: 'cancelled', amount: 9000,
    items: [{ name: 'جلابية مطرزة', price: 9000, quantity: 1 }], notes: 'ملاحظة 2', createdAt: now - 2 * DAY });
  await orders.create({ customerId: c.id, status: 'pending', amount: 1000,
    items: [{ name: 'جلابية سادة', price: 1000, quantity: 1 }], notes: 'ملاحظة 3', createdAt: now - DAY });
  await payments.create({ orderId: a.id, customerId: c.id, amount: 1000, createdAt: now - 6 * DAY });
  await new Promise((r) => setTimeout(r, 5));
  await orders.update(a.id, { notes: 'تعديل لاحق' }); // يحرّك updatedAt بعد الموعد

  const k = await getKpisData('all');
  await t.test('4. KPIs: الملغي لا يدخل متوسط قيمة الطلب', Math.round(k.kpis.avgOrderValue) === 1000);
  await t.test('5. KPIs: إجمالي أفضل عميل بلا الملغي', k.topCustomers[0].total === 2000 && k.topCustomers[0].count === 2);
  await t.test('6. KPIs: الأنواع حسب اسم البند لا الملاحظات',
    k.topTypes.length === 1 && k.topTypes[0].name === 'جلابية سادة' && k.topTypes[0].count === 2);
  await t.test('7. KPIs: التسليم في الموعد يعتمد deliveredAt لا updatedAt', k.kpis.onTimeRate === 100);

  const f = await getFinancialData('all');
  await t.test('8. المركز المالي: متوسط الطلب بلا الملغي', Math.round(f.ordersStats.avgOrderValue) === 1000);

  /* --- سقف توقع الإيراد --- */
  await payments.clear(); invFin();
  const n = new Date();
  const mid = (back) => new Date(n.getFullYear(), n.getMonth() - back, 15).getTime();
  await payments.create({ customerId: c.id, amount: 10, createdAt: mid(5) });
  await payments.create({ customerId: c.id, amount: 100000, createdAt: mid(0) });
  const f2 = await getFinancialData('all');
  const avg = f2.forecast.avgRevenue;
  await t.test('9. التوقع لا ينفجر مع اتجاه شديد الارتفاع',
    f2.forecast.nextMonths.every((m) => m.predicted <= avg * 4.0001));

  await customers.clear(); await orders.clear(); await payments.clear(); await expenses.clear();
  invKpis(); invFin();
});
