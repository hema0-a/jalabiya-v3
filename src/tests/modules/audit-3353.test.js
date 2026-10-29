/* ==========================================================================
   audit-3353.test.js — شاشة الورشة (v3.3.53)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { buildWallModel } from '../../services/wall-board.js';
import { wallPage } from '../../pages/wall.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;

register('audit v3.3.53 wall board', async (t) => {
  const now = new Date(2026, 9, 14, 12, 0, 0).getTime();
  const at = (n) => new Date(2026, 9, 14 + n, 9, 0, 0).getTime();
  const customers = [{ id: 'c1', name: 'سعد' }, { id: 'c2', name: 'منى' }];
  const orders = [
    { id: 'o-late-2', customerId: 'c1', status: 'in_progress', dueDate: at(-2), items: [{ name: 'ثوب' }] },
    { id: 'o-late-5', customerId: 'c2', status: 'pending', dueDate: at(-5), items: [{ name: 'جلابية' }, { name: 'عباية' }] },
    { id: 'o-today', customerId: 'c1', status: 'in_progress', dueDate: at(0) },
    { id: 'o-tmrw', customerId: 'c1', status: 'pending', dueDate: at(1) },
    { id: 'o-ready', customerId: 'c2', status: 'ready', dueDate: at(-1), amount: 500, deposit: 200, readyAt: now - 4 * D },
    { id: 'o-done', customerId: 'c2', status: 'delivered', dueDate: at(-3) },
    { id: 'o-canc', customerId: 'c2', status: 'cancelled', dueDate: at(-3) },
  ];
  const appts = [{ id: 'a2', date: at(0) + 4 * 3600000, title: 'قياس', customerId: 'c2' }, { id: 'a1', date: at(0) - 3600000, title: 'استلام', status: 'done' }, { id: 'a3', date: at(1), title: 'غداً' }];
  const m = buildWallModel({ orders, customers, appointments: appts, payments: [] }, now);
  t.test('1. المتأخرة: النشطة فقط، الأشد تأخراً أولاً', m.late.length === 2 && m.late[0].orderId === 'o-late-5' && m.late[0].daysLate === 5);
  t.test('2. المسلَّم والملغي لا يظهران', !m.late.some((r) => r.orderId === 'o-done' || r.orderId === 'o-canc'));
  t.test('3. تُسلَّم اليوم: طلب واحد', m.dueToday.length === 1 && m.dueToday[0].orderId === 'o-today');
  t.test('4. طلب الغد لا يُحسب', ![...m.late, ...m.dueToday].some((r) => r.orderId === 'o-tmrw'));
  t.test('5. الجاهز: العمر والمتبقي', m.ready.length === 1 && m.ready[0].ageDays === 4 && m.ready[0].remaining === 300);
  t.test('6. مواعيد اليوم فقط ومرتبة بالوقت', m.appointments.length === 2 && m.appointments[0].id === 'a1' && m.appointments[0].done === true);
  t.test('7. تسمية البنود المتعددة', m.late[0].label === 'جلابية +1' && m.late[1].label === 'ثوب');
  t.test('8. العدّادات', m.counts.late === 2 && m.counts.dueToday === 1 && m.counts.ready === 1 && m.counts.appointments === 2 && m.counts.inProgress === 2 && m.counts.pending === 2);
  const empty = buildWallModel({}, now);
  t.test('9. بيانات فارغة لا تنهار', empty.counts.late === 0 && empty.ready.length === 0);

  /* الصفحة */
  const box = document.createElement('div');
  document.body.appendChild(box);
  const cust = await customersRepo.create({ name: 't3343-wall', phone: '0100344' });
  const od = await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 300, dueDate: Date.now() - 2 * D, items: [{ name: 'ثوب الاختبار', price: 300, quantity: 1 }] });
  try {
    await wallPage.render(box);
    await sleep(300);
    const wall = document.querySelector('.wall');
    t.test('10. الطبقة تملأ الشاشة', !!wall && wall.getBoundingClientRect().width === window.innerWidth && getComputedStyle(wall).position === 'fixed');
    t.test('11. أربعة أعمدة', document.querySelectorAll('.wall__col').length === 4);
    t.test('12. الطلب المتأخر ظاهر', !!document.querySelector('.wall__col--late') && document.querySelector('.wall__col--late').textContent.includes('t3343-wall'));
    t.test('13. الساعة معبّأة وزرّا الخروج وملء الشاشة موجودان',
      document.querySelector('.wall__clock').textContent.length > 0 && !!document.querySelector('[data-action="wall-exit"]') && !!document.querySelector('[data-action="wall-fullscreen"]'));
    wallPage.destroy();
    t.test('14. destroy يزيل الطبقة ويعيد التمرير', !document.querySelector('.wall') && !document.body.classList.contains('wall-open'));
  } finally {
    wallPage.destroy();
    box.remove();
    try { await ordersRepo.remove(od.id); } catch { /* ignore */ }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
  }
});
