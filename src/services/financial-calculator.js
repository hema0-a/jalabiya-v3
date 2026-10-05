/* ==========================================================================
   financial-calculator.js — حسابات المركز المالي
   ==========================================================================
   - يحسب كل مؤشرات المركز المالي.
   - Cache داخلي حسب الفترة (يُبطَل بـ invalidateCache).
   - حماية كاملة من القسمة على صفر.
   ========================================================================== */

import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { orders } from '../data/repos/orders.js';
import { inventory } from '../data/repos/inventory.js';
import { MONTH_NAMES } from '../core/config.js';
import { formatEGP } from '../core/utils.js';

/* ==========================================================================
   1. Cache
   ========================================================================== */
const _cache = new Map();
let _dataHash = 0;

/** إبطال الكاش (يُستدعى عند تغيير أي بيانات) */
export function invalidateCache() {
  _cache.clear();
  _dataHash++;
}

/* ==========================================================================
   2. أدوات مساعدة
   ========================================================================== */
function sum(arr) {
  return arr.reduce((s, x) => s + (Number(x) || 0), 0);
}

function safeDiv(a, b, fallback = 0) {
  const n = Number(b);
  if (!isFinite(n) || n === 0) return fallback;
  return (Number(a) || 0) / n;
}

function startOfMonth(y, m) {
  return new Date(y, m, 1, 0, 0, 0, 0).getTime();
}

/**
 * نطاق الفترة المطلوبة.
 * @param {'month'|'3months'|'6months'|'year'|'all'} period
 * @returns {{startMs:number, endMs:number}}
 */
export function getPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'month')   return { startMs: startOfMonth(y, m), endMs: startOfMonth(y, m + 1) };
  if (period === '3months') return { startMs: startOfMonth(y, m - 2), endMs: startOfMonth(y, m + 1) };
  if (period === '6months') return { startMs: startOfMonth(y, m - 5), endMs: startOfMonth(y, m + 1) };
  if (period === 'year')    return { startMs: startOfMonth(y, 0), endMs: startOfMonth(y + 1, 0) };
  return { startMs: 0, endMs: Date.now() + 86400000 };
}

/* ==========================================================================
   3. الصحة المالية
   ========================================================================== */

/**
 * حساب درجة الصحة المالية (0-100).
 * @param {Object} stats - {profitMargin, collectionRate, topCategoryPercent, revenueGrowthPercent}
 * @returns {{score:number, level:string, stars:number}}
 */
export function calculateHealthScore(stats) {
  /* فحص "لا بيانات" — لا يعطي نقاطاً وهمية */
  const hasData =
    Number(stats.profitMargin) !== 0 ||
    Number(stats.collectionRate) !== 0 ||
    Number(stats.topCategoryPercent) !== 0 ||
    Number(stats.revenueGrowthPercent) !== 0;

  if (!hasData) {
    return {
      score: 0,
      level: 'يحتاج تحسين',
      stars: 1,
      breakdown: { margin: 0, collection: 0, topCategoryPercent: 0, growth: 0 },
    };
  }

  let score = 0;

  const margin = Number(stats.profitMargin) || 0;
  if (margin >= 40) score += 25;
  else if (margin >= 25) score += 20;
  else if (margin >= 15) score += 15;
  else if (margin >= 5) score += 10;
  else if (margin > 0) score += 5;

  const coll = Number(stats.collectionRate) || 0;
  if (coll >= 90) score += 25;
  else if (coll >= 75) score += 20;
  else if (coll >= 60) score += 15;
  else if (coll >= 40) score += 10;
  else if (coll > 0) score += 5;

  const top = Number(stats.topCategoryPercent) || 0;
  if (top === 0) score += 25;
  else if (top <= 30) score += 25;
  else if (top <= 45) score += 20;
  else if (top <= 60) score += 15;
  else if (top <= 75) score += 10;
  else score += 5;

  const growth = Number(stats.revenueGrowthPercent) || 0;
  if (growth >= 20) score += 25;
  else if (growth >= 10) score += 20;
  else if (growth >= 0) score += 15;
  else if (growth >= -10) score += 10;

  let level = 'يحتاج تحسين', stars = 1;
  if (score >= 80) { level = 'ممتاز'; stars = 5; }
  else if (score >= 60) { level = 'جيد'; stars = 4; }
  else if (score >= 40) { level = 'متوسط'; stars = 3; }
  else if (score >= 20) { stars = 2; }

  return { score, level, stars };
}

/* ==========================================================================
   4. النصائح الذكية (18 في 4 فئات)
   ========================================================================== */

function generateTips(data) {
  const tips = [];

  /* 🔴 حرجة */
  if (data.summary.netProfit < 0) {
    tips.push({ type: 'critical', icon: '🔴', text: 'خسارة! المصروفات تتجاوز الإيرادات بـ ' + formatEGP(Math.abs(data.summary.netProfit)) });
  }
  if (data.overdueOrdersCount > 0) {
    tips.push({ type: 'critical', icon: '🔴', text: data.overdueOrdersCount + ' طلب متأخر يحتاج متابعة عاجلة' });
  }
  if (data.pending.collectionRate > 0 && data.pending.collectionRate < 40) {
    tips.push({ type: 'critical', icon: '🔴', text: 'معدل التحصيل منخفض جداً (' + Math.round(data.pending.collectionRate) + '%)' });
  }
  if (data.comparison.changes.expensesChange > 50) {
    tips.push({ type: 'critical', icon: '🔴', text: 'المصروفات زادت ' + Math.round(data.comparison.changes.expensesChange) + '% عن الشهر الماضي' });
  }

  /* 🟠 متوسطة */
  if (data.summary.profitMargin > 0 && data.summary.profitMargin < 15) {
    tips.push({ type: 'warning', icon: '🟠', text: 'هامش الربح منخفض (' + Math.round(data.summary.profitMargin) + '%) — فكّر في رفع الأسعار' });
  }
  if (data.pending.collectionRate >= 40 && data.pending.collectionRate < 75) {
    tips.push({ type: 'warning', icon: '🟠', text: 'معدل التحصيل متوسط (' + Math.round(data.pending.collectionRate) + '%) — تابع المدفوعات' });
  }
  if (data.lowStockCount > 0) {
    tips.push({ type: 'warning', icon: '🟠', text: data.lowStockCount + ' صنف في المخزون يحتاج إعادة تعبئة' });
  }
  if (data.expenseCategories.length > 0 && data.expenseCategories[0].percent > 60) {
    tips.push({ type: 'warning', icon: '🟠', text: 'تركيز عالي في ' + data.expenseCategories[0].name + ' (' + Math.round(data.expenseCategories[0].percent) + '%)' });
  }

  /* 🟢 إيجابيات */
  if (data.comparison.changes.revenueChange > 10) {
    tips.push({ type: 'success', icon: '🟢', text: 'الإيرادات زادت ' + Math.round(data.comparison.changes.revenueChange) + '% عن الشهر الماضي' });
  }
  if (data.summary.profitMargin >= 30) {
    tips.push({ type: 'success', icon: '🟢', text: 'هامش ربح ممتاز (' + Math.round(data.summary.profitMargin) + '%)' });
  }
  if (data.pending.collectionRate >= 90) {
    tips.push({ type: 'success', icon: '🟢', text: 'معدل تحصيل ممتاز (' + Math.round(data.pending.collectionRate) + '%)' });
  }
  if (data.health.score >= 80) {
    tips.push({ type: 'success', icon: '🟢', text: 'الصحة المالية ممتازة — استمر!' });
  }
  const activeMonths = data.last6Months.filter((mm) => mm.revenue > 0).length;
  if (activeMonths >= 4) {
    tips.push({ type: 'success', icon: '🟢', text: 'لديك إيرادات منتظمة خلال ' + activeMonths + ' من آخر 6 شهور' });
  }

  /* ℹ️ معلومات */
  if (data.ordersStats.avgOrderValue > 0) {
    tips.push({ type: 'info', icon: 'ℹ️', text: 'متوسط قيمة الطلب: ' + formatEGP(data.ordersStats.avgOrderValue) });
  }
  if (data.expenseCategories.length > 0) {
    tips.push({ type: 'info', icon: 'ℹ️', text: 'أكبر بند مصروفات: ' + data.expenseCategories[0].name + ' (' + formatEGP(data.expenseCategories[0].amount) + ')' });
  }
  if (data.bestMonth && data.bestMonth.revenue > 0) {
    tips.push({ type: 'info', icon: 'ℹ️', text: 'أفضل شهر: ' + data.bestMonth.month + ' بـ ' + formatEGP(data.bestMonth.revenue) });
  }
  if (data.ordersStats.deliveredCount > 0) {
    tips.push({ type: 'info', icon: 'ℹ️', text: data.ordersStats.deliveredCount + ' طلب تم تسليمه في هذه الفترة' });
  }
  if (data.forecast.trend !== 0) {
    const dir = data.forecast.trend > 0 ? 'صاعدة' : 'هابطة';
    tips.push({ type: 'info', icon: 'ℹ️', text: 'الاتجاه العام ' + dir + ' بنسبة ' + Math.abs(Math.round(data.forecast.trend)) + '%' });
  }

  const order = { critical: 0, warning: 1, success: 2, info: 3 };
  tips.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  return tips.slice(0, 18);
}

/* ==========================================================================
   5. الحساب الرئيسي
   ========================================================================== */

async function computeFinancials(period) {
  const [paymentsList, expensesList, ordersList, inventoryList] = await Promise.all([
    payments.list(),
    expenses.list(),
    orders.list(),
    inventory.list().catch(() => []),
  ]);

  const { startMs, endMs } = getPeriodRange(period);
  const inRange = (ts) => ts >= startMs && ts < endMs;

  const fPayments = paymentsList.filter((p) => inRange(p.createdAt || 0));
  const fExpenses = expensesList.filter((e) => inRange(e.date || 0));
  const fOrders   = ordersList.filter((o) => inRange(o.createdAt || 0));

  const totalRevenue = sum(fPayments.map((p) => p.amount));
  const totalExpenses = sum(fExpenses.map((e) => e.amount));
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = safeDiv(netProfit * 100, totalRevenue, 0);

  const totalExpected = ordersList.filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalReceived = sum(paymentsList.map((p) => p.amount));
  const pendingPayments = Math.max(0, totalExpected - totalReceived);
  const collectionRate = safeDiv(totalReceived * 100, totalExpected, 0);

  const deliveredOrders = fOrders.filter((o) => o.status === 'delivered');
  const avgOrderValue = safeDiv(sum(fOrders.map((o) => o.amount)), fOrders.length, 0);

  /* مقارنة شهرين */
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisStart = startOfMonth(y, m);
  const prevStart = startOfMonth(y, m - 1);
  const nextStart = startOfMonth(y, m + 1);

  const filterRange = (list, key, s, e) => list.filter((x) => (x[key] || 0) >= s && (x[key] || 0) < e);

  const thisRev = sum(filterRange(paymentsList, 'createdAt', thisStart, nextStart).map((p) => p.amount));
  const prevRev = sum(filterRange(paymentsList, 'createdAt', prevStart, thisStart).map((p) => p.amount));
  const thisExp = sum(filterRange(expensesList, 'date', thisStart, nextStart).map((e) => e.amount));
  const prevExp = sum(filterRange(expensesList, 'date', prevStart, thisStart).map((e) => e.amount));
  const thisProf = thisRev - thisExp;
  const prevProf = prevRev - prevExp;

  const revenueChange = safeDiv((thisRev - prevRev) * 100, prevRev, 0);
  const expensesChange = safeDiv((thisExp - prevExp) * 100, prevExp, 0);
  const profitChange = safeDiv((thisProf - prevProf) * 100, prevProf, 0);

  /* آخر 6 شهور */
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const s = d.getTime();
    const e = new Date(y, m - i + 1, 1).getTime();
    const rev = sum(filterRange(paymentsList, 'createdAt', s, e).map((p) => p.amount));
    const exp = sum(filterRange(expensesList, 'date', s, e).map((x) => x.amount));
    last6Months.push({ month: MONTH_NAMES[d.getMonth()], revenue: rev, expenses: exp, profit: rev - exp });
  }

  const nonZero = last6Months.filter((mm) => mm.revenue > 0 || mm.expenses > 0);
  const bestMonth = nonZero.length > 0 ? [...nonZero].sort((a, b) => b.revenue - a.revenue)[0] : null;
  const worstMonth = nonZero.length > 0 ? [...nonZero].sort((a, b) => a.revenue - b.revenue)[0] : null;

  /* توزيع المصروفات */
  const expCats = {};
  fExpenses.forEach((e) => {
    const c = e.category || 'other';
    expCats[c] = (expCats[c] || 0) + (Number(e.amount) || 0);
  });
  const expTotal = sum(Object.values(expCats));
  const names = { fabric: 'قماش', thread: 'خيوط', tools: 'أدوات', rent: 'إيجار', electricity: 'كهرباء', water: 'مياه', salary: 'رواتب', other: 'أخرى' };
  const expenseCategories = Object.entries(expCats)
    .map(([k, v]) => ({ name: names[k] || k, amount: v, percent: safeDiv(v * 100, expTotal, 0) }))
    .sort((a, b) => b.amount - a.amount);
  const topCategoryPercent = expenseCategories.length > 0 ? expenseCategories[0].percent : 0;

  /* نقطة التعادل */
  const last3Exp = last6Months.slice(-3).map((mm) => mm.expenses);
  const avgMonthlyExpenses = safeDiv(sum(last3Exp), last3Exp.length, 0);
  const ordersNeededMonthly = avgOrderValue > 0 ? Math.ceil(avgMonthlyExpenses / avgOrderValue) : 0;

  /* التوقعات */
  const positiveMonths = last6Months.filter((mm) => mm.revenue > 0);
  const avgRevenue = safeDiv(sum(positiveMonths.map((mm) => mm.revenue)), positiveMonths.length, 0);
  const firstHalf = last6Months.slice(0, 3).reduce((s, mm) => s + mm.revenue, 0) / 3;
  const secondHalf = last6Months.slice(3).reduce((s, mm) => s + mm.revenue, 0) / 3;
  const trend = safeDiv((secondHalf - firstHalf) * 100, firstHalf, 0);

  const forecast = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(y, m + i, 1);
    forecast.push({ month: MONTH_NAMES[d.getMonth()], predicted: Math.max(0, avgRevenue * (1 + (trend / 100) * i)) });
  }

  const nowMs = Date.now();
  const overdueOrdersCount = ordersList.filter((o) =>
    o.dueDate && o.dueDate < nowMs && o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;

  const lowStockCount = inventoryList.filter((i) => Number(i.quantity) < 5).length;

  const data = {
    summary: { totalRevenue, totalExpenses, netProfit, profitMargin },
    pending: { pendingPayments, collectionRate },
    ordersStats: { count: fOrders.length, deliveredCount: deliveredOrders.length, avgOrderValue },
    comparison: {
      current: { revenue: thisRev, expenses: thisExp, profit: thisProf, ordersCount: filterRange(ordersList, 'createdAt', thisStart, nextStart).length },
      previous: { revenue: prevRev, expenses: prevExp, profit: prevProf, ordersCount: filterRange(ordersList, 'createdAt', prevStart, thisStart).length },
      changes: { revenueChange, expensesChange, profitChange },
    },
    last6Months,
    bestMonth,
    worstMonth,
    expenseCategories,
    topCategoryPercent,
    breakEven: { avgOrderValue, avgMonthlyExpenses, ordersNeededMonthly },
    forecast: { trend, nextMonths: forecast, avgRevenue },
    overdueOrdersCount,
    lowStockCount,
    revenueGrowthPercent: revenueChange,
    health: null,
    tips: [],
  };

  data.health = calculateHealthScore({
    profitMargin: data.summary.profitMargin,
    collectionRate: data.pending.collectionRate,
    topCategoryPercent: data.topCategoryPercent,
    revenueGrowthPercent: data.revenueGrowthPercent,
  });

  data.tips = generateTips(data);
  return data;
}

/* ==========================================================================
   6. API العام
   ========================================================================== */

/**
 * جلب بيانات المركز المالي (مع cache).
 * @param {string} [period='month']
 * @returns {Promise<Object>}
 */
export async function getFinancialData(period = 'month') {
  const key = period + '_' + _dataHash;
  if (_cache.has(key)) return _cache.get(key);
  const result = await computeFinancials(period);
  _cache.set(key, result);
  return result;
}
