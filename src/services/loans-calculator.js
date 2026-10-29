/* ==========================================================================
   loans-calculator.js — حسابات القروض الشخصية
   ==========================================================================
   - تحويل القرض + دفعاته إلى ملخص (مدفوع/متبقي/نسبة تقدم).
   - إحصائيات شاملة (ليّ vs عليّ).
   - صافي الرصيد.
   - لا Cache داخلي — الحساب سريع.
   - فحص مبلغ الدفعة مقابل المتبقي (v3.3.71): validateLoanPayment / getLoanRemaining.
   ========================================================================== */

import { personalLoans } from '../data/repos/personal-loans.js';
import { loanPayments } from '../data/repos/loan-payments.js';

/**
 * تجميع آمن للمبالغ.
 * @param {Array} list
 * @returns {number}
 */
function sumAmounts(list) {
  return list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

/** تقريب لمليمين (يتفادى خطأ الفاصلة العائمة مثل 0.1 + 0.2). */
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * فحص مبلغ دفعة مقابل المتبقي على القرض (المقارنة بالمليم).
 * @param {number} amount — المبلغ المُدخل
 * @param {number} remaining — المتبقي الحالي
 * @returns {{ok:boolean, code:'ok'|'invalid'|'settled'|'exceeds', remaining:number}}
 */
export function validateLoanPayment(amount, remaining) {
  const rem = round2(Math.max(0, Number(remaining) || 0));
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, code: 'invalid', remaining: rem };
  if (rem <= 0) return { ok: false, code: 'settled', remaining: rem };
  if (Math.round(amt * 100) > Math.round(rem * 100)) return { ok: false, code: 'exceeds', remaining: rem };
  return { ok: true, code: 'ok', remaining: rem };
}

/**
 * القيمة الافتراضية لحقل الدفعة: المتبقي بمليمين (بلا تقريب لأقرب جنيه)،
 * وفارغة إن سُدِّد القرض (كان يرجع لمبلغ القرض كاملاً).
 * @param {{remaining?:number, amount?:number}} loan — قرض مع تفاصيله
 * @returns {string}
 */
export function defaultPaymentValue(loan) {
  const hasRemaining = loan && loan.remaining !== undefined && loan.remaining !== null && Number.isFinite(Number(loan.remaining));
  const rem = round2(hasRemaining ? loan.remaining : (loan && loan.amount));
  return rem > 0 ? String(rem) : '';
}

/**
 * المتبقي الحالي على قرض من قاعدة البيانات لحظة الاستدعاء
 * (المبلغ والدفعات يُعاد قراءتهما، فلا يعتمد على بطاقة قديمة).
 * @param {{id:string, amount?:number}} loan
 * @returns {Promise<number>}
 */
export async function getLoanRemaining(loan) {
  let fresh = null;
  try { fresh = await personalLoans.find(loan.id); } catch (e) { /* نكتفي بالبطاقة */ }
  const amount = Number((fresh || loan).amount) || 0;
  const paid = await loanPayments.sumByLoan(loan.id);
  return round2(Math.max(0, amount - paid));
}

/**
 * حساب تفاصيل قرض واحد (المدفوع/المتبقي/نسبة التقدم).
 * @param {Object} loan — سجل القرض
 * @param {Array} allPayments — كل الدفعات (لتحسين الأداء)
 * @returns {{
 *   ...Object,
 *   totalPaid:number,
 *   remaining:number,
 *   progressPercent:number,
 *   paymentsCount:number
 * }}
 */
export function computeLoanDetails(loan, allPayments) {
  const payments = allPayments.filter((p) => p.loanId === loan.id);
  const totalPaid = sumAmounts(payments);
  const amount = Number(loan.amount) || 0;
  const remaining = Math.max(0, amount - totalPaid);
  const progressPercent = amount > 0
    ? Math.min(100, Math.round((totalPaid / amount) * 100))
    : 0;

  return {
    ...loan,
    totalPaid,
    remaining,
    progressPercent,
    paymentsCount: payments.length,
  };
}

/**
 * جلب كل القروض مع بيانات الدفع (المدفوع/المتبقي/النسبة).
 * @returns {Promise<Array>}
 */
export async function getLoansWithPayments() {
  const [loans, payments] = await Promise.all([
    personalLoans.list(),
    loanPayments.list(),
  ]);

  return loans
    .map((loan) => computeLoanDetails(loan, payments))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * إحصائيات شاملة للقروض (عدد + مبلغ + مدفوع + متبقي لكل نوع).
 * @returns {Promise<{
 *   given:    {count:number, total:number, paid:number, remaining:number},
 *   received: {count:number, total:number, paid:number, remaining:number},
 *   netBalance:number
 * }>}
 */
export async function getLoansStats() {
  const loansWithPayments = await getLoansWithPayments();

  const stats = {
    given:    { count: 0, total: 0, paid: 0, remaining: 0 },
    received: { count: 0, total: 0, paid: 0, remaining: 0 },
    netBalance: 0,
  };

  loansWithPayments.forEach((l) => {
    const bucket = l.type === 'received' ? stats.received : stats.given;
    bucket.count++;
    bucket.total += Number(l.amount) || 0;
    bucket.paid += l.totalPaid;
    bucket.remaining += l.remaining;
  });

  /* صافي الرصيد: ليّ (مستحق لك) − عليّ (مستحق عليك) */
  stats.netBalance = stats.given.remaining - stats.received.remaining;

  return stats;
}
