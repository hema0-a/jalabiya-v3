/* ==========================================================================
   portfolio.js — مستودع معرض الأعمال
   ==========================================================================
   التصفية اليدوية (لا تعتمد على findByIndex) — لتجنب أي تعارض.
   الفهارس المتوفرة في schema.js (لاستخدامها في المستقبل):
     by_createdAt, by_category, by_customerId
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.PORTFOLIO);

export const portfolio = {
  ...base,

  /**
   * بحث بالعنوان أو الملاحظات (substring، غير حساس).
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByTitle(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((p) =>
      String(p.title || '').toLowerCase().includes(q) ||
      String(p.note || '').toLowerCase().includes(q)
    );
  },

  /**
   * تصفية بالفئة.
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async listByCategory(category) {
    const all = await base.list();
    return all.filter((p) => (p.category || 'other') === category);
  },

  /**
   * أعمال عميل معيّن.
   * @param {string} customerId
   * @returns {Promise<Array>}
   */
  async findByCustomer(customerId) {
    const all = await base.list();
    return all.filter((p) => p.customerId === customerId);
  },

  /**
   * إحصائيات العدد لكل فئة.
   * @returns {Promise<{total:number}>}
   */
  async getCategoryStats() {
    const all = await base.list();
    const stats = { total: all.length };
    all.forEach((p) => {
      const c = p.category || 'other';
      stats[c] = (stats[c] || 0) + 1;
    });
    return stats;
  },

  /**
   * البحث عن عمل بنفس الـ hash (لمنع التكرار).
   * @param {string} hash
   * @returns {Promise<Object|null>}
   */
  async findByHash(hash) {
    if (!hash) return null;
    const all = await base.list();
    return all.find((p) => p.hash === hash) || null;
  },
};
