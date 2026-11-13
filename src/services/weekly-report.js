/* ==========================================================================
   weekly-report.js — تقرير الأسبوع (v3.19.0) — دوال نقية بلا DOM ولا قاعدة بيانات
   ==========================================================================
   آخر 7 أيام (اليوم + 6 قبله): المحصّل · المصروف · الصافي · المسلَّم · الجديد · المتأخر · مستحقات العملاء · أفضل العملاء.
   «المحصّل» = دفعات الإيراد الفعلي نفسها التي تعتمدها التقارير (revenuePayments: يشمل المقدمات ويستبعد الملغى).
   يعيد أيضاً نصاً جاهزاً للمشاركة (واتساب) وملخصاً مضغوطاً (weeklyDigest) يرفعه التطبيق ليضيف الإشعار سطر الجمعة.
   ========================================================================== */

import { revenuePayments, withWorkerExpenses } from './payments-view.js';
import { computeReceivables } from './receivables.js';

const DAY = 86400000;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** نطاق آخر `days` أيام: من بداية اليوم قبل (days−1) إلى نهاية اليوم. */
export function weekRange(now = Date.now(), days = 7) {
  const to = startOfDay(now) + DAY - 1;
  return { from: startOfDay(now) - (Math.max(1, days) - 1) * DAY, to };
}

const when = (p) => n(p && (p.date || p.createdAt));

/**
 * @param {{orders?:Array, payments?:Array, expenses?:Array, workerPayments?:Array, customers?:Array, now?:number, days?:number}} src
 */
export function buildWeeklyReport(input = {}) {
  const src = input || {};
  const now = n(src.now) || Date.now();
  const orders = Array.isArray(src.orders) ? src.orders : [];
  const customers = Array.isArray(src.customers) ? src.customers : [];
  const { from, to } = weekRange(now, src.days || 7);
  const inRange = (t) => t >= from && t <= to;
  const names = new Map(customers.filter((c) => c && c.id != null).map((c) => [c.id, String(c.name || 'عميل')]));

  const pays = revenuePayments(src.payments, orders).filter((p) => inRange(when(p)) && n(p.amount) > 0);
  const income = r2(pays.reduce((s, p) => s + n(p.amount), 0));
  const exps = withWorkerExpenses(src.expenses, src.workerPayments).filter((e) => e && inRange(n(e.date)) && n(e.amount) > 0);
  const expenses = r2(exps.reduce((s, e) => s + n(e.amount), 0));

  const delivered = orders.filter((o) => o && o.status === 'delivered' && inRange(n(o.deliveredAt || o.completedAt)));
  const created = orders.filter((o) => o && o.status !== 'cancelled' && inRange(n(o.createdAt)));
  const overdue = orders.filter((o) => o && (o.status === 'pending' || o.status === 'in_progress') && n(o.dueDate) > 0 && n(o.dueDate) < startOfDay(now));
  const ready = orders.filter((o) => o && o.status === 'ready');
  const rec = computeReceivables(orders, src.payments, customers, now);

  const byCust = new Map();
  for (const p of pays) { if (p.customerId == null) continue; byCust.set(p.customerId, (byCust.get(p.customerId) || 0) + n(p.amount)); }
  const top = [...byCust].map(([id, amount]) => ({ id, name: names.get(id) || 'عميل', amount: r2(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 3);

  return {
    range: { from, to }, income, expenses, net: r2(income - expenses),
    delivered: { count: delivered.length, amount: r2(delivered.reduce((s, o) => s + n(o.amount), 0)) },
    created: created.length, overdue: overdue.length, ready: ready.length,
    receivables: { overdue: r2(rec.totals.overdue), pending: r2(rec.totals.pending), customers: rec.totals.customersOverdue },
    top,
  };
}

/** ملخص مضغوط (أرقام فقط) لرفعه ضمن digest. */
export function weeklyDigest(r) {
  const x = r || {};
  return { inc: Math.round(n(x.income)), exp: Math.round(n(x.expenses)), del: n(x.delivered && x.delivered.count), ovd: n(x.overdue), rec: Math.round(n(x.receivables && x.receivables.overdue)) };
}

const fmt = (v) => Math.round(n(v)).toLocaleString('en-US');
const dmy = (ms) => { const d = new Date(ms); return d.getDate() + '/' + (d.getMonth() + 1); };

/** نص المشاركة (واتساب). */
export function weeklyText(r, workshopName = '') {
  const x = r || {};
  const L = [];
  L.push('📈 تقرير الأسبوع' + (workshopName ? ' — ' + workshopName : ''));
  if (x.range) L.push('من ' + dmy(x.range.from) + ' إلى ' + dmy(x.range.to));
  L.push('');
  L.push('💰 المحصّل: ' + fmt(x.income) + ' ج');
  L.push('💸 المصروف: ' + fmt(x.expenses) + ' ج');
  L.push((n(x.net) >= 0 ? '✅' : '⚠️') + ' الصافي: ' + fmt(x.net) + ' ج');
  L.push('📦 سُلِّم: ' + n(x.delivered && x.delivered.count) + ' طلب (' + fmt(x.delivered && x.delivered.amount) + ' ج)');
  L.push('🆕 طلبات جديدة: ' + n(x.created));
  if (n(x.overdue)) L.push('🚨 متأخرة: ' + n(x.overdue) + ' طلب');
  if (n(x.ready)) L.push('📮 جاهزة لم تُستلم: ' + n(x.ready));
  if (n(x.receivables && x.receivables.overdue) > 0) L.push('🧾 مستحقات متأخرة عند العملاء: ' + fmt(x.receivables.overdue) + ' ج (' + n(x.receivables.customers) + ' عميل)');
  if (Array.isArray(x.top) && x.top.length) { L.push(''); L.push('⭐ الأعلى دفعاً: ' + x.top.map((t) => t.name + ' ' + fmt(t.amount)).join(' · ')); }
  return L.join('\n');
}
