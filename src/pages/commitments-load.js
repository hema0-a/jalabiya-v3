/* ==========================================================================
   commitments-load.js — تحميل بيانات صفحة المالية الشخصية (v3.5.10)
   ========================================================================== */

import { savingsGoals } from '../data/repos/savings-goals.js';
import { settings } from '../data/repos/settings.js';
import { normalizePersonalControls } from '../services/daily-need.js';
import {
  getCommitmentsStats,
  getCommitmentsWithPayments,
} from '../services/commitments-calculator.js';

/* ==========================================================================
   1. تحميل البيانات
   ========================================================================== */

export async function loadData(state) {
  const [stats, withPayments, goals, st] = await Promise.all([
    getCommitmentsStats(),
    getCommitmentsWithPayments(),
    savingsGoals.listWithProgress(),
    settings.get().catch(() => ({})),
  ]);
  state.hardMonth = normalizePersonalControls(st && st.personalControls).hardMonth;   /* v3.11.0 */
  state.stats = stats;
  state.withPayments = withPayments;
  state.goals = goals;
}
