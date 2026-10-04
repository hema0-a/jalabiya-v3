/* ==========================================================================
   payments.js — مستودع الدفعات
   ==========================================================================
   يضيف: بحث بالطلب/العميل، ومجموع المدفوعات.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.PAYMENTS);

/**
 * تجميع آمن للمبالغ (يتجاهل القيم غير الرقمية).
 * @param {Array} list
 * @returns {number}
 */
function sumAmounts(list) {
  return list.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export const payments = {
  ...base,

  /**
   * دفعات طلب معيّن.
   * @param {string} orderId
   * @returns {Promise<Array>}
   */
  async findByOrder(orderId) {
    return base.findByIndex('by_orderId', orderId);
  },

  /**
   * دفعات عميل معيّن.
   * @param {string} customerId
   * @returns {Promise<Array>}
   */
  async findByCustomer(customerId) {
    return base.findByIndex('by_customerId', customerId);
  },

  /**
   * مجموع المدفوعات لطلب معيّن.
   * @param {string} orderId
   * @returns {Promise<number>}
   */
  async sumByOrder(orderId) {
    const list = await base.findByIndex('by_orderId', orderId);
    return sumAmounts(list);
  },

  /**
   * مجموع المدفوعات لعميل معيّن.
   * @param {string} customerId
   * @returns {Promise<number>}
   */
  async sumByCustomer(customerId) {
    const list = await base.findByIndex('by_customerId', customerId);
    return sumAmounts(list);
  },
};
