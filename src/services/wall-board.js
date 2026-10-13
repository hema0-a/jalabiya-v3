/* ==========================================================================
   wall-board.js — نموذج «شاشة الورشة» (v3.3.43)
   ==========================================================================
   حساب نقي لعرض اليوم على شاشة كبيرة: متأخر · يُسلَّم اليوم · جاهز للاستلام · مواعيد اليوم.
   ========================================================================== */

import { startOfDayPlus } from '../core/day-math.js';
import { computePickups } from './pickup-reminders.js';

const ACTIVE = new Set(['pending', 'in_progress']);

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
  for (const o of orders) {
    if (!o || !ACTIVE.has(o.status)) continue;
    if (o.status === 'in_progress') inProgress++; else pending++;
    const d = Number(o.dueDate) || 0;
    if (!d) continue;
    if (d < today) late.push(row(o, { daysLate: Math.max(1, Math.round((today - startOfDayPlus(d, 0)) / 86400000)), due: d }));
    else if (d < tomorrow) dueToday.push(row(o, { due: d }));
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

  return {
    now, today, late, dueToday, ready, appointments: appts,
    counts: { late: late.length, dueToday: dueToday.length, ready: ready.length, appointments: appts.length, inProgress, pending },
  };
}
