/* ==========================================================================
   production-board.js — لوحة الإنتاج وتركيز اليوم (v3.8.0) — دوال نقية
   ==========================================================================
   - الطلب النشط = pending أو in_progress. الإسناد بحقل اختياري order.workerId.
   - حمل كل عامل: عدد طلباته النشطة + المتأخر + المستحق خلال 3 أيام + الأقطع (عدد القطع).
   - «تركيز اليوم»: المتأخر ثم المستحق اليوم ثم غداً، مرتّبة بالأولوية (عاجل ثم الأقدم).
   - تغيير الحالة الجماعي: مسموح فقط إلى in_progress أو ready (التسليم له مسار دفع خاص).
   ========================================================================== */

import { startOfDayPlus } from '../core/day-math.js';

export const ACTIVE_STATUSES = ['pending', 'in_progress'];
export const BULK_TARGETS = ['in_progress', 'ready'];
export const SOON_DAYS = 3;
export const FOCUS_LIMIT = 12;
const DAY = 86400000;

const isActive = (o) => !!o && ACTIVE_STATUSES.includes(o.status);

function pieces(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  const n = items.reduce((s, i) => s + (Math.max(0, Math.floor(Number(i && i.qty)) || (i && i.name ? 1 : 0))), 0);
  return n || 1;
}

function label(o) {
  const items = Array.isArray(o.items) ? o.items.filter((i) => i && i.name) : [];
  if (!items.length) return String(o.notes || 'طلب').slice(0, 40);
  return items[0].name + (items.length > 1 ? ' +' + (items.length - 1) : '');
}

/** صف الطلب للعرض مع موقعه من اليوم. */
export function orderRow(o, nameOf, now) {
  const today = startOfDayPlus(now, 0);
  const due = Number(o.dueDate) || 0;
  let daysLeft = null;
  if (due) daysLeft = Math.round((startOfDayPlus(due, 0) - today) / DAY);
  return {
    id: o.id, code: '#' + String(o.id).slice(-6), name: nameOf(o.customerId), label: label(o),
    status: o.status, workerId: o.workerId || '', due, daysLeft,
    late: daysLeft !== null && daysLeft < 0, today: daysLeft === 0, urgent: !!o.urgent, pieces: pieces(o),
  };
}

const bySeverity = (a, b) => {
  const da = a.daysLeft === null ? 9999 : a.daysLeft;
  const db = b.daysLeft === null ? 9999 : b.daysLeft;
  if (da !== db) return da - db;
  return (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0);
};

/**
 * @returns {{workers:Array, unassigned:Array, focus:Array, totals:object}}
 */
export function buildBoard({ orders = [], workers = [], customers = [] } = {}, now = Date.now()) {
  const cmap = new Map((customers || []).map((c) => [c.id, c]));
  const nameOf = (id) => (cmap.get(id) && cmap.get(id).name) || 'عميل';
  const active = (orders || []).filter(isActive).map((o) => orderRow(o, nameOf, now));
  const activeWorkers = (workers || []).filter((w) => w && w.active !== false);
  const known = new Set(activeWorkers.map((w) => w.id));

  const per = new Map(activeWorkers.map((w) => [w.id, []]));
  const unassigned = [];
  for (const r of active) {
    if (r.workerId && known.has(r.workerId)) per.get(r.workerId).push(r);
    else unassigned.push(r);   /* عامل محذوف/معطَّل ⟵ يُعامل كغير مُسند */
  }
  const rows = activeWorkers.map((w) => {
    const list = per.get(w.id).sort(bySeverity);
    return {
      worker: { id: w.id, name: w.name || 'عامل' },
      orders: list,
      count: list.length,
      pieces: list.reduce((s, r) => s + r.pieces, 0),
      lateCount: list.filter((r) => r.late).length,
      soonCount: list.filter((r) => r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= SOON_DAYS).length,
    };
  }).sort((a, b) => b.count - a.count || a.worker.name.localeCompare(b.worker.name, 'ar'));
  unassigned.sort(bySeverity);

  const focus = active.filter((r) => r.late || (r.daysLeft !== null && r.daysLeft <= 1) || r.urgent).sort(bySeverity).slice(0, FOCUS_LIMIT);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return {
    workers: rows, unassigned, focus,
    totals: {
      active: active.length, unassigned: unassigned.length, late: active.filter((r) => r.late).length,
      dueToday: active.filter((r) => r.today).length, maxCount,
    },
  };
}

/** شدّة الحمل 0..1 نسبةً لأكثر عامل حمولة (للشريط). */
export function loadRatio(count, maxCount) {
  const m = Math.max(0, Number(maxCount) || 0);
  return m > 0 ? Math.min(1, Math.max(0, (Number(count) || 0) / m)) : 0;
}

/** أخفّ عامل حمولة (للاقتراح عند الإسناد). null إن لا عمال. */
export function suggestWorker(board) {
  const list = (board && board.workers) || [];
  if (!list.length) return null;
  return [...list].sort((a, b) => a.count - b.count || a.lateCount - b.lateCount)[0].worker;
}

/** هل الانتقال الجماعي مسموح لهذا الطلب؟ (الحالة الحالية نشطة/جاهزة، والهدف مسموح، وليس نفس الحالة). */
export function canBulkMove(order, target) {
  if (!order || !BULK_TARGETS.includes(target) || order.status === target) return false;
  if (target === 'in_progress') return order.status === 'pending';
  return order.status === 'pending' || order.status === 'in_progress';
}

/** تقسيم محدَّدات إلى المسموح والمرفوض (لتقرير العدد قبل التنفيذ). */
export function splitBulk(orders, ids, target) {
  const set = new Set(ids || []);
  const ok = []; const skipped = [];
  for (const o of orders || []) {
    if (!set.has(o.id)) continue;
    (canBulkMove(o, target) ? ok : skipped).push(o);
  }
  return { ok, skipped };
}
