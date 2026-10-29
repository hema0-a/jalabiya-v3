/* ==========================================================================
   audit-3339.test.js — لوحة التحكم تنفّذ لا تعرض فقط (v3.3.39)
   - أزرار سريعة + بطاقات KPI روابط + «يحتاج إجراءك» (جاهز/متأخر/مستحقات) بإجراءات فعلية.
   - روابط #/x/new تفتح النموذج مرة واحدة، والـ FAB يستخدمها.
   ========================================================================== */

import { register } from '../registry.js';
import { dashboardPage } from '../../pages/dashboard.js';
import { customers as customersRepo } from '../../data/repos/customers.js';
import { orders as ordersRepo } from '../../data/repos/orders.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';
import { consumeNew } from '../../core/deeplink.js';
import { _internal as fabInternal } from '../../ui/fab.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = 86400000;
const rowOf = (box, name) => Array.from(box.querySelectorAll('.dash-row')).find((r) => r.textContent.includes(name));
const btnOf = (row, txt) => row && Array.from(row.querySelectorAll('button,a')).find((b) => b.textContent.includes(txt));

register('audit v3.3.39 actionable dashboard', async (t) => {
  /* --- deeplink --- */
  let opened = 0;
  t.test('1. consumeNew يفتح عند new فقط', consumeNew('new', 'orders', () => { opened++; }) === true && opened === 1
    && consumeNew(null, 'orders', () => { opened++; }) === false && consumeNew('x', 'orders', () => { opened++; }) === false && opened === 1);
  const fabOk = fabInternal.ACTIONS.length === 5 && fabInternal.ACTIONS.every((a) => /^#\/[a-z]+\/new$/.test(a.hash));
  t.test('2. كل إجراءات FAB تفتح نموذج «جديد» (5 إجراءات)', fabOk);

  /* --- بيانات --- */
  const now = Date.now();
  const mk = (n, ph) => customersRepo.create({ name: n, phone: ph });
  const cReady = await mk('t3339-ready', '01000000001');
  const cLate = await mk('t3339-late', '01000000002');
  const cDebt = await mk('t3339-debt', '01000000003');
  const created = { c: [cReady.id, cLate.id, cDebt.id], o: [], p: [] };
  const oReady = await ordersRepo.create({ customerId: cReady.id, status: 'ready', amount: 500, deposit: 500, readyAt: now - 4 * D, dueDate: now - 3 * D });
  const oLate = await ordersRepo.create({ customerId: cLate.id, status: 'in_progress', amount: 700, deposit: 0, dueDate: now - 2 * D });
  const oDebt = await ordersRepo.create({ customerId: cDebt.id, status: 'delivered', amount: 1000, deposit: 200, deliveredAt: now - 9 * D, dueDate: now - 10 * D });
  created.o.push(oReady.id, oLate.id, oDebt.id);

  const box = document.createElement('div');
  document.body.appendChild(box);
  try {
    await dashboardPage.render(box);

    const quick = box.querySelectorAll('.dash-quick__btn');
    t.test('3. 4 أزرار سريعة (طلب/دفعة/عميل/موعد)', quick.length === 4);
    const links = Array.from(box.querySelectorAll('a.stat--link')).map((a) => a.getAttribute('href'));
    t.test('4. بطاقات KPI الأربع روابط لصفحاتها', links.length === 4 && links.includes('#/orders') && links.includes('#/customers') && links.includes('#/payments') && links.includes('#/appointments'));
    t.test('5. قسم «يحتاج إجراءك» موجود', !!box.querySelector('.dash-attention'));

    const rReady = rowOf(box.querySelector('.dash-attention'), 't3339-ready');
    const rLate = rowOf(box.querySelector('.dash-attention'), 't3339-late');
    const rDebt = rowOf(box.querySelector('.dash-attention'), 't3339-debt');
    t.test('6. الطلب الجاهز ظاهر بأزرار اتصال وتسليم', !!rReady && !!btnOf(rReady, '📞') && !!btnOf(rReady, 'تسليم'));
    t.test('7. الطلب المتأخر ظاهر بزر تقدّم الحالة', !!rLate && !!btnOf(rLate, 'جاهز'));
    t.test('8. المستحق ظاهر (800 ج.م) بزر دفعة وواتساب', !!rDebt && !!btnOf(rDebt, 'دفعة') && !!btnOf(rDebt, '💬') && /800/.test(rDebt.textContent.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))));

    /* تقدّم حالة طلب متأخر: in_progress → ready */
    btnOf(rLate, 'جاهز').click();
    await sleep(500);
    const lateAfter = (await ordersRepo.list()).find((o) => o.id === oLate.id);
    t.test('9. زر «جاهز» ينقل الطلب فعلاً إلى ready', lateAfter && lateAfter.status === 'ready');

    /* تسليم الجاهز المدفوع بالكامل (بلا تأكيد) */
    const rReady2 = rowOf(box.querySelector('.dash-attention'), 't3339-ready');
    btnOf(rReady2, 'تسليم').click();
    await sleep(500);
    const readyAfter = (await ordersRepo.list()).find((o) => o.id === oReady.id);
    t.test('10. زر «تسليم» يسلّم الطلب ويسجّل deliveredAt', readyAfter && readyAfter.status === 'delivered' && !!readyAfter.deliveredAt);

    /* دفعة سريعة على المستحق: المبلغ الافتراضي = المتبقي */
    const rDebt2 = rowOf(box.querySelector('.dash-attention'), 't3339-debt');
    btnOf(rDebt2, 'دفعة').click();
    await sleep(200);
    const amountIn = document.querySelector('.modal input[type=number]');
    t.test('11. نافذة الدفعة تقترح المتبقي (800)', !!amountIn && Number(amountIn.value) === 800);
    amountIn.value = '9999'; amountIn.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.modal [data-action="save"]').click();
    await sleep(300);
    const afterOver = (await paymentsRepo.list()).filter((p) => p.orderId === oDebt.id);
    t.test('12. لا تُحفظ دفعة أكبر من المتبقي', afterOver.length === 0 && !!document.querySelector('.modal'));
    amountIn.value = '800'; amountIn.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.modal [data-action="save"]').click();
    await sleep(600);
    const paid = (await paymentsRepo.list()).filter((p) => p.orderId === oDebt.id);
    paid.forEach((p) => created.p.push(p.id));
    t.test('13. الدفعة سُجّلت على الطلب والعميل', paid.length === 1 && paid[0].amount === 800 && paid[0].customerId === cDebt.id);
    t.test('14. بعد السداد يختفي المستحق من «يحتاج إجراءك»', !rowOf(box.querySelector('.dash-attention'), 't3339-debt'));
  } finally {
    document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
    for (const id of created.p) { try { await paymentsRepo.remove(id); } catch { /* */ } }
    for (const id of created.o) { try { await ordersRepo.remove(id); } catch { /* */ } }
    for (const id of created.c) { try { await customersRepo.remove(id); } catch { /* */ } }
    dashboardPage.destroy();
    box.remove();
  }
});
