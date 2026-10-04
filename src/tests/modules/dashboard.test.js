/* ==========================================================================
   dashboard.test.js — اختبارات لوحة المعلومات
   ==========================================================================
   8 اختبارات: pages/dashboard
   ========================================================================== */

import { register } from '../registry.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';
import { appointments as appointmentsRepo } from '../../data/repos/appointments.js';

register('pages/dashboard.js', async (t) => {
  /* تنظيف كل المخازن */
  await customersRepo.clear();
  await ordersRepo.clear();
  await paymentsRepo.clear();
  await appointmentsRepo.clear();

  /* 1. render فارغ — يبني الهيكل الأساسي */
  const c1 = document.createElement('div');
  await dashboardPage.render(c1);
  const stats1 = c1.querySelectorAll('.stat');
  await t.test('1. render builds 4 KPI cards',
    stats1.length === 4);

  /* 2. render فارغ — يعرض 4 بطاقات (KPIs) */
  await t.test('2. render empty state shows welcome header',
    c1.textContent.includes('🧵') &&
    c1.textContent.includes('أهلاً') ||
    c1.textContent.includes('صباح') ||
    c1.textContent.includes('مساء'));

  /* 3. render فارغ — يعرض "لا يوجد عملاء بعد" */
  await t.test('3. render empty shows no customers message',
    c1.textContent.includes('لا يوجد عملاء') ||
    c1.textContent.includes('لا توجد طلبات') ||
    c1.textContent.includes('لا توجد مواعيد'));

  /* 4. render مع بيانات — بطاقات العملاء */
  const cust = await customersRepo.create({ name: 'أحمد علي', phone: '0101', vip: true });
  await customersRepo.create({ name: 'محمد سيد', phone: '0102' });

  const c4 = document.createElement('div');
  await dashboardPage.render(c4);
  await t.test('4. render shows recent customers',
    c4.textContent.includes('أحمد علي') &&
    c4.textContent.includes('محمد سيد'));

  /* 5. render — يعرض عدد العملاء الصحيح */
  const stats5 = c4.querySelectorAll('.stat');
  const customerStat = Array.from(stats5).find((s) =>
    s.textContent.includes('عملاء') && !s.textContent.includes('VIP')
  );
  await t.test('5. KPI shows correct customer count',
    customerStat && customerStat.textContent.includes('2'));

  /* 6. render مع طلب مستحق — يعرض "مستحقة قريباً" */
  await ordersRepo.create({
    customerId: cust.id,
    status: 'pending',
    amount: 500,
    dueDate: Date.now() + 2 * 86400000,
  });
  const c6 = document.createElement('div');
  await dashboardPage.render(c6);
  await t.test('6. render shows due soon orders',
    c6.textContent.includes('مستحقة قريباً') &&
    c6.textContent.includes('قيد الانتظار'));

  /* 7. render — يعرض إيرادات الشهر من الدفعات */
  await paymentsRepo.create({
    customerId: cust.id,
    orderId: 'fake',
    amount: 750,
  });
  const c7 = document.createElement('div');
  await dashboardPage.render(c7);
  await t.test('7. KPI shows month revenue from payments',
    c7.textContent.includes('750') &&
    c7.textContent.includes('ج.م'));

  /* 8. render مع موعد اليوم — يعرض قسم المواعيد */
  await appointmentsRepo.create({
    customerId: cust.id,
    orderId: 'fake',
    date: Date.now() + 3600000,
    status: 'scheduled',
    title: 'قياس',
  });
  const c8 = document.createElement('div');
  await dashboardPage.render(c8);
  await t.test('8. render shows today appointments section',
    c8.textContent.includes('مواعيد اليوم') &&
    c8.textContent.includes('قياس'));

  /* تنظيف */
  dashboardPage.destroy();
  await customersRepo.clear();
  await ordersRepo.clear();
  await paymentsRepo.clear();
  await appointmentsRepo.clear();
});
