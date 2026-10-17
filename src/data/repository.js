/* ==========================================================================
   repository.js — مصنع مستودعات عام (Generic Repository Factory)
   ==========================================================================
   يُنشئ كائناً بـ CRUD موحّد لأي مخزن في IndexedDB.
   يضيف: توليد id، طوابع زمنية، طبقة مجرّدة فوق idb.js.
   ========================================================================== */

import { uid } from '../core/utils.js';
import * as idb from './idb.js';

/**
 * إنشاء مستودع لأحد المخازن.
 * @param {string} storeName — اسم المخزن من STORES
 * @param {Object} [options]
 * @param {Function} [options.generateId] — دالة توليد المعرّف (افتراضي: uid)
 * @param {string|null} [options.fixedId] — معرّف ثابت لكل السجلات (للإعدادات)
 * @param {boolean} [options.timestamps=true] — إضافة createdAt/updatedAt
 * @returns {Object} كائن بـ CRUD كامل
 */
/* قفل بسيط لكل سجل: يمنع ضياع التعديل عند تداخل تحديثين متتاليين على نفس السجل
   (قراءة ثم كتابة في معاملتين منفصلتين). */
const _updateChains = new Map();

function runExclusive(key, task) {
  const prev = _updateChains.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(task);
  const tail = run.catch(() => {});
  _updateChains.set(key, tail);
  tail.then(() => { if (_updateChains.get(key) === tail) _updateChains.delete(key); });
  return run;
}

export function createRepository(storeName, options = {}) {
  const {
    generateId = () => uid(),
    fixedId = null,
    timestamps = true,
  } = options;

  const now = () => Date.now();

  return {
    /**
     * إنشاء سجل جديد.
     * @param {Object} data
     * @returns {Promise<Object>} السجل الكامل (مع id وتواريخ)
     */
    async create(data) {
      const id = fixedId ?? data.id ?? generateId();
      const record = { ...data, id };
      if (timestamps) {
        record.createdAt = data.createdAt ?? now();
        record.updatedAt = now();
      }
      await idb.put(storeName, record);
      return record;
    },

    /**
     * جلب كل السجلات.
     * @returns {Promise<Array>}
     */
    async list() {
      return idb.getAll(storeName);
    },

    /**
     * جلب سجل بالمعرّف.
     * @param {string} id
     * @returns {Promise<Object|undefined>}
     */
    async find(id) {
      return idb.get(storeName, id);
    },

    /**
     * تحديث جزئي لسجل.
     * @param {string} id
     * @param {Object} patch — الحقول المراد تحديثها
     * @returns {Promise<Object|null>} السجل المُحدَّث أو null إن لم يوجد
     */
    async update(id, patch) {
      return runExclusive(storeName + ':' + id, async () => {
        const existing = await idb.get(storeName, id);
        if (!existing) return null;
        const updated = { ...existing, ...patch, id };
        if (timestamps) updated.updatedAt = now();
        await idb.put(storeName, updated);
        return updated;
      });
    },

    /**
     * قراءة ثم تعديل ثم كتابة **داخل القفل** (ذرّي لكل سجل).
     * استعملها لكل تعديل يعتمد على القيمة الحالية (كمية، رصيد، عدّاد)، لأن
     * `find` ثم `update` منفصلين يُضيّعان تحديثاً عند ضغطتين متقاربتين.
     * ⚠️ لا تستدعِ update/modify لنفس السجل داخل fn (سيتجمّد القفل).
     * @param {string} id
     * @param {(existing:Object) => (Object|null|Promise<Object|null>)} fn — تُرجع patch أو null لعدم التعديل
     * @returns {Promise<Object|null>} السجل بعد التعديل (أو null إن لم يوجد)
     */
    async modify(id, fn) {
      return runExclusive(storeName + ':' + id, async () => {
        const existing = await idb.get(storeName, id);
        if (!existing) return null;
        const patch = await fn(existing);
        if (!patch) return existing;
        const updated = { ...existing, ...patch, id };
        if (timestamps) updated.updatedAt = now();
        await idb.put(storeName, updated);
        return updated;
      });
    },

    /**
     * حذف سجل بالمعرّف.
     * @param {string} id
     */
    async remove(id) {
      await idb.remove(storeName, id);
    },

    /**
     * حذف كل السجلات.
     */
    async clear() {
      await idb.clear(storeName);
    },

    /**
     * عدد السجلات.
     * @returns {Promise<number>}
     */
    async count() {
      return idb.count(storeName);
    },

    /**
     * بحث عبر فهرس.
     * @param {string} indexName
     * @param {*} value
     * @returns {Promise<Array>}
     */
    async findByIndex(indexName, value) {
      return idb.getByIndex(storeName, indexName, value);
    },
  };
}
