/* ==========================================================================
   auto-backup.js — النسخ الاحتياطي التلقائي (IndexedDB Snapshots)
   ==========================================================================
   - ينشئ نسخة كاملة من مخازن التطبيق ويخزّنها في مخزن `backups`.
   - يقرأ إعدادات autoBackup + intervalHours من settings.
   - يحذف النسخ القديمة (LIMITS.maxBackups = 7).
   - يوفّر: runAutoBackupIfDue, createBackup, listBackups,
             restoreBackup, deleteBackup, clearAllBackups.
   - Backup record: { id, createdAt, label, sizeKB, stores: {customers:[...], ...} }
   ========================================================================== */

import { STORES, LIMITS, STORAGE_KEYS } from '../core/config.js';
import { settings } from '../data/repos/settings.js';
import { uid } from '../core/utils.js';
import * as idb from '../data/idb.js';

/* --- المخازن المُشتركة في النسخة (كل المخازن ما عدا backups) --- */
const BACKUP_STORES = [
  STORES.CUSTOMERS,
  STORES.ORDERS,
  STORES.PAYMENTS,
  STORES.INVENTORY,
  STORES.WORKERS,
  STORES.EXPENSES,
  STORES.APPOINTMENTS,
  STORES.SETTINGS,
  STORES.PORTFOLIO,
  STORES.COMMITMENTS,
  STORES.COMMITMENT_PAYMENTS,
  STORES.SAVINGS_GOALS,
  STORES.HOUSE_EXPENSES,
  STORES.PERSONAL_LOANS,
  STORES.LOAN_PAYMENTS,
  STORES.REFERRALS,
  STORES.WORKER_PAYMENTS,
];

/* ==========================================================================
   1. أدوات
   ========================================================================== */

/**
 * قراءة وقت آخر نسخة تلقائية.
 * @returns {number|null}
 */
function getLastAutoBackupAt() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.V3_LAST_AUTO_BACKUP);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * حفظ وقت آخر نسخة.
 * @param {number} ts
 */
function setLastAutoBackupAt(ts) {
  try {
    localStorage.setItem(STORAGE_KEYS.V3_LAST_AUTO_BACKUP, String(ts));
  } catch (e) { /* ignore */ }
}

/**
 * حساب حجم كائن (KB تقريبياً).
 * @param {Object} obj
 * @returns {number}
 */
function estimateSizeKB(obj) {
  try {
    const json = JSON.stringify(obj);
    return Math.round((json.length * 2) / 1024);
  } catch {
    return 0;
  }
}

/* ==========================================================================
   2. إنشاء نسخة
   ========================================================================== */

/**
 * إنشاء نسخة احتياطية كاملة.
 * @param {Object} [options]
 * @param {string} [options.label='نسخة يدوية']
 * @returns {Promise<{ok:boolean, id?:string, sizeKB?:number, error?:string}>}
 */
export async function createBackup(options = {}) {
  const label = options.label || 'نسخة يدوية';

  try {
    const stores = {};
    const counts = {};

    for (const s of BACKUP_STORES) {
      try {
        const list = await idb.getAll(s);
        stores[s] = Array.isArray(list) ? list : [];
        counts[s] = stores[s].length;
      } catch {
        stores[s] = [];
        counts[s] = 0;
      }
    }

    const sizeKB = estimateSizeKB(stores);

    const record = {
      id: uid(),
      createdAt: Date.now(),
      label,
      sizeKB,
      counts,
      stores,
    };

    await idb.put(STORES.BACKUPS, record);

    /* تقليم النسخ القديمة */
    await pruneOldBackups();

    return { ok: true, id: record.id, sizeKB };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * حذف النسخ القديمة بحيث لا يتجاوز الحد.
 * @returns {Promise<number>} — عدد المحذوفات
 */
async function pruneOldBackups() {
  const all = await idb.getAll(STORES.BACKUPS);
  const max = LIMITS.maxBackups || 7;
  if (all.length <= max) return 0;

  const sorted = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const excess = sorted.slice(max);

  for (const b of excess) {
    await idb.remove(STORES.BACKUPS, b.id);
  }
  return excess.length;
}

/* ==========================================================================
   3. النسخ التلقائي
   ========================================================================== */

/**
 * هل في التطبيق أي بيانات حقيقية؟ (نتجاهل الإعدادات لأنها تُنشأ تلقائياً)
 * @returns {Promise<boolean>}
 */
async function hasAnyData() {
  for (const s of BACKUP_STORES) {
    if (s === STORES.SETTINGS) continue;
    try {
      if ((await idb.count(s)) > 0) return true;
    } catch (e) { /* مخزن غير متاح — نتجاوزه */ }
  }
  return false;
}

/**
 * التحقق من جدوى النسخ التلقائي وتشغيله إن حان الوقت.
 * @returns {Promise<{ran:boolean, id?:string, sizeKB?:number, reason?:string}>}
 */
export async function runAutoBackupIfDue() {
  try {
    const s = await settings.get();
    const bk = s.backup || {};

    /* معطَّل من الإعدادات؟ */
    if (bk.autoBackup === false) {
      return { ran: false, reason: 'disabled' };
    }

    const intervalHours = Number(bk.intervalHours) || 24;
    const last = getLastAutoBackupAt();
    const now = Date.now();
    const diffHours = last ? (now - last) / 3600000 : Infinity;

    if (diffHours < intervalHours) {
      return { ran: false, reason: 'not-due' };
    }

    /* لا نسخ تلقائي لقاعدة فارغة: وإلا تحلّ نسخٌ فارغة محل النسخ السليمة بعد التقليم
       (يحتفظ التقليم بآخر 7 نسخ فقط) لو فُقدت البيانات لأي سبب. */
    if (!(await hasAnyData())) {
      return { ran: false, reason: 'empty' };
    }

    const res = await createBackup({ label: 'نسخة تلقائية' });
    if (res.ok) {
      setLastAutoBackupAt(now);
      return { ran: true, id: res.id, sizeKB: res.sizeKB };
    }
    return { ran: false, reason: res.error || 'failed' };
  } catch (err) {
    return { ran: false, reason: err.message || 'error' };
  }
}

/* ==========================================================================
   4. عرض النسخ
   ========================================================================== */

/**
 * جلب كل النسخ (بدون بيانات المخازن الثقيلة).
 * @returns {Promise<Array<{id, createdAt, label, sizeKB, counts}>>}
 */
export async function listBackups() {
  try {
    const all = await idb.getAll(STORES.BACKUPS);
    return all
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((b) => ({
        id: b.id,
        createdAt: b.createdAt,
        label: b.label || 'نسخة',
        sizeKB: b.sizeKB || 0,
        counts: b.counts || {},
      }));
  } catch {
    return [];
  }
}

/**
 * عدد النسخ الحالية.
 * @returns {Promise<number>}
 */
export async function countBackups() {
  try {
    return await idb.count(STORES.BACKUPS);
  } catch {
    return 0;
  }
}

/**
 * جلب نسخة كاملة (مع البيانات).
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getBackup(id) {
  try {
    return await idb.get(STORES.BACKUPS, id) || null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   5. استرجاع نسخة
   ========================================================================== */

/**
 * استرجاع نسخة احتياطية (يستبدل كل البيانات الحالية).
 *
 * ⚠️ خطير — لا رجعة فيه.
 * @param {string} id
 * @returns {Promise<{ok:boolean, restored?:Object, error?:string}>}
 */
export async function restoreBackup(id) {
  try {
    const backup = await getBackup(id);
    if (!backup || !backup.stores) {
      return { ok: false, error: 'النسخة غير موجودة أو تالفة' };
    }

    /* نسخة أمان قبل الاستبدال: إن لم تنجح لا نمس البيانات الحالية */
    const safety = await createBackup({ label: 'قبل الاستعادة' });
    if (!safety.ok) {
      return { ok: false, error: 'تعذّر إنشاء نسخة أمان قبل الاستعادة: ' + (safety.error || '') };
    }

    /* استبدال ذرّي: إن فشل أي سجل تُلغى العملية كلها وتبقى البيانات كما هي */
    const plan = {};
    for (const s of BACKUP_STORES) {
      /* مخزن غائب من النسخة (نسخة أقدم أُضيفت بعدها مخازن جديدة) لا يُمسح من البيانات الحالية */
      if (!Array.isArray(backup.stores[s])) continue;
      plan[s] = { clear: true, records: backup.stores[s].filter((r) => r && typeof r === 'object' && r.id != null) };
    }
    if (Object.keys(plan).length === 0) {
      return { ok: false, error: 'النسخة لا تحتوي أي بيانات صالحة' };
    }
    const restored = await idb.writeBatch(plan);

    return { ok: true, restored };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/* ==========================================================================
   6. حذف
   ========================================================================== */

/**
 * حذف نسخة واحدة.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteBackup(id) {
  try {
    await idb.remove(STORES.BACKUPS, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * حذف كل النسخ.
 * @returns {Promise<number>} — عدد المحذوفات
 */
export async function clearAllBackups() {
  try {
    const all = await listBackups();
    for (const b of all) {
      await idb.remove(STORES.BACKUPS, b.id);
    }
    return all.length;
  } catch {
    return 0;
  }
}

/* ==========================================================================
   7. تصدير ملف JSON
   ========================================================================== */

/**
 * تصدير نسخة احتياطية كملف JSON.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function exportBackupToFile(id) {
  try {
    const backup = await getBackup(id);
    if (!backup) return false;

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jalabiya-backup-' + new Date(backup.createdAt || Date.now())
      .toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    return true;
  } catch {
    return false;
  }
}

/* ==========================================================================
   8. تصدير داخلي للاختبار
   ========================================================================== */

export const _internal = { BACKUP_STORES, getLastAutoBackupAt, setLastAutoBackupAt };
