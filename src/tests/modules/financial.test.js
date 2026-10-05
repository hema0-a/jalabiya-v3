/* ==========================================================================
   financial.test.js — اختبارات المركز المالي
   ==========================================================================
   7 اختبارات: services/financial-calculator
   ========================================================================== */

import { register } from '../registry.js';
import {
  getPeriodRange,
  calculateHealthScore,
  invalidateCache,
} from '../../services/financial-calculator.js';

register('services/financial-calculator.js', async (t) => {
  const r1 = getPeriodRange('month');
  await t.test('1. getPeriodRange month → valid range',
    typeof r1.startMs === 'number' && typeof r1.endMs === 'number' && r1.endMs > r1.startMs);

  const r2 = getPeriodRange('all');
  await t.test('2. getPeriodRange all → starts at 0',
    r2.startMs === 0 && r2.endMs > Date.now());

  const r3a = getPeriodRange('3months');
  const r3b = getPeriodRange('6months');
  await t.test('3. 6months range starts earlier than 3months',
    r3b.startMs < r3a.startMs);

  const h1 = calculateHealthScore({
    profitMargin: 50,
    collectionRate: 95,
    topCategoryPercent: 20,
    revenueGrowthPercent: 25,
  });
  await t.test('4. health score perfect = 100',
    h1.score === 100 && h1.level === 'ممتاز' && h1.stars === 5);

  const h2 = calculateHealthScore({
    profitMargin: -10,
    collectionRate: 0,
    topCategoryPercent: 90,
    revenueGrowthPercent: -20,
  });
  await t.test('5. health score bad = low',
    h2.score <= 20 && h2.stars <= 2);

  const h3 = calculateHealthScore({
    profitMargin: 20,
    collectionRate: 65,
    topCategoryPercent: 50,
    revenueGrowthPercent: 5,
  });
  await t.test('6. health score medium in 40-80',
    h3.score >= 40 && h3.score <= 80);

  let err = false;
  try { invalidateCache(); } catch { err = true; }
  await t.test('7. invalidateCache works without error', !err);
});
