/* ==========================================================================
   payments-view.js — عرض موحّد للمدفوعات الفعلية (مع المقدم)
   ==========================================================================
   القاعدة (نفس قاعدة المعاينة السريعة quick-preview):
   - الطلب الذي له دفعات مسجّلة → تُحسب دفعاته فقط.
   - الطلب بلا أي دفعة وله مقدم (deposit) → يُحسب المقدم كمبلغ مقبوض
     بتاريخ إنشاء الطلب، حتى لا يظهر المقدم في الفاتورة ويغيب عن الحسابات.
   - الطلبات الملغاة لا يُضاف مقدمها.
   لا يكتب شيئاً في قاعدة البيانات — حساب عرض فقط، فلا يوجد تكرار عند
   تسجيل المقدم لاحقاً كدفعة عادية.
   ========================================================================== */

/**
 * @param {Array} paymentsList — الدفعات المسجّلة
 * @param {Array} ordersList — كل الطلبات
 * @returns {Array} الدفعات + دفعات مقدم افتراضية (synthetic:true)
 */
export function withDepositPayments(paymentsList, ordersList) {
  const payments = Array.isArray(paymentsList) ? paymentsList : [];
  const orders = Array.isArray(ordersList) ? ordersList : [];
  const paidOrderIds = new Set(payments.map((p) => p && p.orderId).filter(Boolean));
  const extra = [];

  for (const o of orders) {
    if (!o || o.status === 'cancelled') continue;
    const deposit = Number(o.deposit) || 0;
    if (deposit <= 0 || paidOrderIds.has(o.id)) continue;
    extra.push({
      id: 'deposit-' + o.id,
      customerId: o.customerId,
      orderId: o.id,
      amount: deposit,
      method: 'deposit',
      createdAt: o.createdAt || o.receivedDate || 0,
      synthetic: true,
    });
  }
  return extra.length > 0 ? payments.concat(extra) : payments;
}
