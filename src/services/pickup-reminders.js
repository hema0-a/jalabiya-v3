/* ==========================================================================
   pickup-reminders.js — طلبات «جاهزة» لم يستلمها العميل (v3.3.30)
   ==========================================================================
   حساب عرض فقط. عمر الجاهزية من readyAt، وإن غاب (طلبات قديمة) فمن updatedAt ثم createdAt.
   ========================================================================== */

import { orderPaidBreakdown } from './payments-view.js';
import { renderTemplate, workshopVars, KIND } from './message-templates.js';
import { formatEGP } from '../core/utils.js';

const DAY = 86400000;
export const DEFAULT_PICKUP_DAYS = 3;

export function readySince(order) {
  return Number(order && order.readyAt) || Number(order && order.updatedAt) || Number(order && order.createdAt) || 0;
}

/**
 * @returns {{items:Array, count:number, lateCount:number, remainingTotal:number}}
 *  items مرتبة الأقدم جاهزيةً أولاً. late = العمر ≥ minDays.
 */
export function computePickups(ordersList, paymentsList, customersList, now = Date.now(), minDays = DEFAULT_PICKUP_DAYS) {
  const orders = Array.isArray(ordersList) ? ordersList : [];
  const pays = Array.isArray(paymentsList) ? paymentsList : [];
  const custs = new Map((Array.isArray(customersList) ? customersList : []).map((c) => [c.id, c]));
  const byOrder = new Map();
  for (const p of pays) {
    if (!p || !p.orderId) continue;
    if (!byOrder.has(p.orderId)) byOrder.set(p.orderId, []);
    byOrder.get(p.orderId).push(p);
  }
  const items = [];
  for (const o of orders) {
    if (!o || o.status !== 'ready') continue;
    const since = readySince(o);
    const ageDays = since ? Math.max(0, Math.floor((now - since) / DAY)) : 0;
    const bd = orderPaidBreakdown(o, byOrder.get(o.id) || []);
    const remaining = Math.max(0, Math.round(((Number(o.amount) || 0) - (bd.paid || 0)) * 100) / 100);
    const c = custs.get(o.customerId) || null;
    items.push({
      orderId: o.id, customerId: o.customerId || null,
      name: c ? c.name : 'عميل غير معروف', phone: c ? (c.phone || '') : '',
      ageDays, late: ageDays >= minDays, remaining, amount: Number(o.amount) || 0,
    });
  }
  items.sort((a, b) => b.ageDays - a.ageDays);
  return {
    items, count: items.length,
    lateCount: items.filter((i) => i.late).length,
    remainingTotal: Math.round(items.reduce((s, i) => s + i.remaining, 0) * 100) / 100,
  };
}

/**
 * متغيرات رسالة «جاهز للاستلام» (تُستعمل أيضاً في طابور الرسائل).
 * @param {Object} item — عنصر من computePickups
 * @param {Object|string} [workshop] — كائن settings.workshop أو اسم الورشة
 */
export function pickupVars(item, workshop = '') {
  const remaining = Number(item && item.remaining) || 0;
  return {
    customer: (item && item.name) || '',
    orderId: '#' + String((item && item.orderId) || '').slice(-6),
    amount: formatEGP(Number(item && item.amount) || 0),
    remaining: formatEGP(remaining),
    remainingLine: remaining > 0 ? 'المتبقي عند الاستلام: ' + formatEGP(remaining) : '',
    phone: (item && item.phone) || '',
    ...workshopVars(workshop),
  };
}

/**
 * نص تذكير الاستلام. القالب قابل للتخصيص من الإعدادات (cfg = settings.autoMessages).
 */
export function buildPickupText(item, workshop = '', cfg = null) {
  return renderTemplate(KIND.PICKUP, pickupVars(item, workshop), cfg);
}
