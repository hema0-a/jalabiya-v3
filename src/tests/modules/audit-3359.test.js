/* ==========================================================================
   audit-3359.test.js — التسليم الجزئي (partial-delivery)
   ========================================================================== */

import { register } from '../registry.js';
import {
  orderLines, deliveryProgress, canPartialDeliver, deliveryBadgeText,
  planDelivery, applyDelivery, completeRemaining, sanitizeDeliveries, SINGLE_ID,
} from '../../services/partial-delivery.js';

const mk = (extra = {}) => ({
  id: 'o1', status: 'ready', amount: 900,
  items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
  ...extra,
});

register('audit v3.3.59 partial delivery', async (t) => {
  /* --- النموذج والتقدم --- */
  const legacy = orderLines({ amount: 400, quantity: 2, notes: 'طلب قديم' });
  await t.test('1. طلب قديم بلا بنود = بند افتراضي بكميته', legacy.length === 1 && legacy[0].id === SINGLE_ID && legacy[0].quantity === 2);
  let p = deliveryProgress(mk());
  await t.test('2. بلا تسليمات: state=none و5 وحدات متبقية', p.state === 'none' && p.totalUnits === 5 && p.remainingUnits === 5 && p.percent === 0);
  await t.test('3. canPartialDeliver: جاهز/قيد التنفيذ نعم، انتظار/مسلَّم/ملغى/قطعة واحدة لا',
    canPartialDeliver(mk()) && canPartialDeliver(mk({ status: 'in_progress' })) &&
    !canPartialDeliver(mk({ status: 'pending' })) && !canPartialDeliver(mk({ status: 'delivered' })) &&
    !canPartialDeliver(mk({ status: 'cancelled' })) && !canPartialDeliver({ status: 'ready', amount: 100, items: [{ id: 'x', name: 'ب', price: 100, quantity: 1 }] }));

  /* --- التحقق من الاختيار --- */
  await t.test('4. اختيار فارغ → خطأ', planDelivery(mk(), {}).ok === false && planDelivery(mk(), { a: 0, b: 0 }).ok === false);
  await t.test('5. أكبر من المتبقي / كسر / سالب → أخطاء بنص واضح',
    /المتبقي 3/.test(planDelivery(mk(), { a: 4 }).error) && planDelivery(mk(), { a: 1.5 }).ok === false && planDelivery(mk(), { b: -1 }).ok === false);

  /* --- تسليم جزئي --- */
  const r1 = applyDelivery(mk(), { a: 2 }, { now: 1000, id: 'd1', note: ' أخذ القطعتين ' });
  await t.test('6. تسليم جزء: يُضاف سجل ولا تتغير الحالة ويتبقى 3',
    r1.ok && !r1.completes && r1.patch.status === undefined && r1.patch.deliveries.length === 1 &&
    r1.patch.deliveries[0].note === 'أخذ القطعتين' && r1.remainingUnits === 3);
  const o2 = mk({ deliveries: r1.patch.deliveries });
  p = deliveryProgress(o2);
  await t.test('7. بعد التسليم: partial 2 من 5 (40%) والشارة', p.state === 'partial' && p.deliveredUnits === 2 && p.percent === 40 && deliveryBadgeText(o2) === '🚚 سُلِّم 2 من 5');
  await t.test('8. قيمة المسلَّم نصيبه من الصافي: 400/700 من 900 = 514.29', p.deliveredValue === 514.29 && p.remainingValue === 385.71);
  await t.test('9. السجل: تاريخ وعدد وأسماء', p.history.length === 1 && p.history[0].units === 2 && p.history[0].items[0].name === 'جلابية' && p.history[0].at === 1000);

  const r2 = applyDelivery(o2, { a: 1, b: 2 }, { now: 2000, signature: 'data:sig' });
  await t.test('10. تسليم آخر المتبقي يُكمل الطلب (delivered + deliveredAt + توقيع)',
    r2.ok && r2.completes && r2.patch.status === 'delivered' && r2.patch.deliveredAt === 2000 && r2.patch.signature === 'data:sig' && r2.patch.deliveries.length === 2);
  await t.test('11. بعد الاكتمال: full', deliveryProgress({ ...o2, ...r2.patch }).state === 'full' && deliveryProgress({ ...o2, ...r2.patch }).remainingUnits === 0);

  /* --- تسليم الكل --- */
  const c0 = completeRemaining(mk(), { now: 5, signature: 's' });
  await t.test('12. تسليم كامل بلا تسليمات سابقة: الصيغة القديمة (بلا deliveries)', c0.status === 'delivered' && c0.deliveredAt === 5 && c0.signature === 's' && !('deliveries' in c0));
  const c1 = completeRemaining(o2, { now: 9 });
  const after = { ...o2, ...c1 };
  await t.test('13. تسليم الكل بعد جزئي: تُضاف تسليمة أخيرة بالمتبقي (1 جلابية + 2 طاقية)',
    c1.deliveries.length === 2 && c1.deliveries[1].items.reduce((s, e) => s + e.qty, 0) === 3 && deliveryProgress(after).state === 'full');
  await t.test('14. status=delivered بلا تسليمات يعدّ مكتملاً', deliveryProgress(mk({ status: 'delivered' })).state === 'full');

  /* --- متانة --- */
  const messy = mk({ deliveries: [{ id: 'x', at: 1, items: [{ id: 'a', qty: 99 }, { id: 'zzz', qty: 3 }] }, null, { id: 'y' }] });
  p = deliveryProgress(messy);
  await t.test('15. كمية زائدة تُخفَّض لكمية البند، ومعرّف مجهول وسجلات تالفة تُتجاهل', p.deliveredUnits === 3 && p.lines[0].remaining === 0);

  /* --- تعديل الطلب بعد تسليم جزئي --- */
  const withDel = mk({ deliveries: [{ id: 'd', at: 1, items: [{ id: 'a', qty: 2 }, { id: 'b', qty: 1 }] }] });
  let s = sanitizeDeliveries(withDel, [{ id: 'a', name: 'جلابية', price: 200, quantity: 1 }]);
  await t.test('16. خفض كمية بند وحذف بند: تُخفَّض/تُسقط التسليمات الزائدة', s.length === 1 && s[0].items.length === 1 && s[0].items[0].id === 'a' && s[0].items[0].qty === 1);
  s = sanitizeDeliveries({ deliveries: [{ id: 'd', at: 1, items: [{ id: SINGLE_ID, qty: 1 }] }] }, [{ id: 'n1', name: 'جلابية', price: 100, quantity: 2 }]);
  await t.test('17. تسليم لطلب قديم يُربط ببنده الوحيد الجديد', s.length === 1 && s[0].items[0].id === 'n1');
  s = sanitizeDeliveries(withDel, [{ id: 'q', name: 'آخر', price: 1, quantity: 5 }]);
  await t.test('18. حذف كل البنود المُسلَّمة يفرغ التسليمات', s.length === 0);
  await t.test('19. لا تسليم جزئي: الشارة فارغة والتقدم none', deliveryBadgeText(mk()) === '' && deliveryProgress(null).state === 'none');
});
