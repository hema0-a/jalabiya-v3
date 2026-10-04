/* ==========================================================================
   customers.js — مستودع العملاء (طبقة متخصصة فوق Repository)
   ==========================================================================
   يضيف دوال بحث خاصة بالعملاء: هاتف، اسم، VIP.
   كل الدوال ترجع Promise.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.CUSTOMERS);

export const customers = {
  ...base,

  /**
   * البحث عن عميل بواسطة رقم الهاتف (مطابقة دقيقة).
   * @param {string} phone
   * @returns {Promise<Object|null>}
   */
  async findByPhone(phone) {
    const results = await base.findByIndex('by_phone', phone);
    return results[0] ?? null;
  },

  /**
   * بحث بالاسم (substring، غير حساس لحالة الأحرف).
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByName(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((c) =>
      String(c.name ?? '').toLowerCase().includes(q)
    );
  },

  /**
   * قائمة العملاء المميّزين (VIP).
   * @returns {Promise<Array>}
   */
  async listVIP() {
    return base.findByIndex('by_vip', true);
  },

  /**
   * تبديل حالة VIP لعميل.
   * @param {string} id
   * @returns {Promise<Object|null>} العميل المُحدَّث أو null
   */
  async toggleVIP(id) {
    const customer = await base.find(id);
    if (!customer) return null;
    return base.update(id, { vip: !customer.vip });
  },
};
