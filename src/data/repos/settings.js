/* ==========================================================================
   settings.js — مستودع الإعدادات
   ==========================================================================
   سجل واحد فقط (id='main'). يدمج المحفوظ مع الافتراضي عند القراءة.
   لا يستخدم Repository العام — لأنه مخزن سجل واحد.
   ========================================================================== */

import { STORES, DEFAULT_SETTINGS } from '../../core/config.js';
import { SETTINGS_ID } from '../schema.js';
import * as idb from '../idb.js';

/**
 * دمج المحفوظ مع الافتراضي (مستوى واحد عمق).
 * ينشئ كائنات جديدة — لا يعدّل DEFAULT_SETTINGS.
 * @param {Object|null} stored
 * @returns {Object}
 */
function mergeWithDefaults(stored) {
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    const def = DEFAULT_SETTINGS[key];
    const cur = stored ? stored[key] : undefined;
    if (Array.isArray(def)) {
      out[key] = Array.isArray(cur) ? [...cur] : [...def];
    } else if (def && typeof def === 'object') {
      out[key] = { ...def, ...(cur || {}) };
    } else {
      out[key] = cur !== undefined ? cur : def;
    }
  });
  return out;
}

export const settings = {
  /**
   * جلب الإعدادات الحالية (مع الافتراضيات للحقول الناقصة).
   * @returns {Promise<Object>}
   */
  async get() {
    const stored = await idb.get(STORES.SETTINGS, SETTINGS_ID);
    return mergeWithDefaults(stored);
  },

  /**
   * استبدال الإعدادات بالكامل.
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async save(data) {
    const existing = await idb.get(STORES.SETTINGS, SETTINGS_ID);
    const record = {
      ...data,
      id: SETTINGS_ID,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await idb.put(STORES.SETTINGS, record);
    return record;
  },

  /**
   * تحديث جزئي (دمج سطحي) + حفظ.
   * @param {Object} patch
   * @returns {Promise<Object>}
   */
  async update(patch) {
    const current = await settings.get();
    const merged = { ...current, ...patch };
    return settings.save(merged);
  },

  /**
   * حذف الإعدادات (سيعود get() للافتراضي).
   * @returns {Promise<void>}
   */
  async clear() {
    await idb.remove(STORES.SETTINGS, SETTINGS_ID);
  },
};
