/* ==========================================================================
   month-close.js — قائمة إقفال الشهر (v3.19.0) — دوال نقية
   ==========================================================================
   تُجيب: «هل أنهيتُ حسابات هذا الشهر؟» بقائمة فحوص تُحسب من بياناتك:
   مستحقات العملاء المتأخرة · طلبات متأخرة · جاهز لم يُستلم · التزامات الشهر المدفوعة · أقساط الجمعيات · مستحقات الموردين · نسخة احتياطية.
   state لكل فحص: ok (سليم) · warn (يحتاج عملاً) · info (للعلم). والإقفال نفسه علامة يضعها المستخدم (closedAt) لا قفلاً للبيانات.
   ========================================================================== */

import { revenuePayments, withWorkerExpenses } from './payments-view.js';
import { computeReceivables } from './receivables.js';
import { computePickups } from './pickup-reminders.js';
import { schedule } from './circles.js';

const DAY = 86400000;
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const ymOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export function monthBounds(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return { from: new Date(y, m - 1, 1).getTime(), to: new Date(y, m, 1).getTime() - 1, label: (MONTHS[m - 1] || '') + ' ' + y, dim: new Date(y, m, 0).getDate() };
}
/** هل صار الإقفال مناسباً؟ آخر 3 أيام من الشهر أو أول 5 أيام من التالي. */
export function closeWindow(now = Date.now()) {
  const d = new Date(now); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() >= dim - 2) return { open: true, ym: ymOf(now) };
  if (d.getDate() <= 5) return { open: true, ym: ymOf(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()) };
  return { open: false, ym: ymOf(now) };
}

/**
 * @param {Object} s — { ym, now, orders, payments, expenses, workerPayments, customers, commitments, commitmentPayments,
 *                       circles, supplierRows, lastBackupAt, closedAt }
 */
export function buildMonthClose(input = {}) {
  const s = input || {};
  const now = n(s.now) || Date.now();
  const ym = s.ym || ymOf(now);
  const b = monthBounds(ym);
  const orders = Array.isArray(s.orders) ? s.orders : [];
  const inMonth = (t) => t >= b.from && t <= b.to;
  const items = [];
  const add = (id, label, state, detail, route) => items.push({ id, label, state, detail, route });

  const income = r2(revenuePayments(s.payments, orders).filter((p) => inMonth(n(p.date || p.createdAt))).reduce((a, p) => a + n(p.amount), 0));
  const expenses = r2(withWorkerExpenses(s.expenses, s.workerPayments).filter((e) => e && inMonth(n(e.date))).reduce((a, e) => a + n(e.amount), 0));
  const deliveredCount = orders.filter((o) => o && o.status === 'delivered' && inMonth(n(o.deliveredAt || o.completedAt))).length;

  const rec = computeReceivables(orders, s.payments, s.customers, now);
  add('receivables', 'مستحقات العملاء المتأخرة', rec.totals.overdue > 0 ? 'warn' : 'ok',
    rec.totals.overdue > 0 ? Math.round(rec.totals.overdue).toLocaleString('en-US') + ' ج عند ' + rec.totals.customersOverdue + ' عميل' : 'لا مستحقات متأخرة', '#/debts');

  const late = orders.filter((o) => o && (o.status === 'pending' || o.status === 'in_progress') && n(o.dueDate) > 0 && n(o.dueDate) < now - DAY);
  add('late-orders', 'طلبات متأخرة مفتوحة', late.length ? 'warn' : 'ok', late.length ? late.length + ' طلب تجاوز موعده' : 'لا طلبات متأخرة', '#/orders');

  const pk = computePickups(orders, s.payments, s.customers, now);
  add('pickups', 'جاهز لم يُستلم منذ مدة', pk.lateCount ? 'warn' : 'ok', pk.lateCount ? pk.lateCount + ' طلب ينتظر العميل' : 'لا شيء عالق', '#/pickups');

  const cm = (Array.isArray(s.commitments) ? s.commitments : []).filter((c) => c && c.active !== false && n(c.amount) > 0 && (!c.frequency || c.frequency === 'monthly') && Number.isInteger(Number(c.dueDay)));
  const cp = Array.isArray(s.commitmentPayments) ? s.commitmentPayments : [];
  const unpaid = cm.filter((c) => !cp.some((p) => p && p.commitmentId === c.id && inMonth(n(p.date)) && n(p.amount) > 0));
  const dueSoFar = unpaid.filter((c) => new Date(b.to).getTime() < now || Number(c.dueDay) <= new Date(now).getDate());
  if (cm.length) add('commitments', 'التزامات الشهر مدفوعة', dueSoFar.length ? 'warn' : 'ok', dueSoFar.length ? dueSoFar.length + ' التزام لم يُسجَّل دفعه: ' + dueSoFar.slice(0, 2).map((c) => c.name).join('، ') : 'كلها مسجّلة', '#/commitments');

  const circles = (Array.isArray(s.circles) ? s.circles : []).filter((c) => c && c.active !== false);
  const cr = circles.map((c) => ({ c, row: schedule(c).find((r) => r.ym === ym) })).filter((x) => x.row && !x.row.paid);
  if (circles.length) add('circles', 'أقساط الجمعيات', cr.length ? 'warn' : 'ok', cr.length ? cr.length + ' قسط غير مدفوع' : 'مدفوعة', '#/circles');

  const owed = r2((Array.isArray(s.supplierRows) ? s.supplierRows : []).reduce((a, r) => a + Math.max(0, n(r && r.owed)), 0));
  if (owed > 0) add('suppliers', 'مستحقات الموردين', 'info', Math.round(owed).toLocaleString('en-US') + ' ج عليك', '#/suppliers');

  const lb = n(s.lastBackupAt);
  const bk = lb && now - lb < 14 * DAY;
  add('backup', 'نسخة احتياطية حديثة', bk ? 'ok' : 'warn', bk ? 'منذ ' + Math.floor((now - lb) / DAY) + ' يوم' : (lb ? 'مرّ أكثر من 14 يوماً' : 'لا نسخة مسجّلة'), '#/settings');

  const warns = items.filter((i) => i.state === 'warn').length;
  return {
    ym, label: b.label, summary: { income, expenses, net: r2(income - expenses), delivered: deliveredCount },
    items, warns, progress: { done: items.filter((i) => i.state !== 'warn').length, total: items.length },
    closed: n(s.closedAt) > 0, closedAt: n(s.closedAt) || 0,
  };
}
