/* ==========================================================================
   week-visits.js — «عملاء هذا الأسبوع» (v3.3.55)
   ==========================================================================
   من يُنتظر حضوره خلال 7 أيام (اليوم + 6): مواعيد، تسليمات مستحقة، طلبات جاهزة للاستلام.
   حساب نقي للعرض فقط.
   ========================================================================== */

import { startOfDayPlus } from '../core/day-math.js';
import { orderPaidBreakdown } from './payments-view.js';

const ACTIVE = new Set(['pending', 'in_progress']);

/**
 * @returns {Array<{customerId:string,name:string,phone:string,firstTs:number,
 *   reasons:Array<{type:'appt'|'due'|'ready',ts:number,label:string}>,remaining:number,orderIds:string[]}>}
 *  مرتبة بأقرب حضور ثم الاسم.
 */
export function buildWeekVisits({ orders = [], customers = [], appointments = [], payments = [] } = {}, now = Date.now(), days = 7) {
  const from = startOfDayPlus(now, 0);
  const to = startOfDayPlus(now, days);
  const cmap = new Map(customers.map((c) => [c.id, c]));
  const paysByOrder = new Map();
  for (const p of payments) {
    if (!p || !p.orderId) continue;
    if (!paysByOrder.has(p.orderId)) paysByOrder.set(p.orderId, []);
    paysByOrder.get(p.orderId).push(p);
  }
  const rows = new Map();
  const rowFor = (customerId) => {
    if (!customerId) return null;
    if (!rows.has(customerId)) {
      const c = cmap.get(customerId) || {};
      rows.set(customerId, { customerId, name: c.name || 'عميل', phone: c.phone || '', reasons: [], remaining: 0, orderIds: [] });
    }
    return rows.get(customerId);
  };

  for (const a of appointments) {
    if (!a || !a.customerId || !(a.date >= from && a.date < to)) continue;
    if (a.status === 'done' || a.status === 'cancelled') continue;
    rowFor(a.customerId).reasons.push({ type: 'appt', ts: a.date, label: a.title || 'موعد' });
  }
  for (const o of orders) {
    if (!o || !o.customerId) continue;
    let reason = null;
    if (o.status === 'ready') {
      const inWin = o.dueDate >= from && o.dueDate < to;
      reason = { type: 'ready', ts: inWin ? o.dueDate : from, label: 'استلام طلب جاهز' };
    } else if (ACTIVE.has(o.status) && o.dueDate >= from && o.dueDate < to) {
      reason = { type: 'due', ts: o.dueDate, label: 'تسليم طلب' };
    }
    if (!reason) continue;
    const r = rowFor(o.customerId);
    r.reasons.push(reason);
    r.orderIds.push(o.id);
    const paid = orderPaidBreakdown(o, paysByOrder.get(o.id) || []).paid || 0;
    r.remaining += Math.max(0, Math.round(((Number(o.amount) || 0) - paid) * 100) / 100);
  }

  const out = [...rows.values()].filter((r) => r.reasons.length);
  out.forEach((r) => {
    r.reasons.sort((a, b) => a.ts - b.ts);
    r.firstTs = r.reasons[0].ts;
    r.remaining = Math.round(r.remaining * 100) / 100;
  });
  out.sort((a, b) => a.firstTs - b.firstTs || String(a.name).localeCompare(String(b.name), 'ar'));
  return out;
}

/** «اليوم» / «غداً» / اسم اليوم بالعربية. */
export function dayLabel(ts, now = Date.now()) {
  if (ts < startOfDayPlus(now, 1)) return 'اليوم';
  if (ts < startOfDayPlus(now, 2)) return 'غداً';
  try { return new Date(ts).toLocaleDateString('ar-EG', { weekday: 'long' }); } catch { return ''; }
}

/** رسالة تذكير مهذّبة بالحضور القادم. */
export function buildVisitText(row, workshopName = '', now = Date.now()) {
  const first = row.reasons[0];
  const lines = ['السلام عليكم ' + (row.name || '') + '،'];
  const parts = row.reasons.slice(0, 3).map((r) => dayLabel(r.ts, now) + ': ' + r.label);
  lines.push('تذكير بمواعيدكم معنا' + (workshopName ? ' في ' + workshopName : '') + ':');
  parts.forEach((p) => lines.push('• ' + p));
  if (row.remaining > 0) lines.push('المتبقي عند الاستلام: ' + row.remaining + ' ج.م');
  lines.push('بانتظاركم، شكراً لثقتكم 🌹');
  return first ? lines.join('\n') : '';
}
