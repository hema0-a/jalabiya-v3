/* ==========================================================================
   activity.js — مستودع سجل النشاط
   ==========================================================================
   الفهارس المتوفرة في schema.js:
     by_type, by_timestamp, by_entityId
   البنية:
     { id, type, entityId, description, metadata, timestamp }
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES, LIMITS } from '../../core/config.js';

const base = createRepository(STORES.ACTIVITY);

export const activity = {
  ...base,

  /**
   * تسجيل نشاط جديد (مع تقليم تلقائي عند تجاوز الحد).
   * @param {Object} data — { type, entityId?, description, metadata? }
   * @returns {Promise<Object>}
   */
  async log(data) {
    const record = await base.create({
      type: String(data.type || 'unknown'),
      entityId: data.entityId || null,
      description: String(data.description || ''),
      metadata: data.metadata || null,
      timestamp: Date.now(),
    });

    /* تقليم دوري (10% احتمال) لتجنب التكرار */
    if (Math.random() < 0.1) {
      try { await this.prune(); } catch (e) { /* ignore */ }
    }

    return record;
  },

  /**
   * تصفية بالنوع.
   * @param {string} type
   * @returns {Promise<Array>}
   */
  async listByType(type) {
    const all = await base.list();
    return all.filter((a) => a.type === type);
  },

  /**
   * أنشطة كيان معيّن (طلب، عميل...).
   * @param {string} entityId
   * @returns {Promise<Array>}
   */
  async listByEntity(entityId) {
    const all = await base.list();
    return all.filter((a) => a.entityId === entityId);
  },

  /**
   * أحدث الأنشطة (مرتّبة تنازلياً).
   * @param {number} [limit=50]
   * @returns {Promise<Array>}
   */
  async listRecent(limit = 50) {
    const all = await base.list();
    return all
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  },

  /**
   * بحث في الوصف.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchByDescription(query) {
    const q = String(query ?? '').trim().toLowerCase();
    const all = await base.list();
    if (!q) return all;
    return all.filter((a) =>
      String(a.description || '').toLowerCase().includes(q)
    );
  },

  /**
   * إحصائيات عامة.
   * @returns {Promise<{total:number, today:number, byType:Object}>}
   */
  async getStats() {
    const all = await base.list();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const byType = {};
    let today = 0;

    all.forEach((a) => {
      const t = a.type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
      if ((a.timestamp || 0) >= todayMs) today++;
    });

    return { total: all.length, today, byType };
  },

  /**
   * تقليم السجل بحيث لا يتجاوز LIMITS.maxActivityLog.
   * يحذف الأقدم أولاً.
   * @returns {Promise<number>} عدد العناصر المحذوفة
   */
  async prune() {
    const all = await base.list();
    const max = LIMITS.maxActivityLog || 500;
    if (all.length <= max) return 0;

    const sorted = all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const excess = sorted.slice(0, all.length - max);
    for (const item of excess) {
      await base.remove(item.id);
    }
    return excess.length;
  },
};
