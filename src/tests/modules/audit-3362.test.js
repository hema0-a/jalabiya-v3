/* ==========================================================================
   audit-3362.test.js — تخطي توقيع العميل عند التسليم الكامل والجزئي (v3.3.62)
   ========================================================================== */

import { register } from '../registry.js';
import { openPartialDelivery, deliverWithSignature } from '../../pages/orders.js';
import { openSignaturePad, SIGNATURE_SKIPPED } from '../../ui/signature-pad.js';
import { getAskSignature, setAskSignature, ASK_SIGNATURE_KEY } from '../../services/signature-pref.js';
import { orders } from '../../data/repos/orders.js';
import { payments } from '../../data/repos/payments.js';
import { modal } from '../../ui/modal.js';

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => Array.from(document.body.querySelectorAll(sel));
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const until = async (fn, timeout = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (fn()) return true; await wait(25); }
  return !!fn();
};
const btn = (re) => q('button').find((b) => re.test(b.textContent));
const itemInputs = () => q('input').filter((i) => i.getAttribute('type') === 'number' && /^كمية/.test(i.getAttribute('aria-label') || ''));
const sigBox = () => q('input').find((i) => i.id === 'partial-sig');
const collectBox = () => q('input').find((i) => i.getAttribute('aria-label') === 'تحصيل دفعة الآن');

const mk = () => orders.create({
  customerId: 'test-c', status: 'ready', amount: 900, deposit: 200,
  items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
});
async function cleanup(o) {
  modal.closeAll();
  try { for (const p of await payments.findByOrder(o.id)) await payments.remove(p.id); } catch (e) { /* ignore */ }
  await orders.remove(o.id);
}

register('audit v3.3.62 signature skip: pad + preference', async (t) => {
  const saved = localStorage.getItem(ASK_SIGNATURE_KEY);
  try {
    localStorage.removeItem(ASK_SIGNATURE_KEY);
    await t.test('1. الافتراضي: يُطلب التوقيع (كالسابق)', getAskSignature() === true);
    setAskSignature(false);
    await t.test('2. حفظ «بلا توقيع» كتفضيل للجهاز', getAskSignature() === false && localStorage.getItem(ASK_SIGNATURE_KEY) === '0');
    setAskSignature(true);
    await t.test('3. العودة إلى «يُطلب»', getAskSignature() === true);
  } finally {
    if (saved === null) localStorage.removeItem(ASK_SIGNATURE_KEY); else localStorage.setItem(ASK_SIGNATURE_KEY, saved);
  }

  let p = openSignaturePad({ title: 'اختبار' });
  await until(() => !!btn(/حفظ التوقيع/));
  await t.test('4. بلا allowSkip: لا زر تخطي (السلوك السابق)', !btn(/تخطي التوقيع/));
  btn(/^إلغاء$/).click();
  const cancelled = await p;
  await t.test('5. الإلغاء ما زال null (يعني إلغاء العملية)', cancelled === null);

  p = openSignaturePad({ title: 'اختبار', allowSkip: true });
  await until(() => !!btn(/تخطي التوقيع/));
  await t.test('6. مع allowSkip: يظهر زر «تخطي التوقيع»', !!btn(/تخطي التوقيع/));
  btn(/تخطي التوقيع/).click();
  const skipped = await p;
  await t.test('7. التخطي يُرجع SIGNATURE_SKIPPED (غير null) ويغلق النافذة',
    skipped === SIGNATURE_SKIPPED && skipped !== null && !btn(/حفظ التوقيع/));
  modal.closeAll();
});

register('audit v3.3.62 signature skip: partial delivery', async (t) => {
  const saved = localStorage.getItem(ASK_SIGNATURE_KEY);
  try {
    /* التفضيل المحفوظ هو الافتراضي في النافذة، وتغيير الخانة يحفظه */
    setAskSignature(false);
    let o = await mk();
    try {
      openPartialDelivery(o);
      await until(() => !!sigBox());
      await t.test('1. تفضيل «بلا توقيع» → الخانة غير مفعّلة افتراضياً', sigBox().checked === false);
      sigBox().checked = true; fire(sigBox(), 'change');
      await t.test('2. تفعيل الخانة يحفظ التفضيل للمرة القادمة', getAskSignature() === true);
    } finally { await cleanup(o); }

    /* مع توقيع مطلوب: «تخطي» داخل اللوحة يكمل التسليم بلا توقيع */
    setAskSignature(true);
    o = await mk();
    try {
      openPartialDelivery(o);
      await until(() => itemInputs().length > 0);
      const nums = itemInputs();
      nums[0].value = '1'; fire(nums[0], 'input');
      await wait(100);
      collectBox().checked = false; fire(collectBox(), 'change');
      btn(/تأكيد التسليم/).click();
      await until(() => !!btn(/تخطي التوقيع/));
      await t.test('3. لوحة التوقيع تُعرض مع زر «تخطي التوقيع»', !!btn(/تخطي التوقيع/));
      btn(/تخطي التوقيع/).click();
      await wait(400);
      const fresh = await orders.find(o.id);
      await t.test('4. التخطي: يُحفظ التسليم بلا توقيع',
        fresh.deliveries && fresh.deliveries.length === 1 && !fresh.deliveries[0].signature && !fresh.signature);
    } finally { await cleanup(o); }

    /* إلغاء اللوحة = إلغاء التسليم (لا تغيير) */
    o = await mk();
    try {
      openPartialDelivery(o);
      await until(() => itemInputs().length > 0);
      const nums = itemInputs();
      nums[0].value = '1'; fire(nums[0], 'input');
      await wait(100);
      collectBox().checked = false; fire(collectBox(), 'change');
      btn(/تأكيد التسليم/).click();
      await until(() => !!btn(/تخطي التوقيع/));
      btn(/^إلغاء$/).click();
      await wait(300);
      const fresh = await orders.find(o.id);
      await t.test('5. إلغاء لوحة التوقيع يلغي التسليم ولا يتغيّر الطلب', !(fresh.deliveries && fresh.deliveries.length));
    } finally { await cleanup(o); }

    /* بلا توقيع من الأساس */
    setAskSignature(false);
    o = await mk();
    try {
      openPartialDelivery(o);
      await until(() => itemInputs().length > 0);
      const nums = itemInputs();
      nums[0].value = '2'; fire(nums[0], 'input');
      await wait(100);
      collectBox().checked = false; fire(collectBox(), 'change');
      btn(/تأكيد التسليم/).click();
      await wait(500);
      const fresh = await orders.find(o.id);
      await t.test('6. الخانة غير مفعّلة: يُسلَّم مباشرة بلا لوحة توقيع',
        fresh.deliveries && fresh.deliveries.length === 1 && !fresh.deliveries[0].signature && !btn(/حفظ التوقيع/));
    } finally { await cleanup(o); }
  } finally {
    modal.closeAll();
    if (saved === null) localStorage.removeItem(ASK_SIGNATURE_KEY); else localStorage.setItem(ASK_SIGNATURE_KEY, saved);
  }
});

register('audit v3.3.62 signature skip: full delivery', async (t) => {
  const saved = localStorage.getItem(ASK_SIGNATURE_KEY);
  const confirmBtn = () => btn(/تأكيد التسليم/);
  const askBox = () => q('input').find((i) => i.id === 'deliver-ask-sig');
  try {
    /* 1) بلا توقيع: التأكيد يسلّم مباشرة */
    setAskSignature(false);
    let o = await mk();
    try {
      const run = deliverWithSignature(o);
      await until(() => !!askBox());
      await t.test('1. نافذة التأكيد فيها خانة «طلب توقيع العميل» تعكس التفضيل (غير مفعّلة)', askBox().checked === false);
      confirmBtn().click();
      await run;
      const fresh = await orders.find(o.id);
      await t.test('2. بلا توقيع: يُسلَّم الطلب كاملاً بلا لوحة ولا توقيع',
        fresh.status === 'delivered' && !fresh.signature && !btn(/حفظ التوقيع/));
    } finally { await cleanup(o); }

    /* 2) مع توقيع مطلوب: تخطي من اللوحة */
    setAskSignature(true);
    o = await mk();
    try {
      const run = deliverWithSignature(o);
      await until(() => !!askBox());
      await t.test('3. التفضيل مفعّل → الخانة مفعّلة', askBox().checked === true);
      confirmBtn().click();
      await until(() => !!btn(/تخطي التوقيع/));
      await t.test('4. لوحة التوقيع بزر «تخطي»', !!btn(/تخطي التوقيع/));
      btn(/تخطي التوقيع/).click();
      await run;
      const fresh = await orders.find(o.id);
      await t.test('5. التخطي من اللوحة: يُسلَّم بلا توقيع', fresh.status === 'delivered' && !fresh.signature);
    } finally { await cleanup(o); }

    /* 3) إلغاء الحوار أو اللوحة لا يسلّم */
    o = await mk();
    try {
      const run = deliverWithSignature(o);
      await until(() => !!askBox());
      btn(/^إلغاء$/).click();
      await run;
      await t.test('6. إلغاء نافذة التأكيد لا يسلّم', (await orders.find(o.id)).status === 'ready');

      const run2 = deliverWithSignature(o);
      await until(() => !!askBox());
      confirmBtn().click();
      await until(() => !!btn(/تخطي التوقيع/));
      btn(/^إلغاء$/).click();
      await run2;
      await t.test('7. إلغاء لوحة التوقيع لا يسلّم', (await orders.find(o.id)).status === 'ready');
    } finally { await cleanup(o); }

    /* 4) إلغاء الخانة في الحوار يُحفظ تفضيلاً */
    setAskSignature(true);
    o = await mk();
    try {
      const run = deliverWithSignature(o);
      await until(() => !!askBox());
      askBox().checked = false;
      confirmBtn().click();
      await run;
      await t.test('8. إلغاء خانة التوقيع في التأكيد يُحفظ كتفضيل للمرات القادمة', getAskSignature() === false && (await orders.find(o.id)).status === 'delivered');
    } finally { await cleanup(o); }
  } finally {
    modal.closeAll();
    if (saved === null) localStorage.removeItem(ASK_SIGNATURE_KEY); else localStorage.setItem(ASK_SIGNATURE_KEY, saved);
  }
});
