/* ==========================================================================
   pricing.test.js — اختبارات حاسبة التسعير
   ==========================================================================
   8 اختبارات: pages/pricing-calculator
   ========================================================================== */

import { register } from '../registry.js';
import { computePricing } from '../../pages/pricing-calculator.js';

register('pages/pricing-calculator.js', async (t) => {
  const allEnabled = {
    enableFabric: true,
    enableLabor: true,
    enableExtras: true,
    enableOverhead: true,
  };

  /* 1. حساب بسيط */
  const r1 = computePricing(
    { meters: 3, meterPrice: 30, hours: 2, hourlyRate: 20, extras: 40, overhead: 10, margin: 30 },
    allEnabled
  );
  await t.test('1. basic calculation',
    r1.fabricCost === 90 &&
    r1.laborCost === 40 &&
    r1.extrasCost === 40 &&
    r1.overheadCost === 10 &&
    r1.totalCost === 180 &&
    r1.profit === 54 &&
    r1.sellingPrice === 234);

  /* 2. حساب معقد (جلابية مطرزة) */
  const r2 = computePricing(
    { meters: 5, meterPrice: 50, hours: 10, hourlyRate: 25, extras: 100, overhead: 50, margin: 50 },
    allEnabled
  );
  await t.test('2. complex calculation',
    r2.fabricCost === 250 &&
    r2.laborCost === 250 &&
    r2.extrasCost === 100 &&
    r2.overheadCost === 50 &&
    r2.totalCost === 650 &&
    r2.profit === 325 &&
    r2.sellingPrice === 975);

  /* 3. تعطيل حساب القماش */
  const r3 = computePricing(
    { meters: 3, meterPrice: 30, hours: 2, hourlyRate: 20, extras: 0, overhead: 0, margin: 0 },
    { enableFabric: false, enableLabor: true, enableExtras: true, enableOverhead: true }
  );
  await t.test('3. disable fabric → fabricCost=0',
    r3.fabricCost === 0 &&
    r3.laborCost === 40 &&
    r3.totalCost === 40);

  /* 4. تعطيل حساب العمال */
  const r4 = computePricing(
    { meters: 3, meterPrice: 30, hours: 2, hourlyRate: 20, extras: 0, overhead: 0, margin: 0 },
    { enableFabric: true, enableLabor: false, enableExtras: true, enableOverhead: true }
  );
  await t.test('4. disable labor → laborCost=0',
    r4.laborCost === 0 &&
    r4.fabricCost === 90 &&
    r4.totalCost === 90);

  /* 5. تعطيل الإضافات وغير المباشرة */
  const r5 = computePricing(
    { meters: 0, meterPrice: 0, hours: 0, hourlyRate: 0, extras: 100, overhead: 200, margin: 0 },
    { enableFabric: true, enableLabor: true, enableExtras: false, enableOverhead: false }
  );
  await t.test('5. disable extras + overhead → both = 0',
    r5.extrasCost === 0 &&
    r5.overheadCost === 0 &&
    r5.totalCost === 0);

  /* 6. هامش ربح = 0 → السعر = التكلفة */
  const r6 = computePricing(
    { meters: 2, meterPrice: 50, hours: 0, hourlyRate: 0, extras: 0, overhead: 0, margin: 0 },
    allEnabled
  );
  await t.test('6. margin=0 → price = cost',
    r6.totalCost === 100 &&
    r6.profit === 0 &&
    r6.sellingPrice === 100);

  /* 7. هامش ربح = 100% → السعر = ضعف التكلفة */
  const r7 = computePricing(
    { meters: 2, meterPrice: 50, hours: 0, hourlyRate: 0, extras: 0, overhead: 0, margin: 100 },
    allEnabled
  );
  await t.test('7. margin=100 → price = 2×cost',
    r7.totalCost === 100 &&
    r7.profit === 100 &&
    r7.sellingPrice === 200);

  /* 8. قيم null/undefined → لا كسر */
  const r8 = computePricing(
    { meters: null, meterPrice: undefined, hours: '', hourlyRate: 'abc', extras: NaN, overhead: null, margin: null },
    allEnabled
  );
  await t.test('8. null/undefined → all zeros',
    r8.fabricCost === 0 &&
    r8.laborCost === 0 &&
    r8.extrasCost === 0 &&
    r8.overheadCost === 0 &&
    r8.totalCost === 0 &&
    r8.profit === 0 &&
    r8.sellingPrice === 0);
});
