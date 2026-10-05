/* ==========================================================================
   savings-goals.js — مستودع أهداف الادخار
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_createdAt
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.SAVINGS_GOALS);

export const savingsGoals = {
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
    return all.filter((g) => String(g.name || '').toLowerCase().includes(q));
  },

  /**
   * حساب نسبة التقدم لكل هدف.
   * @returns {Promise<Array>} كل هدف + progressPercent
   */
  async listWithProgress() {
    const all = await base.list();
    return all.map((g) => {
      const target = Number(g.targetAmount) || 0;
      const current = Number(g.currentAmount) || 0;
      const progressPercent = target > 0
        ? Math.min(100, Math.round((current / target) * 100))
        : 0;
      const remaining = Math.max(0, target - current);
      return { ...g, progressPercent, remaining };
    });
  },

  /**
   * إيداع مبلغ في الهدف (زيادة currentAmount).
   * @param {string} id
   * @param {number} amount
   * @returns {Promise<Object|null>}
   */
  async deposit(id, amount) {
    const goal = await base.find(id);
    if (!goal) return null;
    const val = Number(amount) || 0;
    if (val <= 0) return goal;
    const current = Number(goal.currentAmount) || 0;
    const target = Number(goal.targetAmount) || 0;
    const newCurrent = target > 0
      ? Math.min(current + val, target)
      : current + val;
    return base.update(id, { currentAmount: newCurrent });
  },

  /**
   * سحب مبلغ من الهدف (تقليل currentAmount).
   * @param {string} id
   * @param {number} amount
   * @returns {Promise<Object|null>}
   */
  async withdraw(id, amount) {
    const goal = await base.find(id);
    if (!goal) return null;
    const val = Number(amount) || 0;
    if (val <= 0) return goal;
    const current = Number(goal.currentAmount) || 0;
    const newCurrent = Math.max(0, current - val);
    return base.update(id, { currentAmount: newCurrent });
  },
};
