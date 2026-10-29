/* ==========================================================================
   appointments.js — مستودع المواعيد
   ==========================================================================
   يضيف: بحث بالعميل/الطلب/الحالة، المواعيد القادمة، مواعيد اليوم.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';
import { startOfDay, startOfNextDay } from '../../core/day-math.js';

const base = createRepository(STORES.APPOINTMENTS);

export const appointments = {
  ...base,

  /**
   * مواعيد عميل معيّن.
   * @param {string} customerId
   * @returns {Promise<Array>}
   */
  async findByCustomer(customerId) {
    return base.findByIndex('by_customerId', customerId);
  },

  /**
   * مواعيد طلب معيّن.
   * @param {string} orderId
   * @returns {Promise<Array>}
   */
  async findByOrder(orderId) {
    return base.findByIndex('by_orderId', orderId);
  },

  /**
   * مواعيد بحالة معيّنة (scheduled | done | cancelled).
   * @param {string} status
   * @returns {Promise<Array>}
   */
  async listByStatus(status) {
    return base.findByIndex('by_status', status);
  },

  /**
   * المواعيد القادمة خلال N يوماً (مرتّبة تصاعدياً).
   * @param {number} [days=7]
   * @returns {Promise<Array>}
   */
  async getUpcoming(days = 7) {
    const now = Date.now();
    const limit = now + days * 24 * 60 * 60 * 1000;
    const all = await base.list();
    return all
      .filter(
        (a) =>
          a.date &&
          a.date >= now &&
          a.date <= limit &&
          a.status !== 'cancelled'
      )
      .sort((a, b) => a.date - b.date);
  },

  /**
   * مواعيد اليوم (من منتصف الليل إلى منتصف الليل التالي).
   * @returns {Promise<Array>}
   */
  async getToday() {
    const startMs = startOfDay(Date.now());
    const endMs = startOfNextDay(startMs); /* لا «+24 ساعة»: يوم التوقيت الصيفي 23 أو 25 ساعة */
    const all = await base.list();
    return all
      .filter((a) => a.date && a.date >= startMs && a.date < endMs)
      .sort((a, b) => a.date - b.date);
  },
};
