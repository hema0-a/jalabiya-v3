/* ==========================================================================
   expenses.js — مستودع مصروفات الورشة
   ==========================================================================
   يضيف: بحث بالفئة، مصاريف فترة زمنية، مجموع، إحصائيات.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.EXPENSES);

/**
 * تجميع آمن للمبالغ (يتجاهل القيم غير الرقمية).
 * @param {Array} list
 * @returns {number}
 */
function sumAmounts(list) {
  return list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

export const expenses = {
  ...base,

  /**
   * مصاريف فئة معيّنة.
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async listByCategory(category) {
    return base.findByIndex('by_category', category);
  },

  /**
   * مصاريف فترة زمنية (شامل الحدّين).
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {Promise<Array>} مرتّبة تصاعدياً حسب date
   */
  async listByPeriod(fromMs, toMs) {
    const all = await base.list();
    return all
      .filter((e) => e.date && e.date >= fromMs && e.date <= toMs)
      .sort((a, b) => a.date - b.date);
  },

  /**
   * مجموع مصاريف فئة معيّنة.
   * @param {string} category
   * @returns {Promise<number>}
   */
  async sumByCategory(category) {
    const list = await base.findByIndex('by_category', category);
    return sumAmounts(list);
  },

  /**
   * مجموع مصاريف فترة زمنية.
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {Promise<number>}
   */
  async sumByPeriod(fromMs, toMs) {
    const list = await this.listByPeriod(fromMs, toMs);
    return sumAmounts(list);
  },
};
