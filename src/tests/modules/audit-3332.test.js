/* ==========================================================================
   audit-3332.test.js — إعدادات كانت تُحفظ ولا تُقرأ: التنبيهات والتجميع واستلام القماش (v3.3.32)
   ========================================================================== */

import { register } from '../registry.js';
import { alertToggles, filterLowStockForAlerts, fabricPickupDays, groupingOptions } from '../../services/alert-rules.js';
import { sizesSimilar, clusterBySize } from '../../services/size-clusters.js';
import { groupOrders } from '../../pages/orders.js';

register('audit v3.3.32 alert rules', async (t) => {
  let tg = alertToggles({});
  await t.test('1. الافتراضي: كل التنبيهات مفعَّلة وفترة 2', tg.seasons && tg.appointments && tg.inventory && tg.debts && tg.leadDays === 2);
  tg = alertToggles({ notifications: { seasons: false, debts: false, leadDays: 7 } });
  await t.test('2. الإيقاف الصريح والفترة 7 تُقرأ', !tg.seasons && !tg.debts && tg.appointments && tg.leadDays === 7);
  tg = alertToggles({ notifications: { leadDays: 'xx' } });
  await t.test('3. فترة تالفة ترجع للافتراضي', tg.leadDays === 2);
  await t.test('4. إعدادات null لا تُسقط', alertToggles(null).inventory === true);

  const items = [{ id: 1, category: 'fabric' }, { id: 2, category: 'thread' }, { id: 3 }];
  await t.test('5. الكل مفعَّل: كل الأصناف', filterLowStockForAlerts(items, {}).length === 3);
  await t.test('6. إيقاف نقص القماش يستثني القماش فقط',
    filterLowStockForAlerts(items, { inventory: { alertOnFabricLow: false } }).map((i) => i.id).join() === '2,3');
  await t.test('7. إيقاف نقص المخزون يُبقي القماش فقط',
    filterLowStockForAlerts(items, { inventory: { alertOnProductLow: false } }).map((i) => i.id).join() === '1');
  await t.test('8. إيقاف «تنبيهات المخزون» العام يمنع كل شيء',
    filterLowStockForAlerts(items, { notifications: { inventory: false } }).length === 0);

  await t.test('9. أيام استلام القماش: من الإعدادات أو الافتراضي (2)، والصفر مسموح',
    fabricPickupDays({ dailyLimit: { fabricPickupAlertDays: 5 } }) === 5 && fabricPickupDays({}) === 2
    && fabricPickupDays({ dailyLimit: { fabricPickupAlertDays: 0 } }) === 0);

  const go = groupingOptions({});
  await t.test('10. التجميع افتراضياً معطَّل، نفس النوع، تقارب 2', !go.enabled && go.sameTypeOnly && go.tolerance === 2);
  const g2 = groupingOptions({ grouping: { enabled: true, sameTypeOnly: false, tolerance: 0 } });
  await t.test('11. التجميع مفعَّل بلا شرط النوع وبدون تقارب', g2.enabled && !g2.sameTypeOnly && g2.tolerance === 0);
});

register('audit v3.3.32 grouping', async (t) => {
  const orders = [
    { id: 'a1', customerId: 'c1', amount: 100, items: [{ name: 'جلابية' }] },
    { id: 'a2', customerId: 'c1', amount: 200, items: [{ name: 'جلابية' }] },
    { id: 'a3', customerId: 'c1', amount: 50, items: [{ name: 'طقية' }] },
  ];
  let g = groupOrders(orders, { sameTypeOnly: true });
  await t.test('1. نفس النوع: مجموعة واحدة (جلابيتان)', g.length === 1 && g[0].orders.length === 2 && g[0].totalAmount === 300);
  g = groupOrders(orders, { sameTypeOnly: false });
  await t.test('2. بلا شرط النوع: كل طلبات العميل (3) في مجموعة «متنوعة»', g.length === 1 && g[0].orders.length === 3 && g[0].type === 'متنوعة');
  await t.test('3. بلا خيارات = السلوك القديم (نفس النوع)', groupOrders(orders)[0].orders.length === 2);

  await t.test('4. قياسان متقاربان بـ 2 سم', sizesSimilar({ chest: 100, waist: 90 }, { chest: 101, waist: 92 }, 2));
  await t.test('5. فرق أكبر من التقارب = غير متشابه', !sizesSimilar({ chest: 100, waist: 90 }, { chest: 104, waist: 90 }, 2));
  await t.test('6. حقل مشترك واحد لا يكفي (بيانات ناقصة)', !sizesSimilar({ chest: 100 }, { chest: 100, waist: 90 }, 2));
  await t.test('7. قيم فارغة/غير رقمية تُتجاهل', !sizesSimilar({ chest: '', waist: 'x' }, { chest: 100, waist: 90 }, 2));

  const cm = {
    c1: { measurements: { chest: 100, waist: 90, length: 150 } },
    c2: { measurements: { chest: 101, waist: 91, length: 151 } },
    c3: { measurements: { chest: 120, waist: 110, length: 160 } },
    c4: {},
  };
  const os = [
    { id: 'o1', customerId: 'c1', amount: 100, items: [{ name: 'جلابية' }] },
    { id: 'o2', customerId: 'c2', amount: 120, items: [{ name: 'جلابية' }] },
    { id: 'o3', customerId: 'c3', amount: 90, items: [{ name: 'جلابية' }] },
    { id: 'o4', customerId: 'c2', amount: 80, items: [{ name: 'عباية' }] },
    { id: 'o5', customerId: 'c4', amount: 80, items: [{ name: 'جلابية' }] },
  ];
  const typeOf = (o) => o.items[0].name;
  const cl = clusterBySize(os, cm, 2, typeOf, true);
  await t.test('8. عميلان بقياسات متقاربة ونفس النوع = مجموعة واحدة (o1,o2) بإجمالي 220',
    cl.length === 1 && cl[0].customers.length === 2 && cl[0].orders.map((o) => o.id).sort().join() === 'o1,o2' && cl[0].totalAmount === 220);
  await t.test('9. القياسات البعيدة (c3) وغياب القياسات (c4) والنوع المختلف (o4) خارج المجموعة',
    !cl[0].orders.some((o) => ['o3', 'o4', 'o5'].includes(o.id)));
  await t.test('10. تقارب أوسع (25 سم) يضم c3 أيضاً', clusterBySize(os, cm, 25, typeOf, true)[0].customers.length === 3);
  await t.test('11. بلا شرط النوع: o4 (عباية) يدخل مع قياسات c2', clusterBySize(os, cm, 2, typeOf, false)[0].orders.some((o) => o.id === 'o4'));
  await t.test('12. عميل واحد لا يُكوّن مجموعة، ومدخلات تالفة لا تُسقط',
    clusterBySize([os[0]], cm, 2, typeOf).length === 0 && clusterBySize(null, null, 2, typeOf).length === 0);
});
