/* ==========================================================================
   commitments-calculator.js — حسابات المالية الشخصية
   ==========================================================================
   - getMonthlyEquivalent: تحويل الدورية إلى معادل شهري.
   - getCommitmentPaidThisMonth: المدفوع هذا الشهر لكل التزام.
   - getCommitmentsStats: إحصائيات الالتزامات والأهداف.
   - getHealthScore: مؤشر الصحة (4 معايير × 25 نقطة).
   - getSmartAlerts: تنبيهات ذكية.
   ========================================================================== */

import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { savingsGoals } from '../data/repos/savings-goals.js';
import { COMMITMENT_FREQUENCIES, COMMITMENT_CATEGORIES } from '../core/config.js';

/* ==========================================================================
   1. Cache
   ========================================================================== */
const _cache = new Map();
let _dataHash = 0;

export function invalidateCache() {
  _cache.clear();
  _dataHash++;
}

/* ==========================================================================
   2. أدوات
   ========================================================================== */
function sum(arr) {
  return arr.reduce((s, x) => s + (Number(x) || 0), 0);
}

function safeDiv(a, b, fallback = 0) {
  const n = Number(b);
  if (!isFinite(n) || n === 0) return fallback;
  return (Number(a) || 0) / n;
}

const FREQ_MAP = {};
COMMITMENT_FREQUENCIES.forEach((f) => { FREQ_MAP[f.id] = f; });

const CAT_MAP = {};
COMMITMENT_CATEGORIES.forEach((c) => { CAT_MAP[c.id] = c; });

export { CAT_MAP as COMMITMENT_CAT_MAP, FREQ_MAP as COMMITMENT_FREQ_MAP };

/* ==========================================================================
   3. getMonthlyEquivalent
   ========================================================================== */

/**
 * حساب المعادل الشهري للالتزام حسب الدورية.
 * @param {Object} commitment
 * @returns {number}
 */
export function getMonthlyEquivalent(commitment) {
  const amount = Number(commitment?.amount) || 0;
  const freq = commitment?.frequency || 'monthly';
  switch (freq) {
    case 'monthly':     return amount;
    case 'quarterly':   return amount / 3;
    case 'semi_annual': return amount / 6;
    case 'annual':      return amount / 12;
    case 'weekly':      return amount * 4.33;
    case 'once':        return 0;
    default:            return amount;
  }
}

/* ==========================================================================
   4. getCommitmentPaidThisMonth
   ========================================================================== */

/**
 * مجموع المدفوع لالتزام معيّن في الشهر الحالي.
 * @param {string} commitmentId
 * @param {Array} paymentsList - قائمة الدفعات (لتحسين الأداء)
 * @returns {number}
 */
export function getCommitmentPaidThisMonth(commitmentId, paymentsList) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 1).getTime();
  return sum(
    paymentsList
      .filter((p) => p.commitmentId === commitmentId)
      .filter((p) => p.date && p.date >= start && p.date < end)
      .map((p) => p.amount)
  );
}

/* ==========================================================================
   5. getCommitmentsStats
   ========================================================================== */

/**
 * إحصائيات شاملة للالتزامات والأهداف.
 * @returns {Promise<Object>}
 */
export async function getCommitmentsStats() {
  const key = 'stats_' + _dataHash;
  if (_cache.has(key)) return _cache.get(key);

  const [commitmentsList, paymentsList, goalsList] = await Promise.all([
    commitments.list(),
    commitmentPayments.list(),
    savingsGoals.list(),
  ]);

  const activeCommitments = commitmentsList.filter((c) => c.active !== false);

  /* الإجمالي الشهري المتوقع */
  const totalMonthlyExpected = activeCommitments
    .reduce((s, c) => s + getMonthlyEquivalent(c), 0);

  /* المدفوع هذا الشهر */
  let totalPaidThisMonth = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  const today = new Date();
  const todayDay = today.getDate();

  activeCommitments.forEach((c) => {
    const expected = getMonthlyEquivalent(c);
    const paid = getCommitmentPaidThisMonth(c.id, paymentsList);
    totalPaidThisMonth += paid;

    if (paid >= expected && expected > 0) {
      paidCount++;
    } else if (c.dueDay && c.dueDay < todayDay && paid < expected) {
      overdueCount++;
    } else {
      pendingCount++;
    }
  });

  const totalRemaining = Math.max(0, totalMonthlyExpected - totalPaidThisMonth);

  /* الأهداف */
  const goalsWithProgress = goalsList.map((g) => {
    const target = Number(g.targetAmount) || 0;
    const current = Number(g.currentAmount) || 0;
    const progressPercent = target > 0
      ? Math.min(100, Math.round((current / target) * 100))
      : 0;
    const remaining = Math.max(0, target - current);
    return { ...g, progressPercent, remaining };
  });

  const totalGoalTarget = sum(goalsList.map((g) => g.targetAmount));
  const totalGoalCurrent = sum(goalsList.map((g) => g.currentAmount));

  const result = {
    totalMonthlyExpected,
    totalPaidThisMonth,
    totalRemaining,
    paidCount,
    pendingCount,
    overdueCount,
    commitmentsCount: activeCommitments.length,
    goals: goalsWithProgress,
    goalsCount: goalsList.length,
    totalGoalTarget,
    totalGoalCurrent,
    totalGoalRemaining: Math.max(0, totalGoalTarget - totalGoalCurrent),
    hasData: commitmentsList.length > 0 || goalsList.length > 0,
  };

  _cache.set(key, result);
  return result;
}

/* ==========================================================================
   6. getHealthScore
   ========================================================================== */

/**
 * حساب مؤشر صحة الالتزامات (0-100).
 * 4 معايير × 25 نقطة.
 * @param {Object} stats - نتيجة getCommitmentsStats
 * @returns {{score:number, level:string, stars:number}}
 */
export function getHealthScore(stats) {
  if (!stats || !stats.hasData) {
    return { score: 0, level: 'لا توجد بيانات', stars: 1 };
  }

  let score = 0;
  const total = stats.commitmentsCount;

  /* 1. نسبة الالتزامات المدفوعة (0-25) */
  const paidRatio = total > 0 ? (stats.paidCount / total) * 100 : 0;
  if (paidRatio >= 90) score += 25;
  else if (paidRatio >= 75) score += 20;
  else if (paidRatio >= 60) score += 15;
  else if (paidRatio >= 40) score += 10;
  else if (paidRatio > 0) score += 5;

  /* 2. نسبة المدفوع من الإجمالي (0-25) */
  const paidPercent = safeDiv(stats.totalPaidThisMonth * 100, stats.totalMonthlyExpected, 0);
  if (paidPercent >= 90) score += 25;
  else if (paidPercent >= 75) score += 20;
  else if (paidPercent >= 50) score += 15;
  else if (paidPercent >= 25) score += 10;
  else if (paidPercent > 0) score += 5;

  /* 3. غياب المتأخرات (0-25) */
  if (stats.overdueCount === 0) score += 25;
  else if (stats.overdueCount === 1) score += 15;
  else if (stats.overdueCount === 2) score += 10;
  else if (stats.overdueCount <= 4) score += 5;

  /* 4. وجود أهداف ادخار (0-25) */
  if (stats.goalsCount === 0) score += 10;
  else {
    const goalPercent = safeDiv(stats.totalGoalCurrent * 100, stats.totalGoalTarget, 0);
    if (goalPercent >= 50) score += 25;
    else if (goalPercent >= 25) score += 20;
    else if (goalPercent >= 10) score += 15;
    else score += 10;
  }

  let level = 'يحتاج تحسين', stars = 1;
  if (score >= 80) { level = 'ممتاز'; stars = 5; }
  else if (score >= 60) { level = 'جيد'; stars = 4; }
  else if (score >= 40) { level = 'متوسط'; stars = 3; }
  else if (score >= 20) { stars = 2; }

  return { score, level, stars };
}

/* ==========================================================================
   7. getSmartAlerts
   ========================================================================== */

/**
 * تنبيهات ذكية عن الالتزامات.
 * @param {Object} stats - نتيجة getCommitmentsStats
 * @param {Array} commitmentsList
 * @returns {Array<{type:string, icon:string, text:string}>}
 */
export function getSmartAlerts(stats, commitmentsList) {
  const alerts = [];
  const today = new Date();
  const todayDay = today.getDate();

  /* متأخرات */
  if (stats.overdueCount > 0) {
    alerts.push({
      type: 'critical',
      icon: '🔴',
      text: stats.overdueCount + ' التزام متأخر — راجع دفعاتك',
    });
  }

  /* استحقاق قريب (خلال 3 أيام) */
  commitmentsList
    .filter((c) => c.active !== false && c.dueDay)
    .forEach((c) => {
      const diff = c.dueDay - todayDay;
      if (diff >= 0 && diff <= 3) {
        const cat = CAT_MAP[c.category] || CAT_MAP.other;
        alerts.push({
          type: 'warning',
          icon: '🟠',
          text: cat.icon + ' ' + c.name + ' يستحق ' +
            (diff === 0 ? 'اليوم' : 'خلال ' + diff + ' يوم'),
        });
      }
    });

  /* استحقاق اليوم */
  commitmentsList
    .filter((c) => c.active !== false && c.dueDay === todayDay)
    .forEach((c) => {
      const exists = alerts.some((a) => a.text.includes(c.name));
      if (!exists) {
        alerts.push({
          type: 'warning',
          icon: '🟠',
          text: '📅 ' + c.name + ' يستحق اليوم',
        });
      }
    });

  /* إيجابي: أداء جيد */
  const total = stats.commitmentsCount;
  if (total > 0 && stats.paidCount === total && stats.overdueCount === 0) {
    alerts.push({
      type: 'success',
      icon: '🟢',
      text: 'ممتاز! كل التزاماتك مدفوعة هذا الشهر',
    });
  }

  /* معلومات: أهداف الادخار */
  if (stats.goalsCount > 0) {
    const goalPercent = safeDiv(stats.totalGoalCurrent * 100, stats.totalGoalTarget, 0);
    if (goalPercent >= 75) {
      alerts.push({
        type: 'success',
        icon: '🟢',
        text: '🎯 اقتربت من تحقيق أهدافك (' + Math.round(goalPercent) + '%)',
      });
    } else {
      alerts.push({
        type: 'info',
        icon: 'ℹ️',
        text: '🏦 تقدم أهدافك: ' + Math.round(goalPercent) + '%',
      });
    }
  }

  const order = { critical: 0, warning: 1, success: 2, info: 3 };
  alerts.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));

  return alerts.slice(0, 6);
}

/* ==========================================================================
   8. getCommitmentsWithPayments
   ========================================================================== */

/**
 * جلب كل الالتزامات مع بيانات الدفع هذا الشهر.
 * @returns {Promise<Array>}
 */
export async function getCommitmentsWithPayments() {
  const [commitmentsList, paymentsList] = await Promise.all([
    commitments.list(),
    commitmentPayments.list(),
  ]);

  return commitmentsList.map((c) => {
    const monthlyEquiv = getMonthlyEquivalent(c);
    const paidThisMonth = getCommitmentPaidThisMonth(c.id, paymentsList);
    const remaining = Math.max(0, monthlyEquiv - paidThisMonth);
    const progressPercent = monthlyEquiv > 0
      ? Math.min(100, Math.round((paidThisMonth / monthlyEquiv) * 100))
      : 0;

    return {
      ...c,
      monthlyEquivalent: monthlyEquiv,
      paidThisMonth,
      remaining,
      progressPercent,
    };
  });
}
