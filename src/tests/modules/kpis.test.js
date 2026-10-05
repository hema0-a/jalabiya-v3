/* ==========================================================================
   kpis.test.js — اختبارات مؤشرات الأداء
   ==========================================================================
   8 اختبارات: services/kpis-calculator
   ========================================================================== */

import { register } from '../registry.js';
import {
  getPeriodRange,
  calculatePerformanceScore,
  invalidateCache,
  getKpisData,
} from '../../services/kpis-calculator.js';

register('services/kpis-calculator.js', async (t) => {
  /* 1. getPeriodRange month */
  const r1 = getPeriodRange('month');
  await t.test('1. getPeriodRange month → valid range',
    typeof r1.startMs === 'number' &&
    typeof r1.endMs === 'number' &&
    r1.endMs > r1.startMs);

  /* 2. getPeriodRange all */
  const r2 = getPeriodRange('all');
  await t.test('2. getPeriodRange all → starts at 0',
    r2.startMs === 0 && r2.endMs > Date.now());

  /* 3. 6months > 3months */
  const r3a = getPeriodRange('3months');
  const r3b = getPeriodRange('6months');
  await t.test('3. 6months starts earlier than 3months',
    r3b.startMs < r3a.startMs);

  /* 4. performance perfect */
  const p1 = calculatePerformanceScore({
    onTimeRate: 95,
    collectionRate: 95,
    deliveryRate: 85,
    avgOrderValue: 3000,
  });
  await t.test('4. performance perfect = 100',
    p1.score === 100 && p1.level === 'ممتاز' && p1.stars === 5);

  /* 5. performance bad */
  const p2 = calculatePerformanceScore({
    onTimeRate: 0,
    collectionRate: 0,
    deliveryRate: 0,
    avgOrderValue: 0,
  });
  await t.test('5. performance bad = 0',
    p2.score === 0 && p2.stars === 1);

  /* 6. performance medium */
  const p3 = calculatePerformanceScore({
    onTimeRate: 75,
    collectionRate: 75,
    deliveryRate: 55,
    avgOrderValue: 1500,
  });
  await t.test('6. performance medium in 40-80',
    p3.score >= 40 && p3.score <= 80);

  /* 7. best/worst from ratios */
  const p4 = calculatePerformanceScore({
    onTimeRate: 90,
    collectionRate: 60,
    deliveryRate: 40,
    avgOrderValue: 500,
  });
  await t.test('7. best/worst picked from ratios',
    p4.best.value === 90 &&
    p4.worst.value === 40 &&
    p4.best.label === 'التسليم في الموعد' &&
    p4.worst.label === 'نسبة التسليم');

  /* 8. invalidateCache + getKpisData works */
  invalidateCache();
  const data = await getKpisData('month');
  await t.test('8. getKpisData returns object with summary',
    data && typeof data === 'object' &&
    'summary' in data &&
    'kpis' in data &&
    'performance' in data);
});
