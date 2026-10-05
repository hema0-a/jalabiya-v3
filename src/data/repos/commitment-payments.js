/* ==========================================================================
   commitment-payments.js — مستودع دفعات الالتزامات
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_commitmentId, by_date
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.COMMITMENT_PAYMENTS);

/**
 * تجميع آمن للمبالغ.
 * @param {Array} list
 * @returns {number}
 */
function sumAmounts(list) {
  return list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export const commitmentPayments = {
  ...base,

  /**
   * دفعات التزام معيّن (مرتّبة بالأحدث).
   * @param {string} commitmentId
   * @returns {Promise<Array>}
   */
  async listByCommitment(commitmentId) {
    const all = await base.list();
    return all
      .filter((p) => p.commitmentId === commitmentId)
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  },

  /**
   * مجموع الدفعات لالتزام معيّن.
   * @param {string} commitmentId
   * @returns {Promise<number>}
   */
  async sumByCommitment(commitmentId) {
    const all = await base.list();
    const filtered = all.filter((p) => p.commitmentId === commitmentId);
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
    const list = await this.listByPeriod(fromMs, toMs);
    return sumAmounts(list);
  },

  /**
   * عدد الدفعات لالتزام معيّن في الشهر الحالي.
   * @param {string} commitmentId
   * @returns {Promise<{count:number, total:number}>}
   */
  async getCurrentMonthStats(commitmentId) {
    const all = await base.list();
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(y, m, 1).getTime();
    const end = new Date(y, m + 1, 1).getTime();
    const filtered = all.filter((p) =>
      p.commitmentId === commitmentId &&
      p.date && p.date >= start && p.date < end
    );
    return { count: filtered.length, total: sumAmounts(filtered) };
  },
};
