/* ==========================================================================
   inventory.js — مستودع المخزون
   ==========================================================================
   يضيف: بحث بالاسم، تصفية بالفئة، تنبيه نقص المخزون (per-item + global)،
         تعديل الكمية، إحصائيات القيمة.
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
   * هل الصنف منخفض؟
   * يستخدم minQuantity الخاص بالصنف، أو الحد العام.
   * @param {Object} item
   * @param {number} [globalThreshold]
   * @returns {boolean}
   */
  _isLow(item, globalThreshold) {
    const threshold = Number(item.minQuantity) > 0
      ? Number(item.minQuantity)
      : (Number(globalThreshold) || DEFAULT_SETTINGS.inventory.minThreshold);
    return Number(item.quantity) < threshold;
  },

  /**
   * الأصناف التي كميتها أقل من الحد الأدنى (per-item + global).
   * @param {number} [threshold] — الحد العام (يفيد عند عدم وجود minQuantity)
   * @returns {Promise<Array>}
   */
  async getLowStock(threshold) {
    const globalThreshold = Number(threshold) || DEFAULT_SETTINGS.inventory.minThreshold;
    const all = await base.list();
    return all.filter((i) => this._isLow(i, globalThreshold));
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

  /**
   * إحصائيات شاملة (عدد + قيمة المخزون + عدد النواقص).
   * @param {number} [threshold]
   * @returns {Promise<{count:number, totalValue:number, lowCount:number, byCategory:Object}>}
   */
  async getStats(threshold) {
    const all = await base.list();
    const globalThreshold = Number(threshold) || DEFAULT_SETTINGS.inventory.minThreshold;

    let totalValue = 0;
    let lowCount = 0;
    const byCategory = {};

    all.forEach((i) => {
      const qty = Number(i.quantity) || 0;
      const price = Number(i.price) || 0;
      totalValue += qty * price;

      if (this._isLow(i, globalThreshold)) lowCount++;

      const cat = i.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0 };
      byCategory[cat].count++;
      byCategory[cat].value += qty * price;
    });

    return {
      count: all.length,
      totalValue: Math.round(totalValue * 100) / 100,
      lowCount,
      byCategory,
    };
  },
};
