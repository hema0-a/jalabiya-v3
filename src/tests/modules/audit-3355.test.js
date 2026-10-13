/* ==========================================================================
   audit-3355.test.js — عملاء الأسبوع + قائمة العميل بالضغط المطوّل (v3.3.55)
   ========================================================================== */

import { register } from '../registry.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { appointments as appointmentsRepo } from '../../data/repos/appointments.js';
import { buildWeekVisits, buildVisitText, dayLabel } from '../../services/week-visits.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { openCustomerMenu, installCustomerLongPress, LONG_PRESS_MS } from '../../ui/customer-menu.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;

register('audit v3.3.55 week visits (pure)', async (t) => {
  const now = new Date(2026, 9, 14, 12, 0, 0).getTime();
  const at = (n, h = 10) => new Date(2026, 9, 14 + n, h, 0, 0).getTime();
  const customers = [{ id: 'c1', name: 'سعد', phone: '0100' }, { id: 'c2', name: 'منى', phone: '' }, { id: 'c3', name: 'خالد' }];
  const orders = [
    { id: 'o1', customerId: 'c1', status: 'in_progress', dueDate: at(2), amount: 500, deposit: 200 },
    { id: 'o2', customerId: 'c1', status: 'ready', dueDate: at(-3), amount: 300, deposit: 0 },
    { id: 'o3', customerId: 'c2', status: 'pending', dueDate: at(9), amount: 400 },
    { id: 'o4', customerId: 'c3', status: 'delivered', dueDate: at(1), amount: 100 },
    { id: 'o5', customerId: 'c3', status: 'in_progress', dueDate: at(-2), amount: 100 },
  ];
  const appts = [
    { id: 'a1', customerId: 'c2', date: at(0, 16), title: 'قياس' },
    { id: 'a2', customerId: 'c2', date: at(1), title: 'منتهٍ', status: 'done' },
    { id: 'a3', customerId: 'c3', date: at(8), title: 'بعيد' },
    { id: 'a4', customerId: null, date: at(1), title: 'بلا عميل' },
  ];
  const v = buildWeekVisits({ orders, customers, appointments: appts, payments: [] }, now);
  const byId = (id) => v.find((r) => r.customerId === id);
  const sa = byId('c1'); const mo = byId('c2');
  t.test('1. عميلان فقط (سعد ومنى)', v.length === 2 && !!sa && !!mo);
  t.test('2. الترتيب بأقرب حضور (الجاهز المنتظَر من اليوم قبل موعد 16:00)', v[0].customerId === 'c1' && v[1].customerId === 'c2' && mo.firstTs === at(0, 16));
  t.test('3. سعد: تسليم + استلام جاهز', sa.reasons.length === 2 && sa.reasons.some((r) => r.type === 'due') && sa.reasons.some((r) => r.type === 'ready'));
  t.test('4. المتبقي = 300 + 300 (المقدم 200 يُخصم)', sa.remaining === 600);
  t.test('5. الجاهز المتأخر يُحسب «اليوم»', sa.reasons.find((r) => r.type === 'ready').ts === new Date(2026, 9, 14).getTime());
  t.test('6. المنتهي والبعيد وبلا عميل مستبعدون', !byId('c3') && mo.reasons.length === 1);
  t.test('7. طلب بعد 9 أيام لا يُحسب', !mo.orderIds.includes('o3') && !sa.orderIds.includes('o3'));
  t.test('8. تسمية الأيام', dayLabel(at(0), now) === 'اليوم' && dayLabel(at(1), now) === 'غداً' && dayLabel(at(3), now).length > 2);
  const txt = buildVisitText(sa, 'ورشة النور', now);
  t.test('9. نص التذكير فيه الاسم والمتبقي والورشة', txt.includes('سعد') && txt.includes('600') && txt.includes('ورشة النور'));
  t.test('10. مدخلات فارغة لا تنهار', buildWeekVisits({}, now).length === 0 && buildWeekVisits(undefined, now).length === 0);
});

register('audit v3.3.55 week visits + long-press menu (UI)', async (t) => {
  const cust = await customersRepo.create({ name: 't3355-cust', phone: '01055500055' });
  const now = Date.now();
  const o = await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 700, deposit: 100, dueDate: now + 2 * D });
  const box = document.createElement('div');
  document.body.appendChild(box);
  let off = null;
  try {
    await dashboardPage.render(box);
    const sec = box.querySelector('.dash-week');
    t.test('1. قسم «عملاء هذا الأسبوع» ظاهر', !!sec && sec.textContent.includes('عملاء هذا الأسبوع'));
    const row = Array.from(sec.querySelectorAll('.dash-row')).find((r) => r.textContent.includes('t3355-cust'));
    t.test('2. صف العميل فيه التسليم والمتبقي 600', !!row && row.textContent.includes('تسليم طلب') && row.textContent.includes('600'));
    t.test('3. أزرار اتصال وواتساب', !!row && !!row.querySelector('a[href^="tel:"]') && !!row.querySelector('button[aria-label="واتساب"]'));
    const main = row.querySelector('[data-customer-id]');
    t.test('4. الاسم موسوم data-customer-id', !!main && main.getAttribute('data-customer-id') === cust.id);

    /* القائمة مباشرة */
    const h = await openCustomerMenu(cust.id);
    await sleep(100);
    const m = document.querySelector('.modal');
    t.test('5. القائمة: اتصال + واتساب + ملف',
      !!m && !!m.querySelector('[data-action="cm-call"][href^="tel:0105"]') && !!m.querySelector('[data-action="cm-wa"]') && !!m.querySelector('[data-action="cm-profile"]'));
    h.close(); await sleep(100);

    /* الضغط المطوّل الفعلي */
    off = installCustomerLongPress();
    const fire = (type, x = 5, y = 5) => main.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', clientX: x, clientY: y }));
    fire('pointerdown'); await sleep(150); fire('pointerup');
    t.test('6. ضغطة قصيرة لا تفتح القائمة', !document.querySelector('.customer-menu'));
    fire('pointerdown'); await sleep(LONG_PRESS_MS + 250);
    t.test('7. الضغط المطوّل يفتح القائمة', !!document.querySelector('.customer-menu'));
    fire('pointerup');
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    await sleep(50);
    fire('pointerdown', 5, 5); fire('pointermove', 5, 60); await sleep(LONG_PRESS_MS + 250);
    t.test('8. التمرير (تحرّك) يلغي الضغط المطوّل', !document.querySelector('.customer-menu'));
    fire('pointerup');
    const again = installCustomerLongPress();
    t.test('9. التثبيت مرتين لا يكرّر المراقب', typeof again === 'function' && again === off);
  } finally {
    if (off) off();
    document.querySelectorAll('.modal-overlay, .modal').forEach((n) => n.remove());
    if (dashboardPage.destroy) dashboardPage.destroy();
    box.remove();
    try { await ordersRepo.remove(o.id); } catch { /* ignore */ }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
  }
});

/* --- التعميم على المدفوعات والمواعيد وعروض الأسعار --- */
register('audit v3.3.55 long-press marks on more pages', async (t) => {
  const { payments: paymentsRepo } = await import('../../data/repos/payments.js');
  const { quotes: quotesRepo } = await import('../../data/repos/quotes.js');
  const cust = await customersRepo.create({ name: 't3355-marks', phone: '01055500066' });
  const pay = await paymentsRepo.create({ customerId: cust.id, amount: 123, method: 'cash' });
  const appt = await appointmentsRepo.create({ customerId: cust.id, date: Date.now() + 60000, status: 'scheduled', title: 't3355-appt' });
  const quote = await quotesRepo.create({ customerId: cust.id, status: 'open', items: [{ name: 'ثوب', price: 100, quantity: 1 }], total: 100, validUntil: Date.now() + 5 * D });
  const box = document.createElement('div');
  document.body.appendChild(box);
  const has = () => !!Array.from(box.querySelectorAll('[data-customer-id]')).find((n) => n.getAttribute('data-customer-id') === cust.id && n.textContent.includes('t3355-marks'));
  try {
    const pages = [
      ['المدفوعات', (await import('../../pages/payments.js')).paymentsPage],
      ['المواعيد', (await import('../../pages/appointments.js')).appointmentsPage],
      ['عروض الأسعار', (await import('../../pages/quotes.js')).quotesPage],
    ];
    let i = 1;
    for (const [label, pg] of pages) {
      box.innerHTML = '';
      await pg.render(box);
      await sleep(200);
      t.test(i++ + '. اسم العميل موسوم في ' + label, has());
      if (pg.destroy) pg.destroy();
    }
  } finally {
    box.remove();
    for (const [repo, id] of [[paymentsRepo, pay.id], [appointmentsRepo, appt.id], [quotesRepo, quote.id], [customersRepo, cust.id]]) {
      try { await repo.remove(id); } catch { /* ignore */ }
    }
  }
});
