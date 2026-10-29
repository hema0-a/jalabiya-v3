/* ==========================================================================
   audit-3360.test.js — تحصيل نسبي + إيصال التسليم الجزئي (v3.3.60): المنطق
   ========================================================================== */

import { register } from '../registry.js';
import { suggestCollection, buildDeliveryReceiptModel, receiptCaption } from '../../services/delivery-receipt.js';

/* طلب: جلابية 200×3 + طاقية 50×2 (الإجمالي الخام 700) بمبلغ صافٍ 900 (رسوم)، مقدم 200 */
const mkOrder = (extra = {}) => ({
  id: 'ord-1', customerId: 'c1', status: 'ready', amount: 900, deposit: 200,
  items: [{ id: 'a', name: 'جلابية', price: 200, quantity: 3 }, { id: 'b', name: 'طاقية', price: 50, quantity: 2 }],
  ...extra,
});
const fmt = (n) => n + ' ج';

register('audit v3.3.60 collection suggestion', async (t) => {
  let s = suggestCollection(mkOrder(), [], { a: 2 });
  await t.test('1. المقترح = قيمة المسلَّم (514.29) − المقدم (200) = 314.29',
    s.ok && s.deliveredValue === 514.29 && s.paid === 200 && s.suggested === 314.29 && s.balance === 700 && s.completes === false);

  s = suggestCollection(mkOrder(), [{ id: 'p1', orderId: 'ord-1', amount: 300, isDeposit: false }], { a: 2 });
  await t.test('2. دفعات مسجّلة تُخصم أيضاً: المدفوع 500 (300 + المقدم) ← المقترح 14.29',
    s.paid === 500 && s.suggested === 14.29);

  s = suggestCollection(mkOrder({ deposit: 600 }), [], { a: 2 });
  await t.test('3. ما دُفع يغطّي المسلَّم → المقترح صفر', s.suggested === 0 && s.dueForDelivered === 0);

  s = suggestCollection(mkOrder(), [], { a: 3, b: 2 });
  await t.test('4. تسليم كل القطع: يكتمل والمقترح = المتبقي كله (700)',
    s.completes === true && s.deliveredValue === 900 && s.remainingValue === 0 && s.suggested === 700);

  s = suggestCollection(mkOrder({ amount: 100, deposit: 100 }), [], { a: 1 });
  await t.test('5. مدفوع بالكامل: المقترح صفر ولا يتجاوز المتبقي أبداً', s.suggested === 0 && s.balance === 0);

  s = suggestCollection(mkOrder(), [], { a: 9 });
  await t.test('6. اختيار غير صالح → ok:false بسبب واضح', s.ok === false && /أكبر من المتبقي/.test(s.error));

  s = suggestCollection(mkOrder(), [], {});
  await t.test('7. بلا اختيار → ok:false', s.ok === false);

  const legacy = { id: 'o9', customerId: 'c1', status: 'ready', amount: 600, deposit: 0, quantity: 3 };
  s = suggestCollection(legacy, [], { __single__: 1 });
  await t.test('8. طلب قديم بلا بنود (بند افتراضي): قطعة من ثلاث = 200', s.ok && s.deliveredValue === 200 && s.suggested === 200);
});

register('audit v3.3.60 delivery receipt model', async (t) => {
  const d1 = { id: 'd1', at: 1000, items: [{ id: 'a', qty: 2 }], note: 'ملاحظة' };
  const d2 = { id: 'd2', at: 2000, items: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }] };
  const order = mkOrder({ deliveries: [d1] });

  let m = buildDeliveryReceiptModel({ order, deliveryId: 'd1', payments: [{ orderId: 'ord-1', amount: 300, deliveryId: 'd1', isDeposit: false }] });
  await t.test('1. التسليمة الأولى: القطع والقيمة والتقدّم والمتبقي',
    m && m.thisUnits === 2 && m.thisValue === 514.29 && m.deliveredUnits === 2 && m.totalUnits === 5 && m.percent === 40 &&
    m.remainingUnits === 3 && m.remainingLines.length === 2 && m.completes === false && m.note === 'ملاحظة');
  await t.test('2. المحصَّل عند التسليمة يُؤخذ من الدفعات المربوطة بها، والمدفوع = 500 (مع المقدم)',
    m.collected === 300 && m.paid === 500 && m.dueForDelivered === 14.29 && m.balance === 400);

  m = buildDeliveryReceiptModel({ order, deliveryId: 'd1', payments: [], collected: 123 });
  await t.test('3. المبلغ الصريح collected يغلب', m.collected === 123);

  const full = mkOrder({ status: 'delivered', deliveries: [d1, d2] });
  const m1 = buildDeliveryReceiptModel({ order: full, deliveryId: 'd1', payments: [] });
  const m2 = buildDeliveryReceiptModel({ order: full, deliveryId: 'd2', payments: [] });
  await t.test('4. إيصال تسليمة قديمة لطلب اكتمل: يعرض التقدّم وقتها (2 من 5) لا الاكتمال',
    m1.deliveredUnits === 2 && m1.completes === false && m1.remainingUnits === 3);
  await t.test('5. التسليمة الأخيرة: يكتمل الطلب ولا متبقٍّ للتسليم',
    m2.completes === true && m2.remainingUnits === 0 && m2.remainingLines.length === 0 && m2.thisUnits === 3);
  await t.test('6. مجموع قيم التسليمات = مبلغ الطلب بالقرش (لا فرق تقريب)',
    Math.round((m1.thisValue + m2.thisValue) * 100) === 90000);

  await t.test('7. معرّف تسليمة غير موجود → null', buildDeliveryReceiptModel({ order, deliveryId: 'zz', payments: [] }) === null);

  const m3 = buildDeliveryReceiptModel({ order: mkOrder({ deliveries: [d2, d1] }), deliveryId: 'd1', payments: [] });
  await t.test('8. ترتيب التسليمات في التخزين لا يغيّر النتيجة (تُرتَّب زمنياً)', m3.deliveredUnits === 2 && m3.thisUnits === 2);

  const cap = receiptCaption('567890', { deliveredUnits: 2, totalUnits: 5, collected: 300, balance: 400 }, fmt);
  const cap2 = receiptCaption('567890', { deliveredUnits: 5, totalUnits: 5, collected: 0, balance: 0 }, fmt);
  await t.test('9. نص الرسالة: رقم الإيصال والتقدّم والمحصَّل والمتبقي',
    /567890/.test(cap) && /2 من 5/.test(cap) && /300 ج/.test(cap) && /المتبقي 400 ج/.test(cap) && /مدفوع بالكامل/.test(cap2) && !/تحصيل/.test(cap2));
});
