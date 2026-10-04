/* ==========================================================================
   trash.js — مستودع سلة المحذوفات
   ==========================================================================
   يخزّن السجلات المحذوفة مع metadata (المخزن الأصلي + البيانات).
   يوفّر: نقل، استرجاع، تنظيف تلقائي بحسب LIMITS.maxTrashItems.
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES, LIMITS } from '../../core/config.js';
import * as idb from '../idb.js';

const base = createRepository(STORES.TRASH);

export const trash = {
  ...base,

  /**
   * نقل سجل إلى سلة المحذوفات (نسخة كاملة + metadata).
   * @param {string} originalStore — اسم المخزن الأصلي
   * @param {Object} record — السجل الكامل (يحتوي id)
   * @returns {Promise<Object>} سجل السلة الجديد
   */
  async addToTrash(originalStore, record) {
    return base.create({
      originalStore,
      originalId: record.id,
      data: record,
      deletedAt: Date.now(),
    });
  },

  /**
   * سجلات السلة المنقولة من مخزن معيّن.
   * @param {string} originalStore
   * @returns {Promise<Array>}
   */
  async listByStore(originalStore) {
    return base.findByIndex('by_originalStore', originalStore);
  },

  /**
   * أحدث عناصر السلة (مرتّبة تنازلياً حسب deletedAt).
   * @param {number} [limit=20]
   * @returns {Promise<Array>}
   */
  async listRecent(limit = 20) {
    const all = await base.list();
    return all
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .slice(0, limit);
  },

  /**
   * استرجاع سجل من السلة إلى مخزنه الأصلي.
   * @param {string} trashId
   * @returns {Promise<Object|null>} السجل المُسترجع أو null
   */
  async restore(trashId) {
    const item = await base.find(trashId);
    if (!item || !item.originalStore || !item.data) return null;
    await idb.put(item.originalStore, item.data);
    await base.remove(trashId);
    return item.data;
  },

  /**
   * تقليم السلة بحيث لا تتجاوز LIMITS.maxTrashItems.
   * يحذف الأقدم أولاً.
   * @returns {Promise<number>} عدد العناصر المحذوفة
   */
  async prune() {
    const all = await base.list();
    if (all.length <= LIMITS.maxTrashItems) return 0;
    const sorted = all.sort((a, b) => a.deletedAt - b.deletedAt);
    const excess = sorted.slice(0, all.length - LIMITS.maxTrashItems);
    for (const item of excess) {
      await base.remove(item.id);
    }
    return excess.length;
  },
};
