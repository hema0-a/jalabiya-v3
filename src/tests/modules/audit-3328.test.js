/* ==========================================================================
   audit-3328.test.js — ربحية الطلبات (v3.3.28)
   ========================================================================== */

import { register } from '../registry.js';
import { orderProfit, summarizeProfit } from '../../services/order-profit.js';

register('audit v3.3.28 order profit', async (t) => {
  let p = orderProfit({ amount: 1000, cost: 600 });
  await t.test('1. الربح = الإيراد − التكلفة والهامش 40%', p.profit === 400 && p.margin === 40 && p.hasCost);

  p = orderProfit({ amount: 1000 });
  await t.test('2. بلا تكلفة: hasCost=false والهامش 0 (لا نفترض تكلفة صفر)', !p.hasCost && p.margin === 0);

  p = orderProfit({ amount: 500, cost: 700 });
  await t.test('3. تكلفة أكبر من الإيراد = ربح سالب', p.profit === -200 && p.margin === -40);

  p = orderProfit(null);
  await t.test('4. مدخل فارغ/تالف لا يُسقط الحساب', p.revenue === 0 && p.cost === 0 && !p.hasCost);

  p = orderProfit({ amount: 'abc', cost: -5 });
  await t.test('5. قيم غير رقمية أو سالبة تُعامل كصفر', p.revenue === 0 && !p.hasCost);

  const s = summarizeProfit([
    { id: 'a', status: 'delivered', amount: 1000, cost: 600 },
    { id: 'b', status: 'delivered', amount: 500, cost: 700 },
    { id: 'c', status: 'delivered', amount: 800 },
    { id: 'd', status: 'in_progress', amount: 900, cost: 100 },
    { id: 'e', status: 'cancelled', amount: 900, cost: 100 },
  ]);
  await t.test('6. الملخص: المسلَّم المُكلَّف فقط (2 طلب)، ربح 200، هامش 13.33%',
    s.count === 2 && s.revenue === 1500 && s.cost === 1300 && s.profit === 200 && s.margin === 13.33);
  await t.test('7. الطلب المسلَّم بلا تكلفة يُحصى skipped، والخاسر يظهر في losing',
    s.skipped === 1 && s.losing.length === 1 && s.losing[0].id === 'b');

  const e = summarizeProfit(undefined);
  await t.test('8. قائمة غير صالحة → ملخص صفري', e.count === 0 && e.profit === 0 && e.margin === 0);
});
