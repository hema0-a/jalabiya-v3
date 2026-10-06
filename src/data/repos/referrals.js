/* ==========================================================================
   referrals.js — مستودع الإحالات
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_referrer, by_status, by_createdAt
   الحالات:
     'pending' → مكافأة معلقة
     'paid'    → مكافأة مدفوعة
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.REFERRALS);

export const referrals = {
  ...base,

  /**
   * بحث بالاسم (المُرشِّح أو المُرشَّح) أو الهاتف.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByQuery(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((r) =>
      String(r.referrerName || '').toLowerCase().includes(q) ||
      String(r.referredName || '').toLowerCase().includes(q) ||
      String(r.referredPhone || '').includes(q)
    );
  },

  /**
   * تصفية بالحالة.
   * @param {'pending'|'paid'} status
   * @returns {Promise<Array>}
   */
  async listByStatus(status) {
    const all = await base.list();
    return all.filter((r) => (r.status || 'pending') === status);
  },

  /**
   * إحصائيات شاملة (عدد + مبلغ لكل حالة).
   * @returns {Promise<{total:number, pending:{count:number,amount:number}, paid:{count:number,amount:number}}>}
   */
  async getStats() {
    const all = await base.list();
    const stats = {
      total: all.length,
      pending: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
    };
    all.forEach((r) => {
      const amt = Number(r.reward) || 0;
      if ((r.status || 'pending') === 'paid') {
        stats.paid.count++;
        stats.paid.amount += amt;
      } else {
        stats.pending.count++;
        stats.pending.amount += amt;
      }
    });
    return stats;
  },

  /**
   * تبديل حالة الدفع (pending ⇄ paid).
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async togglePaid(id) {
    const item = await base.find(id);
    if (!item) return null;
    const newStatus = (item.status === 'paid') ? 'pending' : 'paid';
    return base.update(id, { status: newStatus });
  },
};
