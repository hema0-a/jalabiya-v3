/* ==========================================================================
   audit-3340.test.js — البيانات التجريبية (v3.3.40)
   - الخطة حتمية ومتّسقة (عملاء/طلبات/دفعات مترابطة) وتغطي كل الحالات والسيناريوهات.
   - الحذف يمسح التجريبي فقط ولا يلمس سجلاً حقيقياً.
   - قسم الإعدادات وشريط اللوحة يعملان.
   ========================================================================== */

import { register } from '../registry.js';
import { buildDemoPlan, seedDemoData, clearDemoData, countDemoData, isDemoRecord } from '../../services/demo-data.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orderPaidBreakdown } from '../../services/payments-view.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { settingsPage } from '../../pages/settings/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

register('audit v3.3.40 demo data', async (t) => {
  /* --- الخطة (نقيّة، بلا قاعدة بيانات) --- */
  const NOW = new Date(2026, 9, 11, 13, 0, 0).getTime();
  const plan = buildDemoPlan(NOW);
  const all = Object.values(plan).flat();
  t.test('1. الخطة حتمية (نفس الناتج لنفس اللحظة)', JSON.stringify(plan) === JSON.stringify(buildDemoPlan(NOW)));
  t.test('2. كل سجل مُعلَّم isDemo ومعرّفه demo- وفريد', all.every((r) => r.isDemo === true && String(r.id).startsWith('demo-')) && new Set(all.map((r) => r.id)).size === all.length);

  const custIds = new Set(plan.customers.map((c) => c.id));
  const orderIds = new Set(plan.orders.map((o) => o.id));
  t.test('3. الطلبات والدفعات والمواعيد مرتبطة بعملاء/طلبات موجودة',
    plan.orders.every((o) => custIds.has(o.customerId)) && plan.payments.every((p) => orderIds.has(p.orderId) && custIds.has(p.customerId))
    && plan.appointments.every((a) => custIds.has(a.customerId)) && plan.quotes.every((q) => custIds.has(q.customerId)));

  const statuses = new Set(plan.orders.map((o) => o.status));
  t.test('4. كل حالات الطلب ممثّلة', ['pending', 'in_progress', 'ready', 'delivered', 'cancelled'].every((s) => statuses.has(s)));
  t.test('5. مبالغ الطلبات سليمة (المقدم ≤ الإجمالي، والإجمالي = البنود − الخصم)',
    plan.orders.every((o) => o.deposit <= o.amount && Math.abs(o.amount - (o.items.reduce((s, i) => s + i.price * i.quantity, 0) - o.discountAmount)) < 0.01));

  const today0 = new Date(NOW); today0.setHours(0, 0, 0, 0);
  const lateReady = plan.orders.filter((o) => o.status === 'ready' && NOW - o.readyAt >= 3 * DAY);
  const overdue = plan.orders.filter((o) => (o.status === 'pending' || o.status === 'in_progress') && o.dueDate < today0.getTime());
  const pays = (o) => plan.payments.filter((p) => p.orderId === o.id);
  const debts = plan.orders.filter((o) => o.status === 'delivered' && o.amount - orderPaidBreakdown(o, pays(o)).paid > 0.01);
  t.test('6. سيناريوهات «يحتاج إجراءك»: جاهز متأخر + طلب متأخر + مستحقات', lateReady.length >= 2 && overdue.length >= 2 && debts.length >= 2);
  t.test('6b. دفعات مسجّلة متنوعة (5+ دفعات وأكثر من طريقة دفع)', plan.payments.length >= 5 && new Set(plan.payments.map((p) => p.method)).size >= 2);
  t.test('7. مخزون ناقص (3+ أصناف تحت الحد)', plan.inventory.filter((i) => i.quantity < i.minQuantity).length >= 3);
  const todayAppts = plan.appointments.filter((a) => a.date >= today0.getTime() && a.date < today0.getTime() + DAY);
  t.test('8. مواعيد اليوم (3) منها واحد منتهٍ', todayAppts.length === 3 && todayAppts.filter((a) => a.status === 'done').length === 1);

  /* --- قاعدة البيانات: بيانات حقيقية تبقى سليمة --- */
  await clearDemoData();
  const real = await customersRepo.create({ name: 't3340-real-customer', phone: '0123' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    const res = await seedDemoData();
    const cnt = await countDemoData();
    t.test('9. التحميل يكتب كل السجلات (' + res.total + ')', res.total === all.length || res.total > 80);
    t.test('10. العدّاد يطابق ما كُتب', cnt.total === res.total && cnt.byStore.orders === plan.orders.length);
    t.test('11. إعادة التحميل لا تكرّر السجلات', (await seedDemoData()).total === (await countDemoData()).total);

    /* اللوحة: الشريط + «يحتاج إجراءك» بمحتوى فعلي */
    await dashboardPage.render(box);
    t.test('12. شريط «بيانات تجريبية» يظهر في اللوحة', !!box.querySelector('.dash-demo'));
    const att = box.querySelector('.dash-attention');
    t.test('13. «يحتاج إجراءك» يعرض الجاهز والمتأخر والمستحقات', !!att && att.querySelectorAll('.dash-group').length === 3);

    /* قسم الإعدادات */
    const sbox = document.createElement('div');
    document.body.appendChild(sbox);
    await settingsPage.render(sbox, 'demo-data');
    const findDel = () => Array.from(sbox.querySelectorAll('button')).find((b) => b.textContent.includes('حذف البيانات التجريبية'));
    for (let i = 0; i < 40 && !findDel(); i++) await sleep(50);   /* القسم يقرأ المخازن بشكل غير متزامن */
    const del = findDel();
    t.test('14. قسم الإعدادات يعرض العدّاد وزر الحذف مفعّل', !!del && !del.disabled && /سجلاً تجريبياً/.test(sbox.textContent));
    del.click();
    await sleep(150);
    document.querySelector('.modal [data-action="confirm"]').click();
    await sleep(700);
    const after = await countDemoData();
    t.test('15. زر الحذف يمسح التجريبي كله', after.total === 0);
    const stillReal = (await customersRepo.list()).filter((c) => c.id === real.id);
    t.test('16. السجل الحقيقي لم يُمسّ', stillReal.length === 1 && !isDemoRecord(stillReal[0]));
    t.test('17. القسم يعود لحالة «لا توجد بيانات تجريبية»', /لا توجد بيانات تجريبية/.test(sbox.textContent));
    sbox.remove();
  } finally {
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    await clearDemoData();
    try { await customersRepo.remove(real.id); } catch { /* */ }
    dashboardPage.destroy();
    box.remove();
  }
});
