/* ==========================================================================
   wall-board.js — نموذج «شاشة الورشة» (v3.3.43)
   ==========================================================================
   حساب نقي لعرض اليوم على شاشة كبيرة: متأخر · يُسلَّم اليوم · جاهز للاستلام · مواعيد اليوم.
   v3.3.64: شدّة التأخير (severity) · سُلِّم اليوم · الموعد التالي · paginate/firstName.
   ========================================================================== */

import { startOfDayPlus } from '../core/day-math.js';
import { computePickups } from './pickup-reminders.js';

const ACTIVE = new Set(['pending', 'in_progress']);
const CRITICAL_DAYS = 3;   // 3 أيام تأخير فأكثر = حرج

/**
 * تقسيم صفوف إلى صفحات (للتدوير التلقائي على الشاشة).
 * @param {Array} rows
 * @param {number} page — رقم الصفحة (يُلَفّ تلقائياً ضمن المدى)
 * @param {number} size — حجم الصفحة
 * @returns {{rows:Array, page:number, pages:number}}
 */
export function paginate(rows, page = 0, size = 8) {
  const list = Array.isArray(rows) ? rows : [];
  const n = Math.max(1, Math.floor(Number(size)) || 8);
  const pages = Math.max(1, Math.ceil(list.length / n));
  const p = ((Math.floor(Number(page)) || 0) % pages + pages) % pages;
  return { rows: list.slice(p * n, p * n + n), page: p, pages };
}

/** الاسم الأول فقط (وضع الخصوصية). */
export function firstName(name) {
  const w = String(name || '').trim().split(/\s+/)[0];
  return w || 'عميل';
}

function itemLabel(o) {
  const items = Array.isArray(o.items) ? o.items.filter((i) => i && i.name) : [];
  if (!items.length) return String(o.notes || 'طلب').slice(0, 40);
  return items[0].name + (items.length > 1 ? ' +' + (items.length - 1) : '');
}

export function buildWallModel({ orders = [], customers = [], appointments = [], payments = [] } = {}, now = Date.now()) {
  const today = startOfDayPlus(now, 0);
  const tomorrow = startOfDayPlus(now, 1);
  const cmap = new Map(customers.map((c) => [c.id, c]));
  const nameOf = (id) => (cmap.get(id) && cmap.get(id).name) || 'عميل';
  const row = (o, extra = {}) => ({
    orderId: o.id, code: '#' + String(o.id).slice(-6), name: nameOf(o.customerId),
    label: itemLabel(o), status: o.status, ...extra,
  });

  const late = [];
  const dueToday = [];
  let inProgress = 0;
  let pending = 0;
  let deliveredToday = 0;
  for (const o of orders) {
    if (o && o.status === 'delivered') {
      const dt = Number(o.deliveredAt) || 0;
      if (dt >= today && dt < tomorrow) deliveredToday++;
      continue;
    }
    if (!o || !ACTIVE.has(o.status)) continue;
    if (o.status === 'in_progress') inProgress++; else pending++;
    const d = Number(o.dueDate) || 0;
    if (!d) continue;
    if (d < today) {
      const daysLate = Math.max(1, Math.round((today - startOfDayPlus(d, 0)) / 86400000));
      late.push(row(o, { daysLate, due: d, severity: daysLate >= CRITICAL_DAYS ? 'critical' : 'warn' }));
    } else if (d < tomorrow) dueToday.push(row(o, { due: d }));
  }
  late.sort((a, b) => b.daysLate - a.daysLate);

  const pk = computePickups(orders, payments, customers, now);
  const ready = pk.items.map((i) => ({
    orderId: i.orderId, code: '#' + String(i.orderId).slice(-6), name: i.name, label: '',
    ageDays: i.ageDays, late: i.late, remaining: i.remaining,
  }));

  const appts = appointments
    .filter((a) => a && a.date >= today && a.date < tomorrow)
    .sort((a, b) => a.date - b.date)
    .map((a) => ({ id: a.id, time: a.date, title: a.title || 'موعد', name: a.customerId ? nameOf(a.customerId) : '', done: a.status === 'done' }));

  const nextAppointment = appts.find((a) => !a.done && a.time >= now) || null;

  return {
    now, today, late, dueToday, ready, appointments: appts, nextAppointment,
    counts: { late: late.length, dueToday: dueToday.length, ready: ready.length, appointments: appts.length, inProgress, pending, deliveredToday },
  };
}
