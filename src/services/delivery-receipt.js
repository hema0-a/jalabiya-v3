/* ==========================================================================
   delivery-receipt.js — تحصيل نسبي + إيصال تسليم جزئي (v3.3.60)
   ==========================================================================
   عند كل تسليم جزئي:
     - suggestCollection: المبلغ المستحق عن القطع المسلَّمة مخصوماً منه ما دُفع (اقتراح فقط).
     - buildDeliveryReceiptModel: أرقام إيصال تسليمة بعينها (المسلَّم/المتبقي/المبلغ).
   القاعدة الموحّدة نفسها: المدفوع = orderPaidBreakdown (الدفعات + المقدم غير المسجّل)،
   وقيمة المسلَّم = نصيبه من مبلغ الطلب الصافي بنسبة قيمة البنود (deliveryProgress).
   دوال نقية: لا DOM ولا قاعدة بيانات (النموذج يستلم الدفعات والتسليمة كمدخلات).
   ========================================================================== */

import { deliveryProgress, applyDelivery } from './partial-delivery.js';
import { orderPaidBreakdown } from './payments-view.js';

const cents = (v) => Math.round((Number(v) || 0) * 100);
const money = (c) => c / 100;

/** تسليمات الطلب مرتّبة زمنياً (نفس تنظيف partial-delivery). */
function sortedDeliveries(order) {
  const list = Array.isArray(order && order.deliveries) ? order.deliveries : [];
  return list
    .filter((d) => d && Array.isArray(d.items) && d.items.some((e) => e && e.id != null && Number(e.qty) > 0))
    .map((d) => ({ ...d, at: Number(d.at) || 0 }))
    .sort((a, b) => a.at - b.at);
}

/** تقدّم الطلب كما كان بعد أول `count` تسليمات. */
function progressAfter(order, count) {
  return deliveryProgress({ ...order, status: 'in_progress', deliveries: sortedDeliveries(order).slice(0, count) });
}

/**
 * اقتراح التحصيل لتسليمة مخطَّطة (قبل التأكيد).
 * @param {Object} order
 * @param {Array} orderPayments — دفعات هذا الطلب المسجّلة
 * @param {Object<string,number>} selection — { معرّف البند: كمية }
 * @returns {{ok:true, units:number, completes:boolean, deliveredValue:number, remainingValue:number,
 *   paid:number, dueForDelivered:number, balance:number, suggested:number}|{ok:false, error:string}}
 *   suggested = المستحق عن المسلَّم (بعد هذه التسليمة) − المدفوع، وبسقف المتبقي على الطلب.
 */
export function suggestCollection(order, orderPayments, selection) {
  const res = applyDelivery(order, selection, { now: Date.now(), id: 'plan' });
  if (!res.ok) return res;
  const after = deliveryProgress({ ...order, ...res.patch });
  const paidC = cents(orderPaidBreakdown(order, orderPayments).paid);
  const amountC = cents(order.amount);
  const deliveredC = cents(after.deliveredValue);
  const dueC = Math.max(0, deliveredC - paidC);
  const balanceC = Math.max(0, amountC - paidC);
  return {
    ok: true,
    units: res.units,
    completes: res.completes,
    deliveredValue: money(deliveredC),
    remainingValue: money(Math.max(0, amountC - deliveredC)),
    paid: money(paidC),
    dueForDelivered: money(dueC),
    balance: money(balanceC),
    suggested: money(Math.min(dueC, balanceC)),
  };
}

/**
 * نموذج إيصال تسليمة محفوظة.
 * @param {Object} args
 * @param {Object} args.order — الطلب (بتسليماته)
 * @param {string} args.deliveryId
 * @param {Array} [args.payments] — دفعات الطلب المسجّلة (لحساب المدفوع والمحصَّل في هذه التسليمة)
 * @param {number} [args.collected] — مبلغ حُصِّل عند هذه التسليمة (يغلب مجموع الدفعات المربوطة بها)
 * @returns {null|{
 *   at:number, note:string, thisItems:Array<{name:string,qty:number}>, thisUnits:number, thisValue:number,
 *   deliveredUnits:number, totalUnits:number, percent:number, deliveredValue:number,
 *   remainingLines:Array<{name:string,remaining:number}>, remainingUnits:number, remainingValue:number,
 *   paid:number, collected:number, dueForDelivered:number, balance:number, completes:boolean
 * }}
 */
export function buildDeliveryReceiptModel({ order, deliveryId, payments, collected }) {
  const list = sortedDeliveries(order);
  const idx = list.findIndex((d) => d.id === deliveryId);
  if (idx < 0) return null;

  const before = progressAfter(order, idx);
  const after = progressAfter(order, idx + 1);
  const entry = after.history.find((h) => h.id === deliveryId);
  if (!entry) return null;

  const pays = Array.isArray(payments) ? payments : [];
  const paidC = cents(orderPaidBreakdown(order, pays).paid);
  const amountC = cents(order.amount);
  const deliveredC = cents(after.deliveredValue);
  const thisC = deliveredC - cents(before.deliveredValue);

  let collectedC = 0;
  if (collected !== undefined && collected !== null && Number.isFinite(Number(collected))) {
    collectedC = cents(collected);
  } else {
    collectedC = pays.filter((p) => p && p.deliveryId === deliveryId).reduce((s, p) => s + cents(p.amount), 0);
  }

  return {
    at: entry.at,
    note: entry.note || '',
    thisItems: entry.items.map((x) => ({ name: x.name, qty: x.qty })),
    thisUnits: entry.units,
    thisValue: money(thisC),
    deliveredUnits: after.deliveredUnits,
    totalUnits: after.totalUnits,
    percent: after.percent,
    deliveredValue: money(deliveredC),
    remainingLines: after.lines.filter((l) => l.remaining > 0).map((l) => ({ name: l.name, remaining: l.remaining })),
    remainingUnits: after.remainingUnits,
    remainingValue: money(Math.max(0, amountC - deliveredC)),
    paid: money(paidC),
    collected: money(collectedC),
    dueForDelivered: money(Math.max(0, deliveredC - paidC)),
    balance: money(Math.max(0, amountC - paidC)),
    completes: after.remainingUnits === 0,
  };
}

/** سطر الرسالة المرفقة بالصورة (واتساب). */
export function receiptCaption(id6, m, formatMoney) {
  const parts = ['إيصال تسليم #' + id6, 'سُلِّم ' + m.deliveredUnits + ' من ' + m.totalUnits + ' قطعة'];
  if (m.collected > 0) parts.push('تم تحصيل ' + formatMoney(m.collected));
  parts.push(m.balance > 0 ? 'المتبقي ' + formatMoney(m.balance) : 'مدفوع بالكامل');
  return parts.join(' — ');
}
