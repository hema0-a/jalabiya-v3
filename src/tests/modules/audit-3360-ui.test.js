/* ==========================================================================
   audit-3360-ui.test.js — نافذة التسليم الجزئي مع التحصيل + نافذة الإيصال (المتصفح)
   ========================================================================== */

import { register } from '../registry.js';
import { openPartialDelivery } from '../../pages/orders.js';
import { openDeliveryReceipt } from '../../ui/delivery-receipt-dialog.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';
import { modal } from '../../ui/modal.js';

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => Array.from(document.body.querySelectorAll(sel));
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const itemInputs = () => q('input').filter((i) => i.getAttribute('type') === 'number' && /^كمية/.test(i.getAttribute('aria-label') || ''));
const amountInput = () => q('input').find((i) => i.getAttribute('aria-label') === 'المبلغ المحصَّل الآن');
const collectBox = () => q('input').find((i) => i.getAttribute('aria-label') === 'تحصيل دفعة الآن');
const sigBox = () => q('input').find((i) => i.id === 'partial-sig');
const confirmBtn = () => q('button').find((b) => /تأكيد التسليم/.test(b.textContent));

async function cleanup(o) {
  modal.closeAll();
  try { for (const p of await payments.findByOrder(o.id)) await payments.remove(p.id); } catch (e) { /* ignore */ }
  await orders.remove(o.id);
}

const mk = () => orders.create({
  customerId: 'test-c', status: 'ready', amount: 900, deposit: 200,
  items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
});

register('audit v3.3.60 partial delivery collection UI', async (t) => {
  /* 1) الاقتراح والتحصيل وربط الدفعة بالتسليمة */
  let o = await mk();
  try {
    openPartialDelivery(o);
    await wait(150);
    const nums = itemInputs();
    nums[0].value = '2'; fire(nums[0], 'input');
    await wait(30);
    await t.test('1. يقترح المبلغ المستحق عن المسلَّم مخصوماً منه المقدم (314.29) ويفعّل خانة التحصيل',
      !!amountInput() && Number(amountInput().value) === 314.29 && collectBox().checked === true &&
      q('div').some((d) => d.children.length === 0 && /سيُسجَّل دفعة بمبلغ/.test(d.textContent)));

    sigBox().checked = false;                       /* بلا لوحة توقيع في الاختبار */
    confirmBtn().click();
    await wait(500);
    const fresh = await orders.find(o.id);
    const pays = await payments.findByOrder(o.id);
    await t.test('2. التأكيد يحفظ التسليم ويسجّل الدفعة المقترحة مربوطة بالتسليمة (نقدي)',
      fresh.deliveries.length === 1 && pays.length === 1 && pays[0].amount === 314.29 &&
      pays[0].method === 'cash' && pays[0].deliveryId === fresh.deliveries[0].id && pays[0].isDeposit === false);
    await t.test('3. تُعرض نافذة إيصال التسليم بزر الإرسال على واتساب',
      q('button').some((b) => /إرسال على واتساب/.test(b.textContent)));
    await wait(700);
    const img = q('img').find((i) => i.getAttribute('alt') === 'إيصال التسليم');
    await t.test('4. معاينة الإيصال تُرسم كصورة PNG', !!img && /^data:image\/png/.test(img.src) && img.src.length > 5000);
  } finally { await cleanup(o); }

  /* 2) بلا تحصيل */
  o = await mk();
  try {
    openPartialDelivery(o);
    await wait(150);
    const nums = itemInputs();
    nums[0].value = '1'; fire(nums[0], 'input');
    collectBox().checked = false; fire(collectBox(), 'change');
    sigBox().checked = false;
    confirmBtn().click();
    await wait(400);
    await t.test('5. إلغاء خانة التحصيل: يُسلَّم ولا تُسجَّل دفعة',
      (await orders.find(o.id)).deliveries.length === 1 && (await payments.findByOrder(o.id)).length === 0);
  } finally { await cleanup(o); }

  /* 3) حماية: تحصيل أكبر من المتبقي */
  o = await mk();
  try {
    openPartialDelivery(o);
    await wait(150);
    const nums = itemInputs();
    nums[0].value = '1'; fire(nums[0], 'input');
    amountInput().value = '99999'; fire(amountInput(), 'input');
    await wait(30);
    await t.test('6. مبلغ أكبر من المتبقي يُعرض كتحذير',
      q('div').some((d) => d.children.length === 0 && /أكبر من المتبقي على الطلب/.test(d.textContent)));
    sigBox().checked = false;
    confirmBtn().click();
    await wait(300);
    const fresh = await orders.find(o.id);
    await t.test('7. التأكيد يُرفض كاملاً: لا تسليم ولا دفعة',
      !(fresh.deliveries && fresh.deliveries.length) && (await payments.findByOrder(o.id)).length === 0);
  } finally { await cleanup(o); }

  /* 4) مدفوع بالكامل مسبقاً: لا اقتراح */
  o = await orders.create({
    customerId: 'test-c', status: 'ready', amount: 900, deposit: 900,
    items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
  });
  try {
    openPartialDelivery(o);
    await wait(150);
    const nums = itemInputs();
    nums[0].value = '1'; fire(nums[0], 'input');
    await wait(30);
    await t.test('8. المدفوع يغطّي المسلَّم: لا مبلغ مقترح والخانة غير مفعّلة',
      amountInput().value === '' && collectBox().checked === false &&
      q('div').some((d) => d.children.length === 0 && /ما دُفع يغطّي المسلَّم/.test(d.textContent)));
  } finally { await cleanup(o); }
});

register('audit v3.3.60 delivery receipt dialog', async (t) => {
  const o = await orders.create({
    customerId: 'test-c', status: 'ready', amount: 900, deposit: 200,
    items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
    deliveries: [{ id: 'dx', at: Date.now(), items: [{ id: 'a', qty: 2 }] }],
  });
  try {
    openDeliveryReceipt(o, 'dx', { name: 'عميل تجريبي', phone: '01000000000' }, { collected: 100, headline: 'تم التسليم' });
    await wait(900);
    const img = q('img').find((i) => i.getAttribute('alt') === 'إيصال التسليم');
    await t.test('9. إعادة إصدار إيصال تسليمة محفوظة: صورة PNG مع زر الإرسال',
      !!img && /^data:image\/png/.test(img.src) && q('button').some((b) => /إرسال على واتساب/.test(b.textContent)));
    modal.closeAll();

    openDeliveryReceipt(o, 'غير-موجودة', null, {});
    await wait(500);
    await t.test('10. تسليمة غير موجودة: رسالة خطأ واضحة بدل صورة', q('div').some((d) => /تعذّر إنشاء الإيصال/.test(d.textContent) && d.children.length === 0));
  } finally { modal.closeAll(); await orders.remove(o.id); }
});
