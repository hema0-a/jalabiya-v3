/* ==========================================================================
   orders.js — مستودع الطلبات
   ==========================================================================
   يضيف دوال بحث: عميل، حالة، نشط، مستحق قريب، إحصائيات.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.ORDERS);

export const orders = {
  ...base,

  /**
   * طلبات عميل معيّن.
   * @param {string} customerId
   * @returns {Promise<Array>}
   */
  async findByCustomer(customerId) {
    return base.findByIndex('by_customerId', customerId);
  },

  /**
   * طلبات بحالة معيّنة.
   * @param {string} status — pending | in_progress | ready | delivered | cancelled
   * @returns {Promise<Array>}
   */
  async listByStatus(status) {
    return base.findByIndex('by_status', status);
  },

  /**
   * الطلبات النشطة (غير مسلَّمة وغير ملغاة).
   * @returns {Promise<Array>}
   */
  async getActive() {
    const all = await base.list();
    return all.filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    );
  },

  /**
   * الطلبات المستحقة خلال N يوماً.
   * @param {number} [days=3]
   * @returns {Promise<Array>} مرتّبة تصاعدياً حسب dueDate
   */
  async getDueSoon(days = 3) {
    const now = Date.now();
    const limit = now + days * 24 * 60 * 60 * 1000;
    const all = await base.list();
    return all
      .filter(
        (o) =>
          o.dueDate &&
          o.dueDate <= limit &&
          o.status !== 'delivered' &&
          o.status !== 'cancelled'
      )
      .sort((a, b) => a.dueDate - b.dueDate);
  },

  /**
   * إحصائيات الطلبات (عدد لكل حالة).
   * @returns {Promise<Object>}
   */
  async getStats() {
    const all = await base.list();
    const stats = {
      total: all.length,
      pending: 0,
      inProgress: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    all.forEach((o) => {
      if (o.status === 'pending') stats.pending++;
      else if (o.status === 'in_progress') stats.inProgress++;
      else if (o.status === 'ready') stats.ready++;
      else if (o.status === 'delivered') stats.delivered++;
      else if (o.status === 'cancelled') stats.cancelled++;
    });
    return stats;
  },
};
