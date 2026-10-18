/* ==========================================================================
   ledger.js (repo) — مخزن الدفتر المالي (v3.3.79 — الوضع الظلّي)
   ==========================================================================
   أسطر ثابتة: تُضاف ولا تُعدَّل ولا تُحذف فرادى (التراجع = سطر عكس).
   الإضافة idempotent بالمعرّف: سطر موجود بالهوية المالية نفسها لا يتكرر، وبهوية مختلفة يُبلَّغ
   عنه كتعارض ولا يُستبدل الموجود (لا يُكتب فوق مال مسجَّل).
   الاستثناء الوحيد للحذف: clearAll() لإعادة ضبط الدفتر الظلّي بقرار صريح من المستخدم.
   ========================================================================== */

import * as idb from '../idb.js';
import { STORES } from '../../core/config.js';
import { validateEntry, entryIdentity, compareEntries } from '../../services/ledger.js';

/** تسلسل الإضافات: فحص «موجود؟» ثم الكتابة لا يتداخلان بين إضافتين متزامنتين. */
let chain = Promise.resolve();
const serial = (task) => {
  const run = chain.catch(() => {}).then(task);
  chain = run.catch(() => {});
  return run;
};

export const ledgerRepo = {
  /**
   * كل الأسطر بالترتيب القانوني.
   * @returns {Promise<Array>}
   */
  async list() {
    const all = await idb.getAll(STORES.LEDGER);
    return (Array.isArray(all) ? all : []).filter((e) => e && typeof e === 'object').sort(compareEntries);
  },

  /**
   * أسطر حساب واحد.
   * @param {string} acct
   * @returns {Promise<Array>}
   */
  async listByAcct(acct) {
    const rows = await idb.getByIndex(STORES.LEDGER, 'by_acct', acct);
    return (Array.isArray(rows) ? rows : []).sort(compareEntries);
  },

  /** @returns {Promise<number>} */
  count() { return idb.count(STORES.LEDGER); },

  /**
   * يضيف سطراً إن لم يكن موجوداً.
   * @param {Object} entry
   * @returns {Promise<{added:boolean, conflict:boolean, existing?:Object}>}
   * @throws {Error} سطر غير صالح الشكل
   */
  append(entry) {
    const errs = validateEntry(entry);
    if (errs.length) return Promise.reject(new Error('سطر دفتر غير صالح: ' + errs.join('، ')));
    return serial(async () => {
      const existing = await idb.get(STORES.LEDGER, entry.id);
      if (existing) {
        const same = entryIdentity(existing) === entryIdentity(entry);
        return { added: false, conflict: !same, existing };
      }
      await idb.put(STORES.LEDGER, entry);
      return { added: true, conflict: false };
    });
  },

  /**
   * مسح الدفتر كله — لإعادة ضبط الوضع الظلّي فقط (بقرار صريح). لا تُستدعى تلقائياً أبداً.
   * @returns {Promise<void>}
   */
  clearAll() { return serial(() => idb.clear(STORES.LEDGER)); },
};
