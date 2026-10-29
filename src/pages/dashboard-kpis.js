/* ==========================================================================
   dashboard-kpis.js — حسابات لوحة التحكم وتحميل بياناتها (v3.5.5)
   ==========================================================================
   مقتطع من dashboard.js دون أي تغيير في المنطق (تقسيم صيانة فقط).
   API:
     loadKPIs()                         → Promise<Object>  (كل بيانات اللوحة)
     startOfMonth() · computeSalesLast7Days(payments) · computeOrdersByStatus(orders) · computeFinance(payments, expenses)
   لا يستورد أي شيء من واجهة المستخدم (لا DOM) — حسابات وقراءة مستودعات فقط.
   ========================================================================== */

import { revenuePayments, withWorkerExpenses, orderPaidBreakdown } from '../services/payments-view.js';
import { computePickups } from '../services/pickup-reminders.js';
import { computeReceivables } from '../services/receivables.js';
import { buildQueue } from '../services/message-queue.js';
import { isEnabledCfg } from '../services/message-templates.js';
import { loadLog } from '../services/message-log.js';
import { referrals as referralsRepo } from '../data/repos/referrals.js';
import { isDemoRecord } from '../services/demo-data.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { startOfDayPlus, startOfDay, startOfNextDay } from '../core/day-math.js';
import { buildWeekVisits } from '../services/week-visits.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { appointments } from '../data/repos/appointments.js';
import { settings } from '../data/repos/settings.js';

/* ==========================================================================
   1. أدوات حسابية للرسوم
   ========================================================================== */

/**
 * حساب بداية الشهر الحالي.
 * @returns {number}
 */
export function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * حساب مبيعات آخر 7 أيام (يوم بيوم).
 * @param {Array} paymentsList
 * @returns {Array<{label:string, value:number}>}
 */
export function computeSalesLast7Days(paymentsList) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  /* أسماء أيام الأسبوع بالعربية (مختصرة) */
  const DAY_NAMES = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDayPlus(todayMs, -i);
    const dayEnd = startOfDayPlus(todayMs, -i + 1);

    const total = paymentsList
      .filter((p) => {
        const t = p.createdAt || 0;
        return t >= dayStart && t < dayEnd;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const d = new Date(dayStart);
    days.push({
      label: DAY_NAMES[d.getDay()],
      value: total,
    });
  }

  return days;
}

/**
 * حساب توزيع الطلبات بالحالة.
 * @param {Array} ordersList
 * @returns {Object}
 */
export function computeOrdersByStatus(ordersList) {
  const out = { pending: 0, in_progress: 0, ready: 0, delivered: 0, cancelled: 0 };
  ordersList.forEach((o) => {
    if (out[o.status] != null) out[o.status]++;
  });
  return out;
}

/**
 * حساب ملخص مالي لآخر 30 يوماً.
 * @param {Array} paymentsList
 * @param {Array} expensesList
 * @returns {{revenue:number, expenses:number, profit:number}}
 */
export function computeFinance(paymentsList, expensesList) {
  const DAY_MS = 86400000;
  const now = Date.now();
  const start = now - 30 * DAY_MS;

  const revenue = paymentsList
    .filter((p) => (p.createdAt || 0) >= start)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const exp = expensesList
    .filter((e) => (e.date || 0) >= start)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return {
    revenue,
    expenses: exp,
    profit: revenue - exp,
  };
}

/* ==========================================================================
   2. تحميل وحساب KPIs
   ========================================================================== */

/**
 * تحميل كل البيانات وحساب KPIs.
 * @returns {Promise<Object>}
 */
export async function loadKPIs() {
  const monthStart = startOfMonth();

  const [customersList, ordersList, rawPayments, rawExpenses, s, workerPaysList, referralsList, allAppts] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
    expenses.list().catch(() => []),
    settings.get().catch(() => ({})),
    workerPayments.list().catch(() => []),
    referralsRepo.list().catch(() => []),
    appointments.list().catch(() => []),
  ]);
  /* مواعيد اليوم من نفس القراءة (كانت قراءة ثانية لنفس المخزن) — نفس شرط appointments.getToday */
  const _dayStart = startOfDay(Date.now());
  const _dayEnd = startOfNextDay(_dayStart);
  const todayAppts = allAppts
    .filter((a) => a.date && a.date >= _dayStart && a.date < _dayEnd)
    .sort((a, b) => a.date - b.date);
  const expensesList = withWorkerExpenses(rawExpenses, workerPaysList);
  const paymentsList = revenuePayments(rawPayments, ordersList);

  const activeOrders = ordersList.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const monthPayments = paymentsList.filter(
    (p) => (p.createdAt || 0) >= monthStart
  );
  const monthRevenue = monthPayments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  const recentCustomers = customersList
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  const dueSoonOrders = ordersList
    .filter((o) => {
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      if (!o.dueDate) return false;
      const days = (o.dueDate - Date.now()) / 86400000;
      return days >= -1 && days <= 7;
    })
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 5);

  /* قراءة معلومات الورشة */
  const workshopName = (s.workshop && s.workshop.name) ? String(s.workshop.name).trim() : '';
  const workshopLogo = (s.workshop && s.workshop.logo) ? s.workshop.logo : '';

  /* بيانات الرسوم */
  const salesLast7Days = computeSalesLast7Days(paymentsList);
  const ordersByStatus = computeOrdersByStatus(ordersList);
  const finance = computeFinance(paymentsList, expensesList);

  /* --- لوحة التحكم: ما يحتاج إجراءً --- */
  const custMap = new Map(customersList.map((c) => [c.id, c]));
  const paysByOrder = new Map();
  rawPayments.forEach((p) => {
    if (!p || !p.orderId) return;
    if (!paysByOrder.has(p.orderId)) paysByOrder.set(p.orderId, []);
    paysByOrder.get(p.orderId).push(p);
  });
  const remainingOf = (o) => Math.max(0, Math.round(((Number(o.amount) || 0) - orderPaidBreakdown(o, paysByOrder.get(o.id) || []).paid) * 100) / 100);
  const withCust = (o) => {
    const c = custMap.get(o.customerId) || null;
    return { order: o, name: c ? c.name : 'عميل غير معروف', phone: c ? (c.phone || '') : '', customerId: o.customerId, remaining: remainingOf(o) };
  };
  const todayStart = startOfDayPlus(Date.now(), 0);
  const pickups = computePickups(ordersList, rawPayments, customersList);
  const overdueOrders = ordersList
    .filter((o) => (o.status === 'pending' || o.status === 'in_progress') && o.dueDate && o.dueDate < todayStart)
    .sort((a, b) => a.dueDate - b.dueDate)
    .map(withCust);
  const receivables = computeReceivables(ordersList, rawPayments, customersList);
  const debtors = receivables.customers.filter((c) => c.overdue > 0.009);
  const orderById = new Map(ordersList.map((o) => [o.id, o]));

  return {
    hasDemo: customersList.some(isDemoRecord) || ordersList.some(isDemoRecord),
    custMap, orderById, pickups, overdueOrders, debtors, workshopNameRaw: workshopName,
    workshopObj: s.workshop || {}, msgCfg: s.autoMessages || null,
    msgCounts: (() => {
      /* عدّاد «رسائل اليوم»: لا يُسقط اللوحة إن فشل الحساب */
      try {
        if (!isEnabledCfg(s.autoMessages)) return null;
        return buildQueue({ orders: ordersList, payments: rawPayments, customers: customersList,
          occasions: s.occasions || [], referrals: referralsList, cfg: s.autoMessages || null, workshop: s.workshop || {}, log: loadLog(),
          countOnly: true, precomputed: { pickups, receivables } }).counts;   /* أرقام فقط وبلا إعادة حساب (v3.3.71) */
      } catch (e) { return null; }
    })(),
    dueSoonRows: dueSoonOrders.map(withCust),
    weekVisits: buildWeekVisits({ orders: ordersList, customers: customersList, appointments: allAppts, payments: rawPayments }),
    todayApptsRows: todayAppts.map((a) => {
      const c = a.customerId ? custMap.get(a.customerId) : null;
      return { appt: a, name: c ? c.name : '', phone: c ? (c.phone || '') : '' };
    }),
    totalCustomers: customersList.length,
    totalOrders: ordersList.length,
    realRecords: customersList.filter((r) => !isDemoRecord(r)).length + ordersList.filter((r) => !isDemoRecord(r)).length,
    activeOrders: activeOrders.length,
    monthRevenue,
    todayAppointments: todayAppts.length,
    recentCustomers,
    dueSoonOrders,
    todayApptsList: todayAppts,
    workshopName,
    workshopLogo,
    salesLast7Days,
    ordersByStatus,
    finance,
  };
}
