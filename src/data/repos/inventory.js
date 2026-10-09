/* ==========================================================================
   inventory.js — مستودع المخزون
   ==========================================================================
   يضيف: بحث بالاسم، تصفية بالفئة، تنبيه نقص المخزون (per-item + global)،
         تعديل الكمية، إحصائيات القيمة.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES, DEFAULT_SETTINGS } from '../../core/config.js';
import { settings } from './settings.js';

const base = createRepository(STORES.INVENTORY);

/**
 * الحد العام لنقص المخزون من الإعدادات (مع الرجوع للافتراضي).
 * كان الحد المحفوظ من الإعدادات لا يُقرأ في أي مكان، فتجاهلته كل الشاشات.
 * @returns {Promise<number>}
 */
async function resolveGlobalThreshold() {
  try {
    const s = await settings.get();
    const n = Number(s && s.inventory && s.inventory.minThreshold);
    if (isFinite(n) && n > 0) return n;
  } catch (e) { /* نرجع للافتراضي */ }
  return DEFAULT_SETTINGS.inventory.minThreshold;
}

/**
 * هل الصنف منخفض؟ (دالة نقية — تُستخدم في كل الشاشات لتوحيد القاعدة).
 * حد الصنف الخاص إن وُجد، وإلا الحد العام.
 * @param {Object} item
 * @param {number} globalThreshold
 * @returns {boolean}
 */
export function isLowStockItem(item, globalThreshold) {
  if (!item) return false;
  const own = Number(item.minQuantity);
  const g = Number(globalThreshold);
  const threshold = own > 0
    ? own
    : (g > 0 ? g : DEFAULT_SETTINGS.inventory.minThreshold);
  return (Number(item.quantity) || 0) < threshold;
}

export const inventory = {
  ...base,

  /**
   * الحد العام الحالي لنقص المخزون.
   * @returns {Promise<number>}
   */
  getGlobalThreshold: resolveGlobalThreshold,

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
    return isLowStockItem(item, globalThreshold);
  },

  /**
   * الأصناف التي كميتها أقل من الحد الأدنى (per-item + global).
   * @param {number} [threshold] — الحد العام (يفيد عند عدم وجود minQuantity)
   * @returns {Promise<Array>}
   */
  async getLowStock(threshold) {
    const globalThreshold = Number(threshold) > 0 ? Number(threshold) : await resolveGlobalThreshold();
    const all = await base.list();
    return all.filter((i) => isLowStockItem(i, globalThreshold));
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
    const globalThreshold = Number(threshold) > 0 ? Number(threshold) : await resolveGlobalThreshold();

    let totalValue = 0;
    let lowCount = 0;
    const byCategory = {};

    all.forEach((i) => {
      const qty = Number(i.quantity) || 0;
      const price = Number(i.price) || 0;
      totalValue += qty * price;

      if (isLowStockItem(i, globalThreshold)) lowCount++;

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
