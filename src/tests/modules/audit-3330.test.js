/* ==========================================================================
   audit-3330.test.js — v3.3.30: تذكير الاستلام، عروض الأسعار، سلامة البيانات،
   دمج العملاء، VIP التلقائي، مقارنة المواسم
   ========================================================================== */

import { register } from '../registry.js';
import { computePickups, buildPickupText } from '../../services/pickup-reminders.js';
import { quoteTotals, isExpired, quoteToOrderPayload, buildQuoteText, validUntilFrom } from '../../services/quotes.js';
import { scanIntegrity } from '../../services/data-integrity.js';
import { findDuplicateGroups, pickPrimary, mergeFields, phoneKey } from '../../services/customer-merge.js';
import { computeVipPromotions } from '../../services/vip-rules.js';
import { compareSeasons, windowMetrics, shiftYears, occasionRange } from '../../services/season-compare.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();

register('audit v3.3.30 pickups', async (t) => {
  const custs = [{ id: 'c1', name: 'أحمد', phone: '0100' }];
  const orders = [
    { id: 'o1000001', customerId: 'c1', status: 'ready', amount: 1000, readyAt: NOW - 5 * DAY },
    { id: 'o1000002', customerId: 'c1', status: 'ready', amount: 500, updatedAt: NOW - 1 * DAY },
    { id: 'o1000003', customerId: 'c1', status: 'delivered', amount: 700 },
    { id: 'o1000004', customerId: 'zzz', status: 'ready', amount: 300, readyAt: NOW },
  ];
  const pays = [{ id: 'p1', orderId: 'o1000001', customerId: 'c1', amount: 400 }];
  const r = computePickups(orders, pays, custs, NOW, 3);
  await t.test('1. الجاهزة فقط (3) مرتبة الأقدم أولاً', r.count === 3 && r.items[0].orderId === 'o1000001');
  await t.test('2. العمر 5 أيام متأخر، و1 يوم غير متأخر (fallback على updatedAt)',
    r.items[0].ageDays === 5 && r.items[0].late && r.items[1].ageDays === 1 && !r.items[1].late && r.lateCount === 1);
  await t.test('3. المتبقي = الإجمالي − المدفوع (600) والمجموع 1400', r.items[0].remaining === 600 && r.remainingTotal === 1400);
  await t.test('4. عميل محذوف يُسمّى «عميل غير معروف»', r.items.some((i) => i.name === 'عميل غير معروف'));
  const txt = buildPickupText(r.items[0], 'ورشة النور');
  await t.test('5. نص التذكير فيه الاسم والمتبقي والورشة', txt.includes('أحمد') && txt.includes('600') && txt.includes('ورشة النور'));
  await t.test('6. مدخلات تالفة لا تُسقط الحساب', computePickups(null, undefined, 5, NOW).count === 0);
});

register('audit v3.3.30 quotes', async (t) => {
  const items = [{ id: 'i1', name: 'جلابية', price: 500, quantity: 2 }, { name: 'طقية', price: 50 }];
  let tt = quoteTotals(items, 100);
  await t.test('1. الإجمالي 1050 − خصم 100 = 950', tt.subtotal === 1050 && tt.discountAmount === 100 && tt.amount === 950);
  tt = quoteTotals(items, 99999);
  await t.test('2. الخصم لا يتجاوز الإجمالي (المبلغ لا يصير سالباً)', tt.amount === 0 && tt.discountAmount === 1050);
  await t.test('3. isExpired: مفتوح ومنتهي فقط', isExpired({ status: 'open', validUntil: NOW - 1 }, NOW)
    && !isExpired({ status: 'accepted', validUntil: NOW - 1 }, NOW) && !isExpired({ status: 'open', validUntil: NOW + DAY }, NOW));
  const p = quoteToOrderPayload({ id: 'q1', customerId: 'c1', items, discount: 100, notes: 'ن' });
  await t.test('4. التحويل لطلب: pending بنفس البنود والمبلغ ومرجع العرض',
    p.status === 'pending' && p.amount === 950 && p.subtotal === 1050 && p.items.length === 2 && p.fromQuoteId === 'q1' && p.deposit === 0);
  const txt = buildQuoteText({ items, discount: 100, validUntil: NOW }, 'سالم', 'النور');
  await t.test('5. نص العرض فيه البنود والإجمالي', txt.includes('جلابية') && txt.includes('950') && txt.includes('سالم'));
  await t.test('6. validUntilFrom يضيف الأيام', validUntilFrom(0, 3) === 3 * DAY);
});

register('audit v3.3.30 data integrity', async (t) => {
  const customers = [{ id: 'c1' }, { id: 'c2' }];
  const orders = [
    { id: 'o1', customerId: 'c1', amount: 1000, deposit: 0 },
    { id: 'o2', customerId: 'gone', amount: 500, deposit: 800 },
    { id: 'o3', customerId: 'c1', amount: -5 },
  ];
  const payments = [
    { id: 'p1', orderId: 'nope', customerId: 'c1', amount: 100 },
    { id: 'p2', orderId: 'o1', customerId: 'c2', amount: 200 },
    { id: 'p3', customerId: 'ghost', amount: 50 },
    { id: 'p4', orderId: 'o1', customerId: 'c1', amount: 300 },
  ];
  const appts = [{ id: 'a1', customerId: 'gone' }, { id: 'a2', customerId: 'c1', orderId: 'nope' }];
  const r = scanIntegrity({ customers, orders, payments, appointments: appts });
  const c = r.counts;
  await t.test('1. كشف: دفعة بطلب محذوف + دفعة بعميل مختلف + دفعة لعميل محذوف',
    c.payment_orphan_order === 1 && c.payment_customer_mismatch === 1 && c.payment_missing_customer === 1);
  await t.test('2. كشف: طلب لعميل محذوف + مبلغ سالب + مقدم أكبر من الإجمالي',
    c.order_missing_customer === 1 && c.order_negative_amount === 1 && c.order_deposit_over === 1);
  await t.test('3. كشف مواعيد: عميل محذوف + طلب محذوف', c.appointment_missing_customer === 1 && c.appointment_orphan_order === 1);
  await t.test('4. الدفعة غير المربوطة تُحصى info بلا إصلاح', c.payment_unlinked === 1
    && r.issues.find((i) => i.type === 'payment_unlinked').fix === undefined);
  const fixes = r.issues.filter((i) => i.fix);
  await t.test('5. الإصلاحات الآمنة فقط (3) ولا تمسّ أي مبلغ',
    fixes.length === 3 && fixes.every((i) => !('amount' in i.fix.patch) && !('deposit' in i.fix.patch)));
  const mm = r.issues.find((i) => i.type === 'payment_customer_mismatch');
  await t.test('6. إصلاح عدم التطابق يضبط customerId على عميل الطلب', mm.fix.patch.customerId === 'c1');
  const clean = scanIntegrity({ customers, orders: [{ id: 'x', customerId: 'c1', amount: 10, deposit: 0 }], payments: [], appointments: [] });
  await t.test('7. بيانات سليمة = صفر مشاكل، ومدخل تالف لا يُسقط', clean.total === 0 && scanIntegrity().total === 0);
});

register('audit v3.3.30 customer merge', async (t) => {
  await t.test('1. مفتاح الهاتف: 010… و+2010… و٠١٠… متطابقة', phoneKey('01012345678') === phoneKey('+201012345678')
    && phoneKey('٠١٠١٢٣٤٥٦٧٨') === phoneKey('0101 234 5678'));
  await t.test('2. هاتف قصير لا يُعدّ مفتاحاً', phoneKey('123') === '');
  const cs = [
    { id: 'a', name: 'أحمد', phone: '01012345678', createdAt: 2 },
    { id: 'b', name: 'احمد محمد', phone: '+201012345678', createdAt: 1, address: 'القاهرة', notes: 'ن' },
    { id: 'c', name: 'سالم', phone: '', createdAt: 3 },
    { id: 'd', name: 'سالم', phone: '01199998888', createdAt: 4 },
    { id: 'e', name: 'منفرد', phone: '01255554444' },
  ];
  const g = findDuplicateGroups(cs);
  await t.test('3. مجموعة هاتف قوية (a,b) ومجموعة اسم محتملة (c,d) والمنفرد خارجاً',
    g.length === 2 && g[0].kind === 'phone' && g[0].customers.length === 2 && g[1].kind === 'name' && g[1].customers.length === 2);
  const primary = pickPrimary(g[0].customers);
  await t.test('4. الباقي = الأكثر بياناً (b)', primary.id === 'b');
  const patch = mergeFields({ id: 'a', phone: '010', vip: false }, [{ address: 'س', notes: 'ن', vip: true }]);
  await t.test('5. دمج الحقول: يُكمّل الناقص ويُرقّي VIP ولا يكتب فوق الموجود',
    patch.address === 'س' && patch.vip === true && !('phone' in patch));
  await t.test('6. قائمة تالفة → لا مجموعات', findDuplicateGroups(null).length === 0);
});

register('audit v3.3.30 vip rules', async (t) => {
  const customers = [
    { id: 'c1', name: 'أ' }, { id: 'c2', name: 'ب' }, { id: 'c3', name: 'ج', vip: true }, { id: 'c4', name: 'د' },
  ];
  const mk = (cid, n, amt, status = 'delivered') => Array.from({ length: n }, (_, i) => ({ id: cid + i, customerId: cid, status, amount: amt }));
  const orders = [...mk('c1', 5, 100), ...mk('c2', 1, 6000), ...mk('c3', 9, 9000), ...mk('c4', 9, 9000, 'cancelled'), ...mk('c4', 2, 100, 'in_progress')];
  const r = computeVipPromotions(customers, orders, { minOrders: 5, minSpent: 5000 });
  await t.test('1. ترقية c1 (5 طلبات) وc2 (إنفاق 6000) فقط', r.map((x) => x.id).sort().join() === 'c1,c2');
  await t.test('2. VIP الحالي لا يُمسّ، والملغى/غير المسلَّم لا يُحسب', !r.some((x) => x.id === 'c3' || x.id === 'c4'));
  await t.test('3. المعيار صفر = معطَّل', computeVipPromotions(customers, orders, { minOrders: 0, minSpent: 0 }).length === 0);
  await t.test('4. معيار الطلبات وحده', computeVipPromotions(customers, orders, { minOrders: 5, minSpent: 0 }).map((x) => x.id).join() === 'c1');
  await t.test('5. مدخل تالف لا يُسقط', computeVipPromotions(null, null).length === 0);
});

register('audit v3.3.30 season compare', async (t) => {
  const cur = { from: new Date(2026, 8, 1).getTime(), to: new Date(2026, 8, 30, 23, 59, 59).getTime() };
  const prev = shiftYears(cur, -1);
  const at = (y, m, d) => new Date(y, m, d, 10).getTime();
  const orders = [
    { id: '1', amount: 1000, status: 'delivered', createdAt: at(2026, 8, 5) },
    { id: '2', amount: 500, status: 'pending', createdAt: at(2026, 8, 5) },
    { id: '3', amount: 900, status: 'cancelled', createdAt: at(2026, 8, 6) },
    { id: '4', amount: 600, status: 'delivered', createdAt: at(2025, 8, 5) },
    { id: '5', amount: 400, status: 'delivered', receivedDate: at(2025, 8, 10), createdAt: at(2025, 0, 1) },
    { id: '6', amount: 999, status: 'delivered', createdAt: at(2026, 2, 1) },
  ];
  const m = windowMetrics(orders, cur);
  await t.test('1. المقاييس: طلبان (الملغى مستثنى) إيراد 1500 ومتوسط 750 وذروة يوم 5 = 2',
    m.orders === 2 && m.revenue === 1500 && m.avg === 750 && m.delivered === 1 && m.peak.count === 2);
  const c = compareSeasons(orders, cur, prev);
  await t.test('2. العام الماضي: receivedDate يسبق createdAt (طلبان، إيراد 1000)', c.prev.orders === 2 && c.prev.revenue === 1000);
  await t.test('3. نسب التغيّر: طلبات 0%، إيراد +50%', c.changes.orders === 0 && c.changes.revenue === 50 && c.hasPrev);
  const none = compareSeasons([], cur, prev);
  await t.test('4. بلا بيانات سابقة: التغيّر null بلا قسمة على صفر', none.changes.revenue === null && !none.hasPrev);
  const fut = occasionRange({ month: 12, day: 25 }, new Date(2026, 9, 11, 12).getTime(), 30);
  await t.test('5. مناسبة قادمة لم تبدأ نافذتها: started=false والفترة سليمة (from<to)', !fut.started && fut.from < fut.to);
  const part = occasionRange({ month: 10, day: 25 }, new Date(2026, 9, 11, 12).getTime(), 30);
  await t.test('5ب. نافذة جارية: started=true وتُقطع عند اليوم',
    part.started && part.to === new Date(2026, 9, 11, 23, 59, 59, 999).getTime() && part.from < part.to);
  const r2 = occasionRange({ month: 3, day: 10 }, new Date(2026, 9, 11, 12).getTime(), 30);
  await t.test('6. مناسبة مضت: النافذة 30 يوماً كاملة تنتهي بيوم المناسبة',
    Math.round((r2.to - r2.from) / DAY) === 30 && new Date(r2.to).getMonth() === 2 && new Date(r2.to).getDate() === 10);
});
