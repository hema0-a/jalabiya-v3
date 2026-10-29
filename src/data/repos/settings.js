/* ==========================================================================
   settings.js — مستودع الإعدادات
   ==========================================================================
   سجل واحد فقط (id='main'). يدمج المحفوظ مع الافتراضي عند القراءة.
   update() يعمل deep merge للمفاتيح من المستوى الأول.
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

/* طابور تنفيذ: يمنع تداخل update() (قراءة ثم حفظ) فلا يمحو تعديلٌ تعديلاً آخر */
let _updateQueue = Promise.resolve();

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
   * تحديث جزئي — يدمج بعمق لكل مفتاح من المستوى الأول.
   * مثال: update({ workshop: { name: 'X' } }) يحفظ name ويبقي phone/address.
   * @param {Object} patch
   * @returns {Promise<Object>}
   */
  update(patch) {
    const run = _updateQueue.catch(() => {}).then(() => settings._applyUpdate(patch));
    _updateQueue = run.catch(() => {});
    return run;
  },

  async _applyUpdate(patch) {
    const current = await settings.get();
    const merged = { ...current };

    Object.keys(patch).forEach((key) => {
      const cur = current[key];
      const pat = patch[key];
      const bothPlainObjects =
        cur && pat &&
        typeof cur === 'object' && typeof pat === 'object' &&
        !Array.isArray(cur) && !Array.isArray(pat);

      if (bothPlainObjects) {
        merged[key] = { ...cur, ...pat };
      } else {
        merged[key] = pat;
      }
    });

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
