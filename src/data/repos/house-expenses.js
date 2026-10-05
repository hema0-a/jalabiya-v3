/* ==========================================================================
   house-expenses.js — مستودع مصاريف البيت
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_category, by_date, by_createdAt
   ========================================================================== */

import { createRepository } from '../repository.js';
import {
  STORES,
  HOUSE_EXPENSE_CATEGORIES,
  HOUSE_EXPENSE_CATEGORY_COLORS,
} from '../../core/config.js';

const base = createRepository(STORES.HOUSE_EXPENSES);

const CAT_MAP = {};
HOUSE_EXPENSE_CATEGORIES.forEach((c) => { CAT_MAP[c.id] = c; });

/* ==========================================================================
   1. getPeriodRange — نطاق الفترة
   ========================================================================== */

/**
 * حساب نطاق الفترة.
 * @param {'month'|'year'|'all'} period
 * @returns {{fromMs:number, toMs:number}}
 */
export function getPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'month') {
    return {
      fromMs: new Date(y, m, 1).getTime(),
      toMs: new Date(y, m + 1, 1).getTime(),
    };
  }
  if (period === 'year') {
    return {
      fromMs: new Date(y, 0, 1).getTime(),
      toMs: new Date(y + 1, 0, 1).getTime(),
    };
  }
  return { fromMs: 0, toMs: Date.now() + 86400000 };
}

/* ==========================================================================
   2. المستودع
   ========================================================================== */

export const houseExpenses = {
  ...base,

  /**
   * تصفية بالفئة.
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async listByCategory(category) {
    const all = await base.list();
    return all.filter((e) => (e.category || 'other') === category);
  },

  /**
   * بحث في الملاحظات + اسم الفئة.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByQuery(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((e) => {
      const note = String(e.note || '').toLowerCase();
      const cat = CAT_MAP[e.category] || CAT_MAP.other;
      const label = (cat ? cat.label : '').toLowerCase();
      return note.includes(q) || label.includes(q);
    });
  },

  /**
   * مصاريف فترة زمنية (مرتّبة بالأحدث).
   * @param {number} fromMs
   * @param {number} toMs
   * @returns {Promise<Array>}
   */
  async listByPeriod(fromMs, toMs) {
    const all = await base.list();
    return all
      .filter((e) => e.date && e.date >= fromMs && e.date < toMs)
      .sort((a, b) => (b.date || 0) - (a.date || 0));
  },

  /**
   * إحصائيات الفترة.
   * @param {'month'|'year'|'all'} period
   * @returns {Promise<{total:number, count:number, avg:number, filtered:Array, period:string}>}
   */
  async getStats(period) {
    const { fromMs, toMs } = getPeriodRange(period);
    const filtered = await this.listByPeriod(fromMs, toMs);
    const total = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const count = filtered.length;
    const avg = count > 0 ? total / count : 0;
    return { total, count, avg, filtered, period };
  },

  /**
   * توزيع الفئات في الفترة.
   * @param {'month'|'year'|'all'} period
   * @returns {Promise<Array>}
   */
  async getCategoryStats(period) {
    const stats = await this.getStats(period);
    const byCat = {};
    stats.filtered.forEach((e) => {
      const c = e.category || 'other';
      byCat[c] = (byCat[c] || 0) + (Number(e.amount) || 0);
    });

    return Object.entries(byCat)
      .map(([id, amount]) => {
        const cat = CAT_MAP[id] || CAT_MAP.other;
        return {
          id,
          label: cat ? cat.label : 'أخرى',
          icon: cat ? cat.icon : '📌',
          color: HOUSE_EXPENSE_CATEGORY_COLORS[id] || '#95A5A6',
          amount,
          percent: stats.total > 0 ? Math.round((amount / stats.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  },
};
