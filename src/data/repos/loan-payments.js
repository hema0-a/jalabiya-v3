/* ==========================================================================
   loan-payments.js — مستودع دفعات القروض
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_loanId, by_date
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.LOAN_PAYMENTS);

/**
 * تجميع آمن للمبالغ (يتجاهل القيم غير الرقمية).
 * @param {Array} list
 * @returns {number}
 */
function sumAmounts(list) {
  return list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export const loanPayments = {
  ...base,

  /**
   * دفعات قرض معيّن (مرتّبة بالأحدث).
   * @param {string} loanId
   * @returns {Promise<Array>}
   */
  async listByLoan(loanId) {
    const all = await base.list();
    return all
      .filter((p) => p.loanId === loanId)
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  },

  /**
   * مجموع الدفعات لقرض معيّن.
   * @param {string} loanId
   * @returns {Promise<number>}
   */
  async sumByLoan(loanId) {
    const all = await base.list();
    const filtered = all.filter((p) => p.loanId === loanId);
    return sumAmounts(filtered);
  },

  /**
   * الدفعات في فترة زمنية.
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {Promise<Array>}
   */
  async listByPeriod(fromMs, toMs) {
    const all = await base.list();
    return all
      .filter((p) => p.date && p.date >= fromMs && p.date < toMs)
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  },

  /**
   * مجموع الدفعات في فترة.
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {Promise<number>}
   */
  async sumByPeriod(fromMs, toMs) {
    const all = await base.list();
    const filtered = all.filter((p) => p.date && p.date >= fromMs && p.date < toMs);
    return sumAmounts(filtered);
  },
};
