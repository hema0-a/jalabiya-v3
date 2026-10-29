/* ==========================================================================
   orders-logic.js — منطق الطلبات النقي: ثوابت وحسابات وفلترة وتجميع (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون أي تغيير في المنطق (تقسيم صيانة فقط). بلا DOM وبلا حالة.
   orders.js يعيد تصدير: filterOrders · computeTotals · MAX_DISCOUNT_PERCENT · discountPercentOf · isDiscountExcessive · groupOrders.
   ========================================================================== */

import { uid, toNonNegative } from '../core/utils.js';
import { getActiveSession } from '../services/order-timing.js';

/* --- الحالات --- */
export const STATUS_MAP = {
  pending:     { label: 'قيد الانتظار', badge: 'badge--warning', color: '#F57C00' },
  in_progress: { label: 'قيد التنفيذ',  badge: 'badge--info',    color: '#1565C0' },
  ready:       { label: 'جاهز للتسليم', badge: 'badge--accent',  color: '#6A1B9A' },
  delivered:   { label: 'تم التسليم',   badge: 'badge--success', color: '#2E7D32' },
  cancelled:   { label: 'ملغي',         badge: 'badge--danger',  color: '#C62828' },
};

export const STATUS_ORDER = ['pending', 'in_progress', 'ready', 'delivered', 'cancelled'];

export const EXTRA_FEE_TYPES = [
  { id: 'urgency',   label: 'استعجال',    value: 20 },
  { id: 'modify',    label: 'تعديلات',    value: 10 },
  { id: 'delivery',  label: 'توصيل',      value: 0  },
  { id: 'packaging', label: 'تغليف مميز', value: 5  },
  { id: 'other',     label: 'أخرى',       value: 0  },
];

export const DAY_MS = 86400000;

/* ==========================================================================
   1. الفلترة
   ========================================================================== */

/**
 * @param {Array} list
 * @param {string} filterId — all | at_risk | حالة طلب
 * @param {Map|Set} [riskIds] — لفلتر at_risk: مفاتيح معرّفات الطلبات المعرَّضة للتأخر
 */
export function filterOrders(list, filterId, riskIds) {
  if (filterId === 'all') return list;
  if (filterId === 'at_risk') return list.filter((o) => !!riskIds && riskIds.has(o.id));
  return list.filter((o) => o.status === filterId);
}

/* ==========================================================================
   2. الحسابات
   ========================================================================== */

export function computeTotals(items, discountType, discountValue, extraFees) {
  const subtotal = (items || []).reduce(
    (s, it) => s + toNonNegative(it.price) * toNonNegative(it.quantity), 0
  );
  const dv = toNonNegative(discountValue);
  let discountAmount = 0;
  if (discountType === 'percent') discountAmount = subtotal * (dv / 100);
  else if (discountType === 'fixed') discountAmount = dv;
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
  const extraFeesTotal = (extraFees || []).reduce((s, f) => {
    const v = toNonNegative(f.value);
    if (f.type === 'percent') return s + subtotal * (v / 100);
    return s + v;
  }, 0);
  const amount = Math.max(0, subtotal - discountAmount + extraFeesTotal);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    extraFeesTotal: Math.round(extraFeesTotal * 100) / 100,
    amount: Math.round(amount * 100) / 100,
  };
}

/* --- حدّ الخصم (v3.3.42): خصم يتجاوز النسبة يطلب تأكيداً لتفادي أخطاء الإدخال (مثل 500 بدل 50) --- */
export const MAX_DISCOUNT_PERCENT = 20;

/** نسبة الخصم من المجموع الفرعي (0 عند عدم وجود خصم). */
export function discountPercentOf(totals) {
  const sub = Number(totals && totals.subtotal) || 0;
  const d = Number(totals && totals.discountAmount) || 0;
  return sub > 0 ? Math.round((d / sub) * 1000) / 10 : 0;
}

/** هل الخصم أعلى من الحد المسموح بلا تأكيد؟ */
export function isDiscountExcessive(totals, limit = MAX_DISCOUNT_PERCENT) {
  return discountPercentOf(totals) > limit;
}

export function itemsFromOrder(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it) => ({
      id: it.id || uid(),
      name: it.name || 'بند',
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
    }));
  }
  return [{
    id: uid(),
    name: order.notes || order.garmentType || 'طلب جلابية',
    price: Number(order.amount) || 0,
    quantity: Number(order.quantity) || 1,
  }];
}

export function orderType(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return String(order.items[0].name || '').trim() || 'بدون نوع';
  }
  return String(order.garmentType || order.notes || 'بدون نوع').trim();
}
export function groupOrders(list, opts = {}) {
  const sameTypeOnly = opts.sameTypeOnly !== false;
  const groups = new Map();
  list.forEach((o) => {
    const cid = o.customerId || 'unknown';
    const type = sameTypeOnly ? orderType(o).toLowerCase() : '*';
    const key = cid + '::' + type;
    if (!groups.has(key)) {
      groups.set(key, { key, customerId: cid, type: sameTypeOnly ? orderType(o) : 'متنوعة', orders: [], totalAmount: 0 });
    }
    const g = groups.get(key);
    g.orders.push(o);
    g.totalAmount += Number(o.amount) || 0;
  });
  return Array.from(groups.values())
    .filter((g) => g.orders.length > 1)
    .sort((a, b) => b.orders.length - a.orders.length);
}

/** عدد البطاقات الظاهرة في كل عمود كانبان قبل «عرض المزيد». */
export const KANBAN_PAGE = 30;

/**
 * ترتيب عمود الكانبان: الأعمدة النشطة بأقرب موعد تسليم أولاً (العاجل قبله، وبلا موعد في الآخر)
 * كي لا يكون الأقرب للتأخر هو ما يُخفى؛ المسلَّم والملغى بالأحدث أولاً.
 * @param {string} status
 * @param {Array} list
 * @returns {Array} نسخة مرتّبة
 */
export function kanbanSorted(status, list) {
  const out = list.slice();
  if (status === 'pending' || status === 'in_progress' || status === 'ready') {
    out.sort((a, b) =>
      ((b.urgent ? 1 : 0) - (a.urgent ? 1 : 0)) ||
      ((a.dueDate || Infinity) - (b.dueDate || Infinity)) ||
      ((b.createdAt || 0) - (a.createdAt || 0)));
  }
  return out;
}

/**
 * جلسات العمل كما تُعرض: طلب مسلَّم/ملغى بجلسة ما زالت مفتوحة (بيانات قبل v3.3.76) تُغلق عند وقت التسليم
 * بدل أن يستمر حساب ساعاته إلى الآن للأبد.
 * @param {Object} o — الطلب
 * @returns {Array}
 */
export function sessionsOf(o) {
  const s = Array.isArray(o.workSessions) ? o.workSessions : [];
  if ((o.status === 'delivered' || o.status === 'cancelled') && getActiveSession(s)) {
    const last = s[s.length - 1];
    const end = Math.max(Number(last.start) || 0, Number(o.deliveredAt) || Number(o.updatedAt) || 0);
    return [...s.slice(0, -1), { start: last.start, end }];
  }
  return s;
}
