/* ==========================================================================
   worker-payments.js — مستودع دفعات العمال
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_workerId, by_date, by_createdAt
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.WORKER_PAYMENTS);

/**
 * تجميع آمن للمبالغ (يتجاهل القيم غير الرقمية).
 * @param {Array} list
 * @returns {number}
 */
function sumAmounts(list) {
  return list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export const workerPayments = {
  ...base,

  /**
   * دفعات عامل معيّن (مرتّبة بالأحدث).
   * @param {string} workerId
   * @returns {Promise<Array>}
   */
  async listByWorker(workerId) {
    const all = await base.list();
    return all
      .filter((p) => p.workerId === workerId)
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  },

  /**
   * مجموع الدفعات لعامل معيّن.
   * @param {string} workerId
   * @returns {Promise<number>}
   */
  async sumByWorker(workerId) {
    const all = await base.list();
    const filtered = all.filter((p) => p.workerId === workerId);
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

  /**
   * إحصائيات الشهر الحالي لعامل معيّن.
   * @param {string} workerId
   * @returns {Promise<{count:number, total:number}>}
   */
  async getCurrentMonthStats(workerId) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(y, m, 1).getTime();
    const end = new Date(y, m + 1, 1).getTime();

    const all = await base.list();
    const filtered = all.filter((p) =>
      p.workerId === workerId &&
      p.date && p.date >= start && p.date < end
    );
    return { count: filtered.length, total: sumAmounts(filtered) };
  },
};
