/* ==========================================================================
   loans-calculator.js — حسابات القروض الشخصية
   ==========================================================================
   - تحويل القرض + دفعاته إلى ملخص (مدفوع/متبقي/نسبة تقدم).
   - إحصائيات شاملة (ليّ vs عليّ).
   - صافي الرصيد.
   - لا Cache داخلي — الحساب سريع.
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
