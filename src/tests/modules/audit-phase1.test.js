/* ==========================================================================
   audit-phase1.test.js — الفحص العميق، المرحلة 1: العمليات الأساسية (v3.3.75)
   ==========================================================================
   كل اختبار هنا يثبّت خطأً منطقياً حقيقياً وُجد بالتجربة قبل إصلاحه:
   1. المخزون: ضغطات +1 المتزامنة تُضيّع تحديثات (قراءة خارج القفل).
   2. المحفظة: نفس النمط في walletAdjust (رصيد/نقاط).
   3. المقدّم المعلَّم isDeposit يُصفّر المقدم كله فيضيع ما زاد عليه.
   4. تعديل عميل يمسح مقاسات الحقول المعطَّلة من الإعدادات.
   5. دفعة تتجاوز إجمالي الطلب تُحفظ بلا تنبيه.
   6. تخفيض إجمالي طلب دون المدفوع يمرّ بلا تنبيه.
   7. حذف دفعة «من الرصيد» لا يُعيد الرصيد (وتضاعفه عند الاسترجاع بعد الإصلاح).
   ========================================================================== */

import { register } from '../registry.js';
import { inventory } from '../../data/repos/inventory.js';
import { customers } from '../../data/repos/customers.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';
import { settings } from '../../data/repos/settings.js';
import { appointments } from '../../data/repos/appointments.js';
import { trash } from '../../data/repos/trash.js';
import { createRepository } from '../../data/repository.js';
import { STORES } from '../../core/config.js';
import { unrecordedDeposit, orderPaidBreakdown, overpaidBy } from '../../services/payments-view.js';
import { computeTotals } from '../../pages/orders.js';
import { customersPage } from '../../pages/customers.js';
import { paymentsPage } from '../../pages/payments.js';
import { ordersPage } from '../../pages/orders.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (root, txt) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.includes(txt));
const topModal = () => { const m = document.querySelectorAll('.modal'); return m[m.length - 1] || null; };
const closeModals = () => document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());

/* ==========================================================================
   الطبقة المشتركة
   ========================================================================== */
register('phase1: ذرّية القراءة-ثم-الكتابة', async (t) => {
  const item = await inventory.create({ name: 'p1-fabric', category: 'fabric', quantity: 5, minQuantity: 1, price: 10, unit: 'م' });
  try {
    await Promise.all(Array.from({ length: 20 }, () => inventory.adjustStock(item.id, 1)));
    await t.test('1. 20 ضغطة +1 متزامنة = +20 بالضبط (كانت تُضيّع)', (await inventory.find(item.id)).quantity === 25);
    await Promise.all([...Array.from({ length: 10 }, () => inventory.adjustStock(item.id, 1)), ...Array.from({ length: 10 }, () => inventory.adjustStock(item.id, -1))]);
    await t.test('2. +10 و−10 متداخلة لا تغيّر الكمية', (await inventory.find(item.id)).quantity === 25);
    await inventory.adjustStock(item.id, -1000);
    await t.test('3. لا كمية سالبة (حد أدنى 0)', (await inventory.find(item.id)).quantity === 0);
    await t.test('4. صنف غير موجود → null بلا استثناء', (await inventory.adjustStock('nope-p1', 1)) === null);
  } finally { await inventory.remove(item.id); }

  const c = await customers.create({ name: 'p1-wallet', phone: '01011110001' });
  try {
    await Promise.all(Array.from({ length: 10 }, () => customers.walletTopUp(c.id, 10)));
    await t.test('5. 10 شحنات رصيد متزامنة = 100 (كانت تُضيّع)', Math.round((await customers.find(c.id)).creditBalance * 100) === 10000);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => customers.walletAdjust(c.id, { balance: -30, type: 'spend' })));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const after = (await customers.find(c.id)).creditBalance;
    await t.test('6. خصم متزامن لا يتجاوز الرصيد: 3 ينجح و2 يُرفض والرصيد 10', ok === 3 && Math.round(after * 100) === 1000);
    const bad = await customers.walletAdjust(c.id, { balance: -999, type: 'spend' }).then(() => false, () => true);
    await t.test('7. الرصيد لا يصير سالباً', bad && (await customers.find(c.id)).creditBalance === after);
    const log = (await customers.find(c.id)).walletLog || [];
    await t.test('8. كل حركة ناجحة سُجّلت في walletLog (10 شحن + 3 خصم)', log.length === 13);
  } finally { await customers.remove(c.id); }

  const probe = createRepository('p1-store-unused');
  await t.test('9. modify مُصدَّرة من المستودع العام', typeof probe.modify === 'function');
});

/* ==========================================================================
   حساب المقدّم والفائض
   ========================================================================== */
register('phase1: المقدّم والفائض', async (t) => {
  const B = (dep, list) => orderPaidBreakdown({ deposit: dep }, list).paid;
  await t.test('1. مقدّم بلا دفعات: يُحسب كاملاً', B(200, []) === 200);
  await t.test('2. دفعة معلَّمة = المقدم: لا تكرار (200)', B(200, [{ isDeposit: true, amount: 200 }]) === 200);
  await t.test('3. رُفع المقدم لاحقاً (500) ودفعة معلَّمة 200: المدفوع 500 (كان 200)', B(500, [{ isDeposit: true, amount: 200 }]) === 500);
  await t.test('4. خُفِّض المقدم (100) ودفعة معلَّمة 200: لا يضيع المقبوض (200)', B(100, [{ isDeposit: true, amount: 200 }]) === 200);
  await t.test('5. دفعتان معلَّمتان 120+80 لمقدم 200: لا تكرار', B(200, [{ isDeposit: true, amount: 120 }, { isDeposit: true, amount: 80 }]) === 200);
  await t.test('6. معلَّمة 120 فقط لمقدم 200: يُضاف المتبقي 80', B(200, [{ isDeposit: true, amount: 120 }]) === 200);
  await t.test('7. دفعة عادية (isDeposit:false) بنفس مبلغ المقدم تُضاف فوقه', B(200, [{ isDeposit: false, amount: 200 }]) === 400);
  await t.test('8. توافق قديم: دفعة بلا علامة بمبلغ المقدم تُعدّ المقدم', B(200, [{ amount: 200 }]) === 200);
  await t.test('9. unrecordedDeposit بدون مقدم = 0', unrecordedDeposit(0, [{ isDeposit: true, amount: 5 }]) === 0);

  const O = (amount, dep, list) => overpaidBy({ amount, deposit: dep }, list);
  await t.test('10. overpaidBy: لا فائض عند المساواة', O(1000, 0, [{ amount: 1000 }]) === 0);
  await t.test('11. overpaidBy: فائض 300', O(1000, 0, [{ amount: 800 }, { amount: 500 }]) === 300);
  await t.test('12. overpaidBy: يحسب المقدم أيضاً', O(1000, 400, [{ amount: 700 }]) === 100);
  await t.test('13. overpaidBy: لا فائض للطلب بلا دفعات ومقدمه أقل', O(1000, 300, []) === 0);
  await t.test('14. overpaidBy: تسامح كسور القرش (0.004)', O(100, 0, [{ amount: 100.004 }]) === 0);

  /* دلالة الرسوم النسبية موثّقة هنا حتى لا تتغير بصمت: الخصم والرسوم % كلاهما على المجموع الفرعي قبل الخصم */
  const ct = computeTotals([{ price: 1000, quantity: 1 }], 'percent', 20, [{ type: 'percent', value: 10 }]);
  await t.test('15. توثيق: رسوم 10% تُحسب على المجموع قبل الخصم (100 لا 80) → الإجمالي 900',
    ct.discountAmount === 200 && ct.extraFeesTotal === 100 && ct.amount === 900);
});

/* ==========================================================================
   الواجهة الفعلية
   ========================================================================== */
register('phase1: الواجهة (عملاء/دفعات/طلبات)', async (t) => {
  const box = document.createElement('div');
  document.body.appendChild(box);
  const s0 = await settings.get();
  const made = { customers: [], orders: [], payments: [] };
  try {
    /* ---------- عملاء: مقاسات الحقول المعطَّلة ---------- */
    await settings.update({ measurementFields: [
      { id: 'chest', name: 'الصدر', unit: 'سم', enabled: true },
      { id: 'hidden', name: 'حقل معطّل', unit: 'سم', enabled: false },
    ] });
    const c = await customers.create({ name: 'p1-cust', phone: '01022220001', measurements: { chest: 100, hidden: 55 } });
    made.customers.push(c.id);
    await customersPage.render(box);
    await sleep(250);
    const editFromCard = () => btn(box.querySelector('[data-id="' + c.id + '"]'), '✏️');
    editFromCard().click(); await sleep(200);
    btn(topModal(), 'حفظ التعديلات').click(); await sleep(400);
    await t.test('1. حفظ عميل بلا تغيير لا يمسح مقاس الحقل المعطَّل', (await customers.find(c.id)).measurements.hidden === 55 && (await customers.find(c.id)).measurements.chest === 100);

    await customersPage.render(box); await sleep(250);
    editFromCard().click(); await sleep(200);
    const chestInput = Array.from(topModal().querySelectorAll('input[type="number"]'))[0];
    chestInput.value = ''; chestInput.dispatchEvent(new Event('input', { bubbles: true }));
    btn(topModal(), 'حفظ التعديلات').click(); await sleep(400);
    const m2 = (await customers.find(c.id)).measurements;
    await t.test('2. مسح قيمة حقل ظاهر يُحذفها فعلاً، والمعطَّل يبقى', !('chest' in m2) && m2.hidden === 55);

    /* ---------- دفعات: فائض ---------- */
    const cust = await customers.create({ name: 'p1-pay', phone: '01022220002' });
    made.customers.push(cust.id);
    const ord = await orders.create({ customerId: cust.id, status: 'pending', amount: 1000, deposit: 0, items: [{ name: 'ثوب', price: 1000, quantity: 1 }] });
    made.orders.push(ord.id);
    const p1 = await payments.create({ customerId: cust.id, orderId: ord.id, amount: 800, method: 'cash', isDeposit: false });
    made.payments.push(p1.id);

    const addPayment = async (amount, targetOrder = ord) => {
      await paymentsPage.render(box); await sleep(250);
      btn(box, 'إضافة دفعة').click(); await sleep(200);
      const m = topModal();
      const selects = m.querySelectorAll('select');
        /* منتقي العميل عنصر يحمل value/change */
      const customerEl = Array.from(m.querySelectorAll('*')).find((n) => 'value' in n && n.tagName !== 'INPUT' && n.tagName !== 'SELECT' && n.tagName !== 'TEXTAREA' && n.tagName !== 'BUTTON' && n.tagName !== 'OPTION' && typeof n.value === 'string');
      customerEl.value = cust.id; customerEl.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(80);
      const orderSel = Array.from(selects).find((s) => Array.from(s.options).some((o) => o.value === targetOrder.id));
      orderSel.value = targetOrder.id; orderSel.dispatchEvent(new Event('change', { bubbles: true }));
      const amountEl = m.querySelector('input[type="number"]');
      amountEl.value = String(amount); amountEl.dispatchEvent(new Event('input', { bubbles: true }));
      btn(m, 'إضافة').click();
      await sleep(250);
    };
    const countFor = async () => (await payments.findByOrder(ord.id)).length;

    await addPayment(300);                       // المتبقي 200 → 300 يتجاوز
    const confirmModal = topModal();
    await t.test('3. دفعة 300 والمتبقي 200: يظهر تأكيد «دفعة أكبر من المتبقي»', !!confirmModal && confirmModal.textContent.includes('دفعة أكبر من المتبقي') && confirmModal.textContent.includes('100'));
    btn(confirmModal, 'تعديل المبلغ').click(); await sleep(250);
    await t.test('4. «تعديل المبلغ» لا يحفظ شيئاً', (await countFor()) === 1);
    closeModals();

    await addPayment(300);
    btn(topModal(), 'نعم، احفظ').click(); await sleep(350);
    await t.test('5. «نعم، احفظ» يحفظ الفائض عن علم', (await countFor()) === 2);
    (await payments.findByOrder(ord.id)).filter((p) => p.id !== p1.id).forEach((p) => made.payments.push(p.id));
    closeModals();

    const ord2 = await orders.create({ customerId: cust.id, status: 'pending', amount: 1000, deposit: 0, items: [{ name: 'ثوب2', price: 1000, quantity: 1 }] });
    made.orders.push(ord2.id);
    const before = (await payments.findByOrder(ord2.id)).length;
    /* دفعة بالمبلغ المتبقي بالضبط لطلب جديد: بلا تأكيد */
    await addPayment(1000, ord2);
    const noConfirm = !(topModal() && topModal().textContent.includes('دفعة أكبر من المتبقي'));
    await sleep(150);
    await t.test('6. دفعة بالمتبقي بالضبط تُحفظ بلا تأكيد', noConfirm && (await payments.findByOrder(ord2.id)).length === before + 1);
    (await payments.findByOrder(ord2.id)).forEach((p) => made.payments.push(p.id));
    closeModals();

    /* ---------- طلبات: خفض الإجمالي دون المدفوع ---------- */
    await ordersPage.render(box); await sleep(300);
    const orderCard = box.querySelector('[data-id="' + ord.id + '"]');
    const editOrderBtn = orderCard && btn(orderCard, '✏️');
    if (editOrderBtn) {
      editOrderBtn.click(); await sleep(300);
      const m = topModal();
      const price = Array.from(m.querySelectorAll('input[type="number"]')).find((i) => i.value === '1000');
      price.value = '500'; price.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(60);
      btn(m, 'حفظ التعديلات').click(); await sleep(350);
      const cm = topModal();
      await t.test('7. خفض إجمالي طلب دون المدفوع (1100 مدفوع): يظهر تأكيد المدفوع أكبر من الإجمالي',
        !!cm && cm.textContent.includes('المدفوع أكبر من الإجمالي'));
      btn(cm, 'تعديل').click(); await sleep(250);
      await t.test('8. «تعديل» لا يغيّر الطلب', (await orders.find(ord.id)).amount === 1000);
      closeModals();
    } else {
      await t.test('7. (تخطّي: زر تعديل الطلب غير ظاهر في هذه البيئة)', true);
      await t.test('8. (تخطّي)', true);
    }

    /* ---------- حذف دفعة من الرصيد ---------- */
    const wc = await customers.create({ name: 'p1-credit', phone: '01022220003' });
    made.customers.push(wc.id);
    await customers.walletTopUp(wc.id, 500);
    const wo = await orders.create({ customerId: wc.id, status: 'pending', amount: 600, deposit: 0, items: [{ name: 'ثوب', price: 600, quantity: 1 }] });
    made.orders.push(wo.id);
    const spent = await orders.spendCredit(wo.id, 300, 600);
    const cp = (await payments.findByOrder(wo.id)).find((p) => p.fromCredit);
    made.payments.push(cp.id);
    await t.test('9. تأسيس: خُصم 300 من الرصيد وسُجّلت دفعة fromCredit', spent === 300 && (await customers.find(wc.id)).creditBalance === 200 && !!cp);

    await paymentsPage.render(box); await sleep(300);
    const pcard = box.querySelector('[data-id="' + cp.id + '"]');
    const delBtn = pcard && btn(pcard, '🗑️');
    if (delBtn) {
      delBtn.click(); await sleep(150);
      await t.test('10. رسالة الحذف تذكر إعادة المبلغ للرصيد', topModal().textContent.includes('رصيد العميل') && topModal().textContent.includes('300'));
      btn(topModal(), 'حذف').click(); await sleep(400);
      await t.test('11. بعد الحذف: الدفعة اختفت والرصيد عاد 500', (await payments.findByOrder(wo.id)).length === 0 && (await customers.find(wc.id)).creditBalance === 500);

      const tr = (await trash.list()).find((x) => x.originalStore === STORES.PAYMENTS && x.data && x.data.id === cp.id);
      await t.test('12. نسخة السلة تحمل علامة creditRefunded', !!tr && tr.data.creditRefunded === true);
      await trash.restore(tr.id);
      await t.test('13. استرجاعها يخصم 300 ثانيةً (الرصيد 200) وتعود الدفعة بلا علامة',
        (await customers.find(wc.id)).creditBalance === 200 && (await payments.findByOrder(wo.id)).length === 1 &&
        !('creditRefunded' in (await payments.find(cp.id))));

      /* استرجاع بلا رصيد كافٍ يُرفض ولا يكتب شيئاً */
      await payments.remove(cp.id);
      await customers.walletAdjust(wc.id, { balance: 300, type: 'adjust' });         // محاكاة الإعادة
      const tr2 = await trash.addToTrash(STORES.PAYMENTS, { ...cp, creditRefunded: true });
      await customers.walletAdjust(wc.id, { balance: -(await customers.find(wc.id)).creditBalance, type: 'adjust' });   // صفّر الرصيد
      const refused = await trash.restore(tr2.id).then(() => false, () => true);
      await t.test('14. استرجاع دفعة من الرصيد والرصيد 0: يُرفض ولا تُكتب الدفعة', refused && !(await payments.find(cp.id)));
      await trash.remove(tr2.id);
      closeModals();
    } else {
      for (let i = 10; i <= 14; i++) await t.test(i + '. (تخطّي: زر الحذف غير ظاهر)', true);
    }

    /* ---------- حذف عميل: التحذير يشمل المواعيد وأفراد العائلة ---------- */
    const head = await customers.create({ name: 'p1-head', phone: '01022220004' });
    const member = await customers.create({ name: 'p1-member', phone: '01022220005', familyHeadId: head.id });
    made.customers.push(head.id, member.id);

    const appt = await appointments.create({ customerId: head.id, date: Date.now() + 86400000, status: 'scheduled', title: 'p1-appt' });
    await customersPage.render(box); await sleep(300);
    const hcard = box.querySelector('[data-id="' + head.id + '"]');
    const hdel = hcard && btn(hcard, '🗑️');
    if (hdel) {
      hdel.click(); await sleep(250);
      const msg = topModal().textContent;
      await t.test('16. تحذير حذف العميل يذكر موعده وأفراد العائلة المرتبطين',
        msg.includes('1 موعد') && msg.includes('أفراد العائلة'));
      btn(topModal(), 'إلغاء').click(); await sleep(150);
    } else { await t.test('16. (تخطّي: زر حذف العميل غير ظاهر)', true); }
    try { await appointments.remove(appt.id); } catch { /* ignore */ }
    closeModals();

    /* عناصر السلة القديمة (بلا العلامة) لا يُخصم لها رصيد عند الاسترجاع */
    const legacy = await trash.addToTrash(STORES.PAYMENTS, { id: 'p1-legacy', customerId: wc.id, orderId: wo.id, amount: 50, fromCredit: true, method: 'other' });
    const balBefore = (await customers.find(wc.id)).creditBalance;
    await trash.restore(legacy.id);
    await t.test('15. عنصر سلة قديم (بلا creditRefunded): الاسترجاع لا يمسّ الرصيد', (await customers.find(wc.id)).creditBalance === balBefore);
    made.payments.push('p1-legacy');
  } finally {
    closeModals();
    box.remove();
    for (const id of made.payments) { try { await payments.remove(id); } catch { /* ignore */ } }
    for (const id of made.orders) { try { await orders.remove(id); } catch { /* ignore */ } }
    for (const id of made.customers) { try { await customers.remove(id); } catch { /* ignore */ } }
    await settings.update({ measurementFields: s0.measurementFields });
  }
});
