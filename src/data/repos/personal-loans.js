/* ==========================================================================
   personal-loans.js — مستودع القروض الشخصية
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_type, by_personName, by_createdAt
   أنواع القروض:
     'given'    → ليّ (أنا الدائن)
     'received' → عليّ (أنا المدين)
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.PERSONAL_LOANS);

export const personalLoans = {
  ...base,

  /**
   * بحث بالاسم (substring، غير حساس لحالة الأحرف).
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByName(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((l) =>
      String(l.personName || '').toLowerCase().includes(q)
    );
  },

  /**
   * تصفية بالنوع.
   * @param {'given'|'received'} type
   * @returns {Promise<Array>}
   */
  async listByType(type) {
    const all = await base.list();
    return all.filter((l) => l.type === type);
  },

  /**
   * إحصائيات إجمالية (عدد + مبلغ لكل نوع).
   * @returns {Promise<{total:number, given:{count:number,amount:number}, received:{count:number,amount:number}}>}
   */
  async getStats() {
    const all = await base.list();
    const stats = {
      total: all.length,
      given: { count: 0, amount: 0 },
      received: { count: 0, amount: 0 },
    };
    all.forEach((l) => {
      const amt = Number(l.amount) || 0;
      if (l.type === 'given') {
        stats.given.count++;
        stats.given.amount += amt;
      } else if (l.type === 'received') {
        stats.received.count++;
        stats.received.amount += amt;
      }
    });
    return stats;
  },
};
