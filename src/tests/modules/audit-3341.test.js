/* ==========================================================================
   audit-3341.test.js — «تراجع» بعد الإجراءات السريعة (v3.3.41)
   - toast.undo: زر إجراء يغلق الإشعار وينفّذ، والفشل يظهر للمستخدم.
   - orders.update يحترم readyAt الصريح (التراجع عن «تسليم» لا يعيد ضبط عمر الجاهزية).
   - لوحة التحكم: تقدّم الحالة / دفعة سريعة / «تم» للموعد — كلها قابلة للتراجع فعلياً.
   ========================================================================== */

import { register } from '../registry.js';
import { toast } from '../../ui/toast.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';
import { appointments as appointmentsRepo } from '../../data/repos/appointments.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;
const undoBtn = () => document.querySelector('#toast-container .toast__action');
const rowOf = (box, name) => Array.from(box.querySelectorAll('.dash-row')).find((r) => r.textContent.includes(name));
const btnOf = (row, txt) => row && Array.from(row.querySelectorAll('button,a')).find((b) => b.textContent.includes(txt));

register('audit v3.3.41 undo quick actions', async (t) => {
  /* --- toast.undo --- */
  toast.clear();
  let undone = 0;
  const h = toast.undo('تم', () => { undone++; });
  const b = undoBtn();
  t.test('1. toast.undo يعرض زر «تراجع»', !!b && b.textContent.trim() === 'تراجع');
  b.click();
  await sleep(30);
  t.test('2. الضغط ينفّذ التراجع مرة واحدة ويغلق الإشعار', undone === 1 && h.node.style.opacity === '0');
  toast.clear();
  toast.undo('تم', () => { throw new Error('boom'); });
  undoBtn().click();
  await sleep(30);
  t.test('3. فشل التراجع يظهر كإشعار خطأ', !!document.querySelector('#toast-container .toast--danger'));
  toast.clear();

  /* --- بيانات --- */
  const now = Date.now();
  const cust = await customersRepo.create({ name: 't3341-cust', phone: '01000000009' });
  const created = { o: [], p: [], a: [] };
  const readyAt = now - 5 * D;
  const oReady = await ordersRepo.create({ customerId: cust.id, status: 'ready', amount: 600, deposit: 600, readyAt, dueDate: now - 4 * D });
  const oLate = await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 400, deposit: 0, dueDate: now - 2 * D });
  const oDebt = await ordersRepo.create({ customerId: cust.id, status: 'delivered', amount: 1000, deposit: 200, deliveredAt: now - 8 * D, dueDate: now - 9 * D });
  created.o.push(oReady.id, oLate.id, oDebt.id);

  /* --- مستودع الطلبات: readyAt الصريح --- */
  await ordersRepo.update(oReady.id, { status: 'delivered', deliveredAt: now });
  await ordersRepo.update(oReady.id, { status: 'ready', deliveredAt: null, readyAt });
  const back = await ordersRepo.find(oReady.id);
  t.test('4. readyAt الصريح يُحفظ ولا يُعاد ضبطه', back.readyAt === readyAt && back.status === 'ready');
  await ordersRepo.update(oReady.id, { status: 'in_progress' });
  await ordersRepo.update(oReady.id, { status: 'ready' });
  t.test('5. الدخول لـ«جاهز» بلا readyAt صريح يسجّل وقتاً جديداً (السلوك القديم)', (await ordersRepo.find(oReady.id)).readyAt > readyAt);
  await ordersRepo.update(oReady.id, { readyAt });

  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await dashboardPage.render(box);
    const att = () => box.querySelector('.dash-attention');

    /* تسليم ثم تراجع */
    toast.clear();
    btnOf(rowOf(att(), 't3341-cust'), 'تسليم').click();
    await sleep(500);
    let o1 = await ordersRepo.find(oReady.id);
    t.test('6. التسليم تم (delivered + deliveredAt)', o1.status === 'delivered' && !!o1.deliveredAt);
    t.test('7. ظهر إشعار بزر «تراجع»', !!undoBtn());
    undoBtn().click();
    await sleep(600);
    o1 = await ordersRepo.find(oReady.id);
    t.test('8. التراجع أعاد الطلب «جاهز» بنفس عمره وبلا deliveredAt', o1.status === 'ready' && o1.readyAt === readyAt && !o1.deliveredAt);

    /* دفعة ثم تراجع */
    toast.clear();
    const debtRow = Array.from(att().querySelectorAll('.dash-row')).find((r) => r.textContent.includes('عليه'));
    btnOf(debtRow, 'دفعة').click();
    await sleep(200);
    document.querySelector('.modal [data-action="save"]').click();
    await sleep(600);
    let pays = (await paymentsRepo.list()).filter((p) => p.orderId === oDebt.id);
    pays.forEach((p) => created.p.push(p.id));
    t.test('9. الدفعة سُجّلت (800)', pays.length === 1 && pays[0].amount === 800);
    undoBtn().click();
    await sleep(600);
    pays = (await paymentsRepo.list()).filter((p) => p.orderId === oDebt.id);
    t.test('10. التراجع حذف الدفعة', pays.length === 0);

    /* موعد «تم» ثم تراجع */
    const appt = await appointmentsRepo.create({ customerId: cust.id, title: 't3341-appt', date: new Date().setHours(23, 0, 0, 0), status: 'scheduled' });
    created.a.push(appt.id);
    await dashboardPage.render(box);
    toast.clear();
    btnOf(rowOf(box, 't3341-appt'), 'تم').click();
    await sleep(500);
    t.test('11. الموعد صار done', (await appointmentsRepo.find(appt.id)).status === 'done');
    undoBtn().click();
    await sleep(500);
    t.test('12. التراجع أعاده scheduled', (await appointmentsRepo.find(appt.id)).status === 'scheduled');
  } finally {
    toast.clear();
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    for (const id of created.p) { try { await paymentsRepo.remove(id); } catch { /* */ } }
    for (const id of created.a) { try { await appointmentsRepo.remove(id); } catch { /* */ } }
    for (const id of created.o) { try { await ordersRepo.remove(id); } catch { /* */ } }
    try { await customersRepo.remove(cust.id); } catch { /* */ }
    dashboardPage.destroy();
    box.remove();
  }
});
