/* ==========================================================================
   payments-view.js — عرض موحّد للمدفوعات الفعلية (مع المقدم)
   ==========================================================================
   القاعدة الموحّدة (الحسابات + المعاينة السريعة + الفاتورة):
   - المقدم (deposit) حقل في الطلب لا يُنشئ سجل دفعة، فهو مبلغ مقبوض فعلاً.
   - يُحسب المقدم فوق الدفعات المسجّلة، إلا إذا عُلِّمت دفعة بـ isDeposit=true (من نموذج الدفعة)
     فلا يُعدّ مرتين. الدفعات القديمة بلا هذا الحقل تُطابَق بالمبلغ (توافق رجعي فقط).
   - (قبل v3.3.12 كان المقدم يُتجاهل بمجرد وجود أي دفعة على الطلب، فيظهر المدفوع
     أقل من الحقيقي والمتبقي أكبر.)
   - الطلبات الملغاة لا يُضاف مقدمها في الحسابات الإجمالية.
   لا يكتب شيئاً في قاعدة البيانات — حساب عرض فقط.
   ========================================================================== */

const AMOUNT_EPS = 0.009;

/**
 * المقدم الذي لم يُسجَّل كدفعة (يُضاف للمدفوع).
 * @param {number|string} deposit — مقدم الطلب
 * @param {Array} orderPayments — الدفعات المسجّلة لهذا الطلب فقط
 * @returns {number} المبلغ الواجب إضافته (0 إن لا مقدم أو سُجّل كدفعة)
 */
export function unrecordedDeposit(deposit, orderPayments) {
  const d = Number(deposit) || 0;
  if (d <= 0) return 0;
  const list = Array.isArray(orderPayments) ? orderPayments : [];
  /* 1) علامة صريحة: دفعة عُلِّمت من النموذج بأنها المقدم نفسه */
  if (list.some((p) => p && p.isDeposit === true)) return 0;
  /* 2) توافق مع البيانات القديمة فقط (دفعات بلا حقل isDeposit): مطابقة المبلغ.
        الدفعات الجديدة تحمل isDeposit=false فلا تُطابَق، فلا يضيع المقدم
        إن دفع العميل لاحقاً دفعة بمبلغ المقدم نفسه. */
  const recordedAsPayment = list.some((p) => p && p.isDeposit == null &&
    Math.abs((Number(p.amount) || 0) - d) <= AMOUNT_EPS);
  return recordedAsPayment ? 0 : d;
}

/**
 * إجمالي المدفوع لطلب واحد = الدفعات المسجّلة + المقدم غير المسجّل.
 * @param {Object} order
 * @param {Array} orderPayments — دفعات هذا الطلب فقط
 * @returns {{recorded:number, deposit:number, paid:number}}
 */
export function orderPaidBreakdown(order, orderPayments) {
  const list = Array.isArray(orderPayments) ? orderPayments : [];
  const recorded = list.reduce((s, p) => s + (Number(p && p.amount) || 0), 0);
  const deposit = unrecordedDeposit(order && order.deposit, list);
  return { recorded, deposit, paid: recorded + deposit };
}

/**
 * @param {Array} paymentsList — الدفعات المسجّلة
 * @param {Array} ordersList — كل الطلبات
 * @returns {Array} الدفعات + دفعات مقدم افتراضية (synthetic:true)
 */
export function withDepositPayments(paymentsList, ordersList) {
  const payments = Array.isArray(paymentsList) ? paymentsList : [];
  const orders = Array.isArray(ordersList) ? ordersList : [];
  const byOrder = new Map();
  for (const p of payments) {
    if (!p || !p.orderId) continue;
    if (!byOrder.has(p.orderId)) byOrder.set(p.orderId, []);
    byOrder.get(p.orderId).push(p);
  }
  const extra = [];

  for (const o of orders) {
    if (!o || o.status === 'cancelled') continue;
    const amount = unrecordedDeposit(o.deposit, byOrder.get(o.id));
    if (amount <= 0) continue;
    extra.push({
      id: 'deposit-' + o.id,
      customerId: o.customerId,
      orderId: o.id,
      amount,
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
