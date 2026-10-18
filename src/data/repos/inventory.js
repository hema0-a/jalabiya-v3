/* ==========================================================================
   inventory.js — مستودع المخزون
   ==========================================================================
   يضيف: بحث بالاسم، تصفية بالفئة، تنبيه نقص المخزون (per-item + global)،
         تعديل الكمية، إحصائيات القيمة.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES, DEFAULT_SETTINGS } from '../../core/config.js';
import { settings } from './settings.js';
import { recordStockMove } from '../../services/ledger-shadow.js';

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

/** الكمية الرقمية لصنف (غير الرقمية = 0). */
const qtyOf = (item) => Number(item && item.quantity) || 0;

export const inventory = {
  ...base,

  /**
   * إنشاء صنف. الكمية الابتدائية تُسجَّل ظلّياً في الدفتر (v3.3.80) — لا يتأثر الإنشاء بفشلها.
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const rec = await base.create(data);
    if (qtyOf(rec) > 0) await recordStockMove(rec.id, qtyOf(rec), { type: 'stock_in', note: 'إضافة صنف' });
    return rec;
  },

  /**
   * تحديث صنف. إن تغيّرت الكمية يُسجَّل الفرق ظلّياً (الكمية القديمة تُقرأ داخل القفل).
   * @param {string} id
   * @param {Object} patch
   * @returns {Promise<Object|null>}
   */
  async update(id, patch) {
    if (!patch || patch.quantity === undefined) return base.update(id, patch);
    let before = 0;
    const res = await base.modify(id, (old) => { before = qtyOf(old); return patch; });
    if (res) await recordStockMove(id, qtyOf(res) - before, { type: 'adjust', note: 'تعديل الكمية من نموذج الصنف' });
    return res;
  },

  /**
   * حذف صنف. الكمية المتبقية تُسجَّل ظلّياً كسحب (يعود الحساب إلى صفر مثل العدّاد القديم).
   * @param {string} id
   * @returns {Promise<void>}
   */
  async remove(id) {
    const item = await base.find(id);
    await base.remove(id);
    if (item && qtyOf(item) > 0) await recordStockMove(id, -qtyOf(item), { type: 'adjust', note: 'حذف الصنف' });
  },

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
    /* ذرّي: القراءة والكتابة داخل القفل (ضغطات +1 المتتالية كانت تُضيّع تحديثات) */
    let before = 0;
    const res = await base.modify(id, (item) => {
      before = qtyOf(item);
      return { quantity: Math.max(0, qtyOf(item) + Number(delta || 0)) };
    });
    /* الأثر الظلّي = الفرق الفعلي (بعد القصّ عند الصفر)، لا الفرق المطلوب */
    if (res) {
      const actual = qtyOf(res) - before;
      await recordStockMove(id, actual, { type: actual > 0 ? 'stock_in' : 'stock_out', note: 'تعديل سريع للكمية' });
    }
    return res;
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
