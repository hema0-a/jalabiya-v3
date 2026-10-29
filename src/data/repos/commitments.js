/* ==========================================================================
   commitments.js — مستودع الالتزامات
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_category, by_frequency, by_createdAt
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.COMMITMENTS);

export const commitments = {
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
    return all.filter((c) => String(c.name || '').toLowerCase().includes(q));
  },

  /**
   * تصفية بالفئة.
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async listByCategory(category) {
    const all = await base.list();
    return all.filter((c) => (c.category || 'other') === category);
  },

  /**
   * تصفية بالدورية.
   * @param {string} frequency
   * @returns {Promise<Array>}
   */
  async listByFrequency(frequency) {
    const all = await base.list();
    return all.filter((c) => (c.frequency || 'monthly') === frequency);
  },

  /**
   * الالتزامات النشطة فقط (active !== false).
   * @returns {Promise<Array>}
   */
  async listActive() {
    const all = await base.list();
    return all.filter((c) => c.active !== false);
  },

  /**
   * إحصائيات العدد لكل فئة.
   * @returns {Promise<{total:number}>}
   */
  async getCategoryStats() {
    const all = await base.list();
    const stats = { total: all.length };
    all.forEach((c) => {
      const cat = c.category || 'other';
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return stats;
  },
};
