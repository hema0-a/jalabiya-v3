/* ==========================================================================
   audit-3315.test.js — اختبارات انحدار لإصلاحات الفحص الشامل v3.3.15
   ========================================================================== */

import { register } from '../registry.js';
import { toNonNegative } from '../../core/utils.js';
import { computeTotals } from '../../pages/orders.js';
import { createSalesBarChart, createOrdersDonutChart, createFinanceChart } from '../../ui/dashboard-charts.js';

const textsOf = (node) => Array.from(node.querySelectorAll('text')).map((x) => x.textContent);

register('audit v3.3.15 chart labels', async (t) => {
  const bar = createSalesBarChart([
    { label: 'سبت', value: 120 }, { label: 'أحد', value: 40 }, { label: 'إثنين', value: 0 },
  ]);
  const barTexts = textsOf(bar);
  await t.test('1. الرسم العمودي: كل عناصر النص غير فارغة', barTexts.length > 0 && barTexts.every((x) => x.trim() !== ''));
  await t.test('2. الرسم العمودي: تسميات الأيام ظاهرة', barTexts.includes('سبت') && barTexts.includes('أحد'));

  const donut = createOrdersDonutChart({ pending: 2, delivered: 1 });
  const donutTexts = textsOf(donut);
  await t.test('3. الرسم الدائري: إجمالي الطلبات يظهر (3)', donutTexts.includes('3') && donutTexts.includes('طلب'));

  const donutEmpty = createOrdersDonutChart({});
  await t.test('4. الرسم الدائري الفارغ: رسالة «لا توجد طلبات»', textsOf(donutEmpty).includes('لا توجد طلبات'));

  const barEmpty = createSalesBarChart([]);
  await t.test('5. الرسم العمودي الفارغ: رسالة عدم وجود مبيعات', textsOf(barEmpty).some((x) => x.includes('لا توجد مبيعات')));

  const fin = createFinanceChart({ revenue: 1000, expenses: 400, profit: 600 });
  const finTexts = textsOf(fin);
  await t.test('6. الرسم المالي: كل النصوص غير فارغة وتشمل التسميات',
    finTexts.length > 0 && finTexts.every((x) => x.trim() !== '') && finTexts.includes('إيرادات') && finTexts.includes('ربح'));

  const evil = createSalesBarChart([{ label: '<img src=x onerror=alert(1)>', value: 5 }]);
  await t.test('7. التسمية الخبيثة تُعرض كنص خالص (لا عناصر مُحقنة)',
    evil.querySelectorAll('img').length === 0 && textsOf(evil).some((x) => x.includes('<img')));
});

register('audit v3.3.15 non-negative inputs', async (t) => {
  await t.test('1. toNonNegative: سالب → 0', toNonNegative(-500) === 0);
  await t.test('2. toNonNegative: نص غير رقمي/فارغ/null → 0', toNonNegative('abc') === 0 && toNonNegative('') === 0 && toNonNegative(null) === 0);
  await t.test('3. toNonNegative: Infinity/NaN → 0', toNonNegative(Infinity) === 0 && toNonNegative(NaN) === 0);
  await t.test('4. toNonNegative: قيمة صحيحة تُحفظ كما هي', toNonNegative('12.5') === 12.5 && toNonNegative(7) === 7);

  const neg = computeTotals([{ price: -300, quantity: -2 }], 'none', 0, []);
  await t.test('5. computeTotals: سعر وكمية سالبان لا يُنتجان مبلغاً موجباً', neg.subtotal === 0 && neg.amount === 0);

  const pct = computeTotals([{ price: 100, quantity: 2 }], 'percent', 250, []);
  await t.test('6. computeTotals: خصم نسبة >100% لا يجعل المبلغ سالباً', pct.discountAmount === 200 && pct.amount === 0);

  const negDisc = computeTotals([{ price: 100, quantity: 1 }], 'fixed', -50, []);
  await t.test('7. computeTotals: خصم سالب لا يرفع السعر', negDisc.discountAmount === 0 && negDisc.amount === 100);

  const negFee = computeTotals([{ price: 100, quantity: 1 }], 'none', 0, [{ type: 'fixed', value: -40 }]);
  await t.test('8. computeTotals: رسوم إضافية سالبة تُتجاهل', negFee.extraFeesTotal === 0 && negFee.amount === 100);

  const ok = computeTotals([{ price: 500, quantity: 2 }], 'percent', 10, [{ type: 'fixed', value: 50 }]);
  await t.test('9. computeTotals: الحالة الطبيعية سليمة (1000 − 100 + 50 = 950)', ok.subtotal === 1000 && ok.discountAmount === 100 && ok.amount === 950);
});
