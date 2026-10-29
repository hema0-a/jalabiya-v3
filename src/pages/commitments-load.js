/* ==========================================================================
   commitments-load.js — تحميل بيانات صفحة المالية الشخصية (v3.5.10)
   ========================================================================== */

import { savingsGoals } from '../data/repos/savings-goals.js';
import {
  getCommitmentsStats,
  getCommitmentsWithPayments,
} from '../services/commitments-calculator.js';

/* ==========================================================================
   1. تحميل البيانات
   ========================================================================== */

export async function loadData(state) {
  const [stats, withPayments, goals] = await Promise.all([
    getCommitmentsStats(),
    getCommitmentsWithPayments(),
    savingsGoals.listWithProgress(),
  ]);
  state.stats = stats;
  state.withPayments = withPayments;
  state.goals = goals;
}
