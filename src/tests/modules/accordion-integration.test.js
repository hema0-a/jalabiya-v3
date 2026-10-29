/* ==========================================================================
   accordion-integration.test.js — الأكورديون داخل اللوحة والمعاينات (v3.3.63)
   ========================================================================== */
import { register } from '../registry.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { createSalesBarChart, createFinanceChart, createOrdersDonutChart } from '../../ui/dashboard-charts.js';
import { previewOrder, previewCustomer } from '../../ui/quick-preview.js';
import { modal } from '../../ui/modal.js';
import { _internal } from '../../ui/collapsible.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { appointments as appointmentsRepo } from '../../data/repos/appointments.js';
import { startOfNextDay } from '../../core/day-math.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;
const acc = (root, id) => root.querySelector('[data-collapsible-id="' + id + '"]');
const isOpen = (n) => !!n && n.classList.contains('collapsible--open');
const header = (n) => n.querySelector(':scope > .collapsible__header');
const summaryOf = (n) => n.querySelector('.collapsible__summary').textContent;
const badgeOf = (n) => { const b = n.querySelector('.collapsible__badge'); return b.hidden ? '' : b.textContent; };

register('accordion integration: dashboard (v3.3.63)', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);
  localStorage.removeItem('jalabiya_v3_dash_layout');   /* تخصيص اللوحة (v3.5.1) لا يؤثر على فحص الترتيب الافتراضي */
  const cust = await customersRepo.create({ name: 't3363-dash', phone: '01063630001' });
  const o = await ordersRepo.create({ customerId: cust.id, status: 'in_progress', amount: 700, deposit: 100, dueDate: Date.now() + 2 * D });
  const ap = await appointmentsRepo.create({ customerId: cust.id, date: Math.min(Date.now() + 3600000, startOfNextDay(Date.now()) - 60000) /* دائماً ضمن اليوم الحالي (كان now+1h فيفشل بعد الساعة 23:00) */, status: 'scheduled', title: 't3363-appt' });
  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await dashboardPage.render(box);

    const ids = Array.from(box.querySelectorAll('.dash-section')).map((n) => n.dataset.collapsibleId);
    await t.test('1. سبعة أقسام قابلة للطي بالترتيب',
      ids.join() === 'dash-appts,dash-week,dash-due,dash-sales,dash-finance,dash-orders,dash-recent');

    const attn = box.querySelector('.dash-attention');
    await t.test('2. «يحتاج إجراءك» بطاقة ظاهرة دائماً (ليست أكورديون)',
      !!attn && !attn.classList.contains('collapsible') && !attn.closest('.dash-sections'));

    const ap1 = acc(box, 'dash-appts');
    await t.test('3. المواعيد: مفتوح (فيه عناصر) + شارة + ملخص + العنصر موجود',
      isOpen(ap1) && Number(badgeOf(ap1)) >= 1 && summaryOf(ap1).length > 0 && ap1.textContent.includes('t3363-appt'));

    const due = acc(box, 'dash-due');
    await t.test('4. المستحقة قريباً: مفتوحة وشارتها تعدّ طلبنا', isOpen(due) && Number(badgeOf(due)) >= 1);

    await t.test('5. الرسوم البيانية مطويّة افتراضياً وملخصاتها صحيحة',
      !isOpen(acc(box, 'dash-sales')) && !isOpen(acc(box, 'dash-finance')) && !isOpen(acc(box, 'dash-orders')) &&
      summaryOf(acc(box, 'dash-sales')).includes('الإجمالي') &&
      summaryOf(acc(box, 'dash-finance')).includes('الربح') &&
      summaryOf(acc(box, 'dash-orders')).includes('طلب'));

    const salesNode = acc(box, 'dash-sales');
    await t.test('6. الرسم داخل القسم بلا بطاقة ولا عنوان مكرر وفيه SVG',
      !salesNode.querySelector('.card') && !!salesNode.querySelector('svg') && !!salesNode.querySelector('.dash-chart'));

    /* فتح/طيّ الكل */
    const toggle = box.querySelector('.dash-sections__toggle');
    await t.test('7. التسمية الأولية «فتح الكل» (بعض الأقسام مطويّة)', toggle.textContent === 'فتح الكل');
    toggle.click();
    const allOpen = Array.from(box.querySelectorAll('.dash-section')).every(isOpen);
    const label1 = toggle.textContent;
    toggle.click();
    const noneOpen = Array.from(box.querySelectorAll('.dash-section')).every((n) => !isOpen(n));
    await t.test('8. فتح الكل ثم طيّ الكل والتسمية تتبدّل',
      allOpen && label1 === 'طيّ الكل' && noneOpen && toggle.textContent === 'فتح الكل');

    /* الحفظ عبر إعادة العرض */
    header(acc(box, 'dash-appts')).click();            // يفتح (كان مطوياً بعد «طيّ الكل»)
    header(acc(box, 'dash-week')).click();
    header(acc(box, 'dash-week')).click();            // يطويه ثانية
    await dashboardPage.render(box);
    await t.test('9. الحالة تُحفظ بعد إعادة بناء اللوحة',
      isOpen(acc(box, 'dash-appts')) && !isOpen(acc(box, 'dash-week')));

    /* المحتوى المطويّ يبقى في DOM لكنه غير قابل للوصول */
    const weekBody = acc(box, 'dash-week').querySelector('.collapsible__content');
    await t.test('10. المطويّ: المحتوى في DOM لكنه inert', weekBody.inert === true && weekBody.querySelectorAll('.dash-row').length >= 1);

    /* توافق رجعي للرسوم */
    const legacy = createSalesBarChart([{ label: 'س', value: 5 }]);
    const bare = createSalesBarChart([{ label: 'س', value: 5 }], { bare: true });
    await t.test('11. الرسم بلا خيارات يبقى بطاقة بعنوان (توافق رجعي)',
      legacy.classList.contains('card') && legacy.textContent.includes('مبيعات آخر 7 أيام'));
    await t.test('12. خيار bare: بلا بطاقة/عنوان وبنفس الـ SVG',
      !bare.classList.contains('card') && !bare.textContent.includes('مبيعات آخر 7 أيام') && !!bare.querySelector('svg') &&
      !createFinanceChart({ revenue: 1, expenses: 0, profit: 1 }, { bare: true }).classList.contains('card') &&
      !createOrdersDonutChart({ pending: 1 }, { bare: true }).classList.contains('card'));
  } finally {
    dashboardPage.destroy();
    box.remove();
    try { await appointmentsRepo.remove(ap.id); } catch { /* ignore */ }
    try { await ordersRepo.remove(o.id); } catch { /* ignore */ }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
    localStorage.removeItem(_internal.STATE_KEY);
  }
});

register('accordion integration: order/customer preview (v3.3.63)', async (t) => {
  localStorage.removeItem(_internal.STATE_KEY);
  modal.closeAll();
  const cust = await customersRepo.create({ name: 't3363-cust', phone: '01063630002' });
  const base = Date.now();
  const o1 = await ordersRepo.create({
    customerId: cust.id, status: 'in_progress', amount: 700, deposit: 100, dueDate: base + 3 * D,
    items: [{ name: 'جلابية', price: 350, quantity: 2 }, { name: 'سروال', price: 100, quantity: 1 }], subtotal: 800, discountAmount: 100, notes: 't3363-note',
    measurementsSnapshot: { at: base, fields: [{ name: 'الطول', value: 140, unit: 'cm' }, { name: 'الكتف', value: 48, unit: 'cm' }] },
  });
  const o2 = await ordersRepo.create({ customerId: cust.id, status: 'pending', amount: 300, deposit: 0 });
  const o3 = await ordersRepo.create({ customerId: cust.id, status: 'delivered', amount: 200, deposit: 200 });
  const dlg = () => document.querySelector('.modal');
  const btn = (txt) => Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent.includes(txt));
  try {
    await previewOrder(o1.id, cust);
    await sleep(60);
    const m = dlg();

    const amountsHead = Array.from(m.querySelectorAll('div')).find((d) => d.children.length === 0 && d.textContent === '💰 المبالغ');
    await t.test('1. «المبالغ» ظاهرة دائماً (خارج أي قسم مطويّ) وفيها المتبقي',
      !!amountsHead && !amountsHead.closest('.collapsible') && m.textContent.includes('المتبقي'));

    const items = acc(m, 'qp-order-items');
    const calc = acc(m, 'qp-order-calc');
    const meas = acc(m, 'qp-order-measures');
    const notes = acc(m, 'qp-order-notes');
    await t.test('2. البنود مفتوحة وشارتها 2 (بندان)', isOpen(items) && badgeOf(items) === '2' && items.textContent.includes('جلابية'));
    await t.test('3. تفاصيل الحساب مطويّة وملخصها يذكر الخصم', !!calc && !isOpen(calc) && summaryOf(calc).includes('خصم'));
    await t.test('4. المقاسات مطويّة وملخصها «2 مقاس»', !!meas && !isOpen(meas) && summaryOf(meas).includes('2 مقاس'));
    await t.test('5. الملاحظات مفتوحة وتعرض النص', isOpen(notes) && notes.textContent.includes('t3363-note'));
    await t.test('6. أقسام المعاينة بنمط flat', [items, calc, meas, notes].every((n) => n.classList.contains('collapsible--flat')));
    await t.test('7. لا قسم تسليم/رسوم لطلب بلا تسليمات', acc(m, 'qp-order-delivery') === null);

    /* التفضيل يُحفظ ويسري على المعاينة التالية */
    header(meas).click();
    modal.closeAll();
    await previewOrder(o1.id, cust);
    await sleep(60);
    await t.test('8. فتح «المقاسات» يُحفظ للمعاينات التالية', isOpen(acc(dlg(), 'qp-order-measures')));
    modal.closeAll();

    /* طلب بسيط: لا أقسام فارغة */
    await previewOrder(o2.id, cust);
    await sleep(60);
    const m2 = dlg();
    await t.test('9. طلب بسيط: بند واحد بلا شارة، بلا ملاحظات/حساب/تسليم، والمقاسات «لا توجد نسخة»',
      isOpen(acc(m2, 'qp-order-items')) && badgeOf(acc(m2, 'qp-order-items')) === '' &&
      acc(m2, 'qp-order-notes') === null && acc(m2, 'qp-order-calc') === null && acc(m2, 'qp-order-delivery') === null &&
      summaryOf(acc(m2, 'qp-order-measures')).includes('لا توجد'));
    modal.closeAll();

    /* التفاصيل الكاملة للعميل */
    await previewCustomer(cust.id);
    await sleep(60);
    btn('التفاصيل الكاملة').click();
    await sleep(200);
    const full = dlg();
    const cos = Array.from(full.querySelectorAll('[data-collapsible-id^="qp-corder-"]'));
    await t.test('10. كل طلب قسم قابل للطي (3) مع ملخص', cos.length === 3 && cos.every((n) => summaryOf(n).includes('الإجمالي')));
    await t.test('11. أحدث طلب فقط مفتوح', cos.filter(isOpen).length === 1 && isOpen(cos[0]));
    header(cos[2]).click();
    await t.test('12. وضع حصري: فتح طلب يغلق الآخر',
      cos.filter(isOpen).length === 1 && isOpen(cos[2]) && !isOpen(cos[0]));
    await t.test('13. معرّفات الطلبات لا تُخزَّن (persist:false)',
      !Object.keys(_internal.readState()).some((k) => k.startsWith('qp-corder-')));
    await t.test('14. المقاسات قسم مفتوح بملخص', isOpen(acc(full, 'qp-cust-measures')) && summaryOf(acc(full, 'qp-cust-measures')).length > 0);
  } finally {
    modal.closeAll();
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    for (const x of [o1, o2, o3]) { try { await ordersRepo.remove(x.id); } catch { /* ignore */ } }
    try { await customersRepo.remove(cust.id); } catch { /* ignore */ }
    localStorage.removeItem(_internal.STATE_KEY);
  }
});
