/* ==========================================================================
   commitments.test.js — اختبارات المالية الشخصية
   ==========================================================================
   8 اختبارات: services/commitments-calculator
   ========================================================================== */

import { register } from '../registry.js';
import {
  getMonthlyEquivalent,
  getCommitmentPaidThisMonth,
  getHealthScore,
  invalidateCache,
} from '../../services/commitments-calculator.js';

register('services/commitments-calculator.js', async (t) => {
  /* 1. monthly → same amount */
  await t.test('1. getMonthlyEquivalent monthly',
    getMonthlyEquivalent({ amount: 1500, frequency: 'monthly' }) === 1500);

  /* 2. quarterly → amount / 3 */
  await t.test('2. getMonthlyEquivalent quarterly',
    getMonthlyEquivalent({ amount: 3000, frequency: 'quarterly' }) === 1000);

  /* 3. annual → amount / 12 */
  await t.test('3. getMonthlyEquivalent annual',
    getMonthlyEquivalent({ amount: 12000, frequency: 'annual' }) === 1000);

  /* 4. weekly → amount * 4.33 */
  const weekly = getMonthlyEquivalent({ amount: 100, frequency: 'weekly' });
  await t.test('4. getMonthlyEquivalent weekly ≈ 433',
    Math.abs(weekly - 433) < 0.01);

  /* 5. once → 0 */
  await t.test('5. getMonthlyEquivalent once → 0',
    getMonthlyEquivalent({ amount: 5000, frequency: 'once' }) === 0);

  /* 6. null/undefined → 0 */
  await t.test('6. getMonthlyEquivalent null safe',
    getMonthlyEquivalent(null) === 0 &&
    getMonthlyEquivalent({}) === 0);

  /* 7. getCommitmentPaidThisMonth - current month only */
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime();
  const payments = [
    { commitmentId: 'c1', amount: 500, date: startOfMonth + 86400000 },
    { commitmentId: 'c1', amount: 300, date: startOfMonth + 172800000 },
    { commitmentId: 'c1', amount: 200, date: lastMonth },  // شهر سابق
    { commitmentId: 'c2', amount: 100, date: startOfMonth + 86400000 },  // التزام آخر
  ];
  await t.test('7. getCommitmentPaidThisMonth filters correctly',
    getCommitmentPaidThisMonth('c1', payments) === 800 &&
    getCommitmentPaidThisMonth('c2', payments) === 100 &&
    getCommitmentPaidThisMonth('c3', payments) === 0);

  /* 8. getHealthScore - empty stats */
  const h = getHealthScore(null);
  await t.test('8. getHealthScore null → score 0',
    h.score === 0 && h.level === 'لا توجد بيانات');

  /* 9. getHealthScore - perfect */
  const perfect = getHealthScore({
    hasData: true,
    commitmentsCount: 5,
    paidCount: 5,
    pendingCount: 0,
    overdueCount: 0,
    totalPaidThisMonth: 5000,
    totalMonthlyExpected: 5000,
    goalsCount: 2,
    totalGoalCurrent: 3000,
    totalGoalTarget: 5000,
  });
  await t.test('9. getHealthScore perfect → 100',
    perfect.score === 100 && perfect.level === 'ممتاز');

  /* 10. invalidateCache works */
  let err = false;
  try { invalidateCache(); } catch { err = true; }
  await t.test('10. invalidateCache no error', !err);
});
