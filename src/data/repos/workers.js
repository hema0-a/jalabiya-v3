/* ==========================================================================
   workers.js — مستودع العمال
   ==========================================================================
   يضيف: بحث بالاسم، العمال النشطون (فلترة JS)، تبديل حالة التفعيل.
   ⚠️ active يُفلتر في JS — boolean غير صالح كمفتاح فهرس IDB.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

const base = createRepository(STORES.WORKERS);

export const workers = {
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
    return all.filter((w) =>
      String(w.name ?? '').toLowerCase().includes(q)
    );
  },

  /**
   * العمال النشطون فقط.
   * @returns {Promise<Array>}
   */
  async listActive() {
    const all = await base.list();
    return all.filter((w) => w.active !== false);
  },

  /**
   * تبديل حالة التفعيل.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async toggleActive(id) {
    const worker = await base.find(id);
    if (!worker) return null;
    return base.update(id, { active: worker.active === false ? true : false });
  },
};
