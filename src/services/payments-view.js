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

/* ==========================================================================
   مصروفات الرواتب: دفعات العمال (صفحة العمال) تُحسب مصروفاً (فئة salary)
   ==========================================================================
   - دفعة العامل لا تُنشئ سجلاً في صفحة المصروفات، فكانت الأرباح مبالغاً فيها.
   - لتفادي التكرار: إن وُجد مصروف يدوي بفئة "رواتب" بالمبلغ نفسه وبفارق
     أقصاه 3 أيام يُعتبر هو نفسه الدفعة ولا يُضاف شيء (مطابقة واحد لواحد).
   - حساب عرض فقط، ولا يكتب في قاعدة البيانات.
   ========================================================================== */

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * @param {Array} expensesList — المصروفات المسجّلة
 * @param {Array} workerPaymentsList — دفعات العمال
 * @returns {Array} المصروفات + مصروفات رواتب افتراضية (synthetic:true)
 */
export function withWorkerExpenses(expensesList, workerPaymentsList) {
  const expenses = Array.isArray(expensesList) ? expensesList : [];
  const pays = (Array.isArray(workerPaymentsList) ? workerPaymentsList : [])
    .filter((p) => p && (Number(p.amount) || 0) > 0)
    .sort((a, b) => (a.date || 0) - (b.date || 0));
  if (pays.length === 0) return expenses;

  const used = new Set();
  const extra = [];

  for (const p of pays) {
    const amount = Number(p.amount) || 0;
    const date = p.date || p.createdAt || 0;
    let matched = -1;
    for (let i = 0; i < expenses.length; i++) {
      if (used.has(i)) continue;
      const e = expenses[i];
      if (!e || e.category !== 'salary') continue;
      if (Math.abs((Number(e.amount) || 0) - amount) > 0.009) continue;
      if (Math.abs((e.date || 0) - date) > MATCH_WINDOW_MS) continue;
      matched = i;
      break;
    }
    if (matched >= 0) { used.add(matched); continue; }
    extra.push({
      id: 'wpay-' + p.id,
      category: 'salary',
      amount,
      date,
      description: 'دفعة عامل',
      synthetic: true,
    });
  }
  return extra.length > 0 ? expenses.concat(extra) : expenses;
}
