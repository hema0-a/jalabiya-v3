/* ==========================================================================
   quotes.js — منطق عروض الأسعار (v3.3.30)
   ==========================================================================
   عرض السعر: بنود + خصم ثابت اختياري + صلاحية بالأيام. عند القبول يتحول إلى طلب
   (status = pending) بنفس بنوده وأسعاره، ويُربط العرض بالطلب (orderId).
   ========================================================================== */

const DAY = 86400000;
export const QUOTE_STATUS = { open: 'مفتوح', accepted: 'مُحوَّل لطلب', rejected: 'مرفوض' };
export const DEFAULT_VALID_DAYS = 7;

const nn = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;

export function quoteTotals(items, discount = 0) {
  const subtotal = r2((Array.isArray(items) ? items : []).reduce((s, it) => s + nn(it && it.price) * (nn(it && it.quantity) || 1), 0));
  const discountAmount = r2(Math.min(nn(discount), subtotal));
  return { subtotal, discountAmount, amount: r2(subtotal - discountAmount) };
}

export function isExpired(q, now = Date.now()) {
  return !!q && q.status === 'open' && Number(q.validUntil) > 0 && now > Number(q.validUntil);
}

export function validUntilFrom(createdAt, days = DEFAULT_VALID_DAYS) {
  return Number(createdAt) + Math.max(1, Number(days) || DEFAULT_VALID_DAYS) * DAY;
}

/** يبني حمولة طلب جديد من عرض سعر (بلا id) */
export function quoteToOrderPayload(q) {
  const items = (q.items || []).map((it) => ({
    id: it.id, name: it.name || 'بند', price: nn(it.price), quantity: nn(it.quantity) || 1,
  }));
  const t = quoteTotals(items, q.discount);
  return {
    customerId: q.customerId, status: 'pending', items,
    discountType: t.discountAmount > 0 ? 'fixed' : 'none', discountValue: t.discountAmount,
    discountAmount: t.discountAmount, extraFees: [], extraFeesTotal: 0,
    subtotal: t.subtotal, deposit: 0, amount: t.amount,
    notes: q.notes || '', fromQuoteId: q.id,
  };
}

export function buildQuoteText(q, customerName = '', workshopName = '') {
  const t = quoteTotals(q.items, q.discount);
  const lines = ['السلام عليكم ' + customerName + '،', 'عرض سعر' + (workshopName ? ' من ' + workshopName : '') + ':', ''];
  (q.items || []).forEach((it) => lines.push('• ' + (it.name || 'بند') + ' × ' + (nn(it.quantity) || 1) + ' = ' + r2(nn(it.price) * (nn(it.quantity) || 1)) + ' ج.م'));
  if (t.discountAmount > 0) lines.push('خصم: -' + t.discountAmount + ' ج.م');
  lines.push('', 'الإجمالي: ' + t.amount + ' ج.م');
  if (q.validUntil) lines.push('العرض ساري حتى ' + new Date(q.validUntil).toLocaleDateString('ar-EG'));
  if (q.notes) lines.push('', q.notes);
  return lines.join('\n');
}
