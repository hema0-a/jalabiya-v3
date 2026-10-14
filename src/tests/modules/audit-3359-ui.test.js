/* ==========================================================================
   audit-3359-ui.test.js — نافذة التسليم الجزئي (تعمل في المتصفح)
   ========================================================================== */

import { register } from '../registry.js';
import { openPartialDelivery } from '../../pages/orders.js';
import { orders } from '../../data/repos/orders.js';
import { modal } from '../../ui/modal.js';
import { deliveryProgress } from '../../services/partial-delivery.js';
import { payments as paymentsRepo } from '../../data/repos/payments.js';

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => Array.from(document.body.querySelectorAll(sel));
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

register('audit v3.3.59 partial delivery modal', async (t) => {
  const o = await orders.create({
    customerId: 'test-c', status: 'ready', amount: 900,
    items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
  });
  try {
    openPartialDelivery(o);
    /* حقول كميات البنود فقط (حقل مبلغ التحصيل type=number أيضاً منذ v3.3.60) */
    const nums = q('input').filter((i) => i.getAttribute('type') === 'number' && /^كمية/.test(i.getAttribute('aria-label') || ''));
    await t.test('1. حقل كمية لكل بند', nums.length === 2);
    nums[0].value = '2'; fire(nums[0], 'input');
    await t.test('2. الملخص يوضح ما سيُسلَّم وما يتبقى',
      q('div').some((d) => /سيُسلَّم 2 قطعة/.test(d.textContent) && /يتبقى 3/.test(d.textContent) && d.children.length === 0));
    nums[1].value = '9'; fire(nums[1], 'input');
    await t.test('3. كمية أكبر من المتبقي تُعرض كتحذير', q('div').some((d) => d.children.length === 0 && /⚠️/.test(d.textContent) && /المتبقي 2/.test(d.textContent)));
    nums[1].value = '0'; fire(nums[1], 'input');

    q('input').find((i) => i.getAttribute('type') === 'checkbox').checked = false;     /* بلا لوحة توقيع في الاختبار */
    q('button').find((b) => /تأكيد التسليم/.test(b.textContent)).click();
    await wait(200);
    const fresh = await orders.find(o.id);
    await t.test('4. التأكيد يحفظ تسليماً جزئياً ولا يغيّر الحالة',
      fresh.status === 'ready' && fresh.deliveries.length === 1 && deliveryProgress(fresh).deliveredUnits === 2);
  } finally {
    modal.closeAll();
    try { for (const p of await paymentsRepo.findByOrder(o.id)) await paymentsRepo.remove(p.id); } catch (e) { /* ignore */ }
    await orders.remove(o.id);
  }
});
