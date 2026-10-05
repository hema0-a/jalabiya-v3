/* ==========================================================================
   house-expenses.test.js — اختبارات مصاريف البيت
   ==========================================================================
   8 اختبارات: repo + service
   ========================================================================== */

import { register } from '../registry.js';
import {
  houseExpenses,
  getPeriodRange,
} from '../../data/repos/house-expenses.js';

register('data/repos/house-expenses.js', async (t) => {
  /* تنظيف */
  await houseExpenses.clear();

  /* 1. getPeriodRange month */
  const r1 = getPeriodRange('month');
  await t.test('1. getPeriodRange month → valid range',
    typeof r1.fromMs === 'number' &&
    typeof r1.toMs === 'number' &&
    r1.toMs > r1.fromMs);

  /* 2. getPeriodRange year */
  const r2 = getPeriodRange('year');
  await t.test('2. getPeriodRange year → valid range',
    r2.toMs > r2.fromMs);

  /* 3. getPeriodRange all */
  const r3 = getPeriodRange('all');
  await t.test('3. getPeriodRange all → starts at 0',
    r3.fromMs === 0 && r3.toMs > Date.now());

  /* 4. create + list + listByCategory */
  const now = Date.now();
  await houseExpenses.create({ category: 'food', amount: 100, date: now, note: 'بقالة' });
  await houseExpenses.create({ category: 'food', amount: 50, date: now, note: 'خضار' });
  await houseExpenses.create({ category: 'transport', amount: 30, date: now, note: 'تاكسي' });

  const foodList = await houseExpenses.listByCategory('food');
  await t.test('4. listByCategory food → 2',
    foodList.length === 2);

  /* 5. searchByQuery */
  const search = await houseExpenses.searchByQuery('بقالة');
  await t.test('5. searchByQuery بقالة → 1',
    search.length === 1 && search[0].note === 'بقالة');

  /* 6. searchByQuery by category label */
  const searchCat = await houseExpenses.searchByQuery('مواصلات');
  await t.test('6. searchByQuery by category label → 1',
    searchCat.length === 1 && searchCat[0].category === 'transport');

  /* 7. getStats */
  const stats = await houseExpenses.getStats('month');
  await t.test('7. getStats month → totals correct',
    stats.total === 180 && stats.count === 3 && stats.avg === 60);

  /* 8. getCategoryStats */
  const catStats = await houseExpenses.getCategoryStats('month');
  await t.test('8. getCategoryStats sorted desc',
    catStats.length === 2 &&
    catStats[0].id === 'food' &&
    catStats[0].amount === 150);

  /* تنظيف */
  await houseExpenses.clear();
});
