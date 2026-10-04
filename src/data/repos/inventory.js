/* ==========================================================================
   inventory.js — مستودع المخزون
   ==========================================================================
   يضيف: بحث بالاسم، تصفية بالفئة، تنبيه نقص المخزون، تعديل الكمية.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES, DEFAULT_SETTINGS } from '../../core/config.js';

const base = createRepository(STORES.INVENTORY);

export const inventory = {
  ...base,

  /**
   * بحث بالاسم (substring، غير حساس).
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByName(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((i) =>
      String(i.name ?? '').toLowerCase().includes(q)
    );
  },

  /**
   * أصناف فئة معيّنة.
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async listByCategory(category) {
    return base.findByIndex('by_category', category);
  },

  /**
   * الأصناف التي كميتها أقل من الحد الأدنى.
   * @param {number} [threshold] — افتراضي من DEFAULT_SETTINGS
   * @returns {Promise<Array>}
   */
  async getLowStock(threshold) {
    const min = Number(threshold) || DEFAULT_SETTINGS.inventory.minThreshold;
    const all = await base.list();
    return all.filter((i) => Number(i.quantity) < min);
  },

  /**
   * تعديل كمية صنف (زيادة أو نقصان).
   * @param {string} id
   * @param {number} delta — مقدار التغيير (+/-)
   * @returns {Promise<Object|null>}
   */
  async adjustStock(id, delta) {
    const item = await base.find(id);
    if (!item) return null;
    const newQty = Math.max(0, Number(item.quantity || 0) + Number(delta || 0));
    return base.update(id, { quantity: newQty });
  },
};
