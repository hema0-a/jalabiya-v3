/* ==========================================================================
   kpis-calculator.js — حسابات مؤشرات الأداء (KPIs)
   ==========================================================================
   - يحسب كل KPIs من orders/payments/expenses/customers.
   - Cache داخلي حسب الفترة (يُبطَل بـ invalidateCache).
   - حماية كاملة من القسمة على صفر.
   ========================================================================== */

import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { customers } from '../data/repos/customers.js';
import { MONTH_NAMES, DAY_NAMES_FULL } from '../core/config.js';
import { getWriteVersion } from '../data/idb.js';
import { withDepositPayments, withWorkerExpenses } from './payments-view.js';
import { workerPayments } from '../data/repos/worker-payments.js';

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
const DAY_MS = 86400000;

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
 * نطاق الفترة.
 */
export function getPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'month')   return { startMs: startOfMonth(y, m), endMs: startOfMonth(y, m + 1) };
  if (period === '3months') return { startMs: startOfMonth(y, m - 2), endMs: startOfMonth(y, m + 1) };
  if (period === '6months') return { startMs: startOfMonth(y, m - 5), endMs: startOfMonth(y, m + 1) };
  if (period === 'year')    return { startMs: startOfMonth(y, 0), endMs: startOfMonth(y + 1, 0) };
  return { startMs: 0, endMs: Date.now() + DAY_MS };
}

/* ==========================================================================
   3. درجة الأداء
   ========================================================================== */

/**
 * حساب درجة أداء الورشة (0-100). 4 معايير × 25 نقطة.
 * @param {Object} stats
 * @returns {{score:number, level:string, stars:number, best:Object, worst:Object}}
 */
export function calculatePerformanceScore(stats) {
  let score = 0;

  const onTime = Number(stats.onTimeRate) || 0;
  if (onTime >= 90) score += 25;
  else if (onTime >= 80) score += 20;
  else if (onTime >= 70) score += 15;
  else if (onTime >= 50) score += 10;
  else if (onTime > 0) score += 5;

  const coll = Number(stats.collectionRate) || 0;
  if (coll >= 90) score += 25;
  else if (coll >= 80) score += 20;
  else if (coll >= 70) score += 15;
  else if (coll >= 50) score += 10;
  else if (coll > 0) score += 5;

  const deliv = Number(stats.deliveryRate) || 0;
  if (deliv >= 80) score += 25;
  else if (deliv >= 65) score += 20;
  else if (deliv >= 50) score += 15;
  else if (deliv >= 30) score += 10;
  else if (deliv > 0) score += 5;

  const avgOrder = Number(stats.avgOrderValue) || 0;
  score += Math.min(25, Math.floor(avgOrder / 100));

  /* الأفضل/الأضعف من النسب فقط */
  const ratios = [
    { key: 'onTime',     label: 'التسليم في الموعد', value: onTime },
    { key: 'collection', label: 'معدل التحصيل',      value: coll },
    { key: 'delivery',   label: 'نسبة التسليم',      value: deliv },
  ];
  const sorted = [...ratios].sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return {
    score,
    level: score >= 80 ? 'ممتاز' : score >= 60 ? 'جيد' : score >= 40 ? 'متوسط' : 'يحتاج تحسين',
    stars: score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1,
    best,
    worst,
  };
}

/* ==========================================================================
   4. الحساب الرئيسي
   ========================================================================== */

async function computeKpis(period) {
  const [ordersList, rawPayments, rawExpenses, customersList, workerPaysList] = await Promise.all([
    orders.list(),
    payments.list(),
    expenses.list(),
    customers.list(),
    workerPayments.list().catch(() => []),
  ]);
  const expensesList = withWorkerExpenses(rawExpenses, workerPaysList);

  const paymentsList = withDepositPayments(rawPayments, ordersList);

  const { startMs, endMs } = getPeriodRange(period);
  const inRange = (ts) => ts >= startMs && ts < endMs;

  const fOrders = ordersList.filter((o) => inRange(o.createdAt || 0));
  const fPayments = paymentsList.filter((p) => inRange(p.createdAt || 0));
  const fExpenses = expensesList.filter((e) => inRange(e.date || 0));

  const totalRevenue = sum(fPayments.map((p) => p.amount));
  const totalExpenses = sum(fExpenses.map((e) => e.amount));
  const netProfit = totalRevenue - totalExpenses;

  const totalOrdersValue = sum(fOrders.map((o) => o.amount));
  const deliveredOrders = fOrders.filter((o) => o.status === 'delivered');
  const activeOrders = fOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');

  const avgOrderValue = safeDiv(totalOrdersValue, fOrders.length, 0);

  /* متوسط وقت التنفيذ */
  const completionDays = deliveredOrders
    .filter((o) => o.createdAt && o.updatedAt)
    .map((o) => (o.updatedAt - o.createdAt) / DAY_MS)
    .filter((d) => d > 0 && d < 365);
  const avgCompletionDays = completionDays.length > 0
    ? sum(completionDays) / completionDays.length
    : 0;

  /* التسليم في الموعد */
  const deliveredWithDeadline = deliveredOrders.filter((o) => o.dueDate && o.updatedAt);
  const onTimeCount = deliveredWithDeadline.filter((o) => o.updatedAt <= o.dueDate).length;
  const onTimeRate = safeDiv(onTimeCount * 100, deliveredWithDeadline.length, 0);

  /* نسبة التسليم */
  const deliveryRate = safeDiv(deliveredOrders.length * 100, fOrders.length, 0);

  /* معدل التحصيل */
  const allExpected = ordersList
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const allPaid = sum(paymentsList.map((p) => p.amount));
  const collectionRate = safeDiv(allPaid * 100, allExpected, 0);
  const totalRemaining = Math.max(0, allExpected - allPaid);

  /* أفضل 5 عملاء */
  const customerTotals = {};
  ordersList.forEach((o) => {
    if (!o.customerId) return;
    const c = customerTotals[o.customerId] = customerTotals[o.customerId] || { count: 0, total: 0 };
    c.count++;
    c.total += Number(o.amount) || 0;
  });
  const custMap = {};
  customersList.forEach((c) => { custMap[c.id] = c; });
  const topCustomers = Object.entries(customerTotals)
    .map(([id, data]) => ({
      id,
      name: custMap[id] ? custMap[id].name : 'عميل محذوف',
      count: data.count,
      total: data.total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  /* أكثر الأنواع مبيعاً */
  const typeCounts = {};
  ordersList.forEach((o) => {
    const t = o.notes || 'بدون نوع';
    if (!typeCounts[t]) typeCounts[t] = { count: 0, revenue: 0 };
    typeCounts[t].count++;
    typeCounts[t].revenue += Number(o.amount) || 0;
  });
  const topTypes = Object.entries(typeCounts)
    .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  /* آخر 6 شهور */
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const s = d.getTime();
    const e = new Date(y, m - i + 1, 1).getTime();
    const mmOrders = ordersList.filter((o) => (o.createdAt || 0) >= s && (o.createdAt || 0) < e);
    last6Months.push({
      month: MONTH_NAMES[d.getMonth()],
      count: mmOrders.length,
      revenue: sum(mmOrders.map((o) => o.amount)),
    });
  }

  /* أداء أيام الأسبوع */
  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  ordersList.forEach((o) => {
    if (!o.createdAt) return;
    const wd = new Date(o.createdAt).getDay();
    dayTotals[wd] += Number(o.amount) || 0;
    dayCounts[wd]++;
  });
  const weekdays = DAY_NAMES_FULL.map((name, i) => ({
    name,
    total: dayTotals[i],
    count: dayCounts[i],
  }));
  const bestWeekday = weekdays.reduce((a, b) => (a.total >= b.total ? a : b));

  /* إحصائيات عامة */
  const totalCustomersCount = customersList.length;
  const totalOrdersCount = ordersList.length;
  const avgOrdersPerCustomer = safeDiv(totalOrdersCount, totalCustomersCount, 0);

  /* الحسابات النهائية */
  const performance = calculatePerformanceScore({
    onTimeRate,
    collectionRate,
    deliveryRate,
    avgOrderValue,
  });

  return {
    summary: { totalRevenue, totalExpenses, netProfit },
    kpis: {
      avgOrderValue,
      avgCompletionDays,
      onTimeRate,
      bestWeekday: bestWeekday.name,
    },
    advanced: {
      collectionRate,
      daysBetweenOrders: safeDiv(30, avgOrdersPerCustomer, 0),
      topCustomerByOrders: topCustomers.length > 0
        ? [...topCustomers].sort((a, b) => b.count - a.count)[0]
        : null,
      topTypeByRevenue: topTypes.length > 0 ? topTypes[0] : null,
    },
    general: {
      totalCustomers: totalCustomersCount,
      totalOrders: totalOrdersCount,
      activeOrders: activeOrders.length,
      deliveredOrders: deliveredOrders.length,
      deliveryRate,
      avgOrdersPerCustomer,
      totalRemaining,
    },
    topCustomers,
    topTypes,
    last6Months,
    weekdays,
    performance,
    hasData: fOrders.length > 0 || fPayments.length > 0 || fExpenses.length > 0,
    lowData: ordersList.length > 0 && ordersList.length < 5,
  };
}

/* ==========================================================================
   5. API
   ========================================================================== */

/**
 * جلب KPIs (مع Cache).
 * @param {string} [period='month']
 * @returns {Promise<Object>}
 */
export async function getKpisData(period = 'month') {
  const key = period + '_' + _dataHash + '_' + getWriteVersion();
  if (_cache.has(key)) return _cache.get(key);
  const result = await computeKpis(period);
  _cache.set(key, result);
  return result;
}
