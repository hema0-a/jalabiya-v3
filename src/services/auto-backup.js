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
import { uid, localDateInput } from '../core/utils.js';
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
  STORES.QUOTES,
  STORES.LEDGER,
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
      let list;
      try { list = await idb.getAll(s); }
      catch (e) {
        /* نسخة ناقصة بصمت أخطر من لا نسخة: الاستعادة منها كانت ستمسح هذا المخزن */
        return { ok: false, error: 'تعذّرت قراءة «' + s + '» — لم تُنشأ النسخة' };
      }
      stores[s] = Array.isArray(list) ? list : [];
      counts[s] = stores[s].length;
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
  const sorted = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  /* كل نسخة تحمل الصور كاملة: عند كبر الحجم الكلي نُبقي أقل عدداً (لا أقل من 3) حتى لا تمتلئ مساحة المتصفح */
  const MAX_TOTAL_KB = 40 * 1024;
  let keep = Math.min(sorted.length, max);
  let total = sorted.slice(0, keep).reduce((n, b) => n + (Number(b.sizeKB) || 0), 0);
  while (keep > 3 && total > MAX_TOTAL_KB) {
    keep--;
    total -= Number(sorted[keep].sizeKB) || 0;
  }
  if (sorted.length <= keep) return 0;
  const excess = sorted.slice(keep);

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
    a.download = 'jalabiya-backup-' + localDateInput(backup.createdAt || Date.now()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    markExternalBackup();
    return true;
  } catch {
    return false;
  }
}

/* ==========================================================================
   7ب. نسخة خارج الجهاز (مشاركة/تنزيل) + تذكير
   ==========================================================================
   النسخ الاحتياطية المحلية تضيع مع الجهاز نفسه (فقد/كسر/مسح بيانات المتصفح).
   المشاركة عبر قائمة الجوال ترسل الملف لواتساب/تيليجرام/درايف… دون تخزين أي مفاتيح في التطبيق. */

const DAY_MS_EXT = 86400000;

/** وقت آخر نسخة خرجت من الجهاز (تنزيل أو مشاركة)؛ 0 إن لم يحدث. */
export function getLastExternalBackupAt() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEYS.V3_LAST_EXTERNAL_BACKUP) || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
}

export function markExternalBackup(ts = Date.now()) {
  try { localStorage.setItem(STORAGE_KEYS.V3_LAST_EXTERNAL_BACKUP, String(ts)); } catch { /* اختياري */ }
}

/** عدد الأيام منذ آخر نسخة خارجية؛ null إن لم تُحفظ قط. */
export function daysSinceExternalBackup(now = Date.now()) {
  const t = getLastExternalBackupAt();
  return t > 0 ? Math.max(0, Math.floor((now - t) / DAY_MS_EXT)) : null;
}

/**
 * ينشئ نسخة جديدة ثم يشاركها (Web Share مع ملف) وإلا ينزّلها.
 * @param {Object} [deps] — للاختبار: { navigator, download }
 * @returns {Promise<{ok:boolean, method?:'share'|'download', cancelled?:boolean, error?:string}>}
 */
export async function shareLatestBackup(deps = {}) {
  const nav = deps.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const download = deps.download || exportBackupToFile;

  const created = await createBackup({ label: 'نسخة للمشاركة' });
  if (!created.ok) return { ok: false, error: created.error || 'تعذّر إنشاء النسخة' };

  try {
    const backup = await getBackup(created.id);
    if (backup && nav && typeof nav.canShare === 'function' && typeof File !== 'undefined') {
      const file = new File([JSON.stringify(backup)],
        'jalabiya-backup-' + localDateInput(Date.now()) + '.json', { type: 'application/json' });
      if (nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'نسخة احتياطية — الجلابية' });
          markExternalBackup();
          return { ok: true, method: 'share' };
        } catch (e) {
          if (e && e.name === 'AbortError') return { ok: false, cancelled: true };
          /* فشلت المشاركة لسبب آخر: ننزّل الملف بدلاً منها */
        }
      }
    }
  } catch { /* ننتقل للتنزيل */ }

  const ok = await download(created.id);
  return ok ? { ok: true, method: 'download' } : { ok: false, error: 'تعذّر تنزيل النسخة' };
}

/* ==========================================================================
   7ج. فحص سلامة النسخة الاحتياطية (v3.3.51)
   ==========================================================================
   النسخة اللي ما اتجرّبتش مش مضمونة. هذا الفحص يقرأ النسخة من المخزن ويتأكد إنها
   كاملة وقابلة للتصدير وسليمة الأرقام قبل ما تحتاجها فعلاً — دون أن يمسّ بياناتك الحالية. */

const VERIFY_KEY = 'jalabiya_v3_last_backup_verify';
const VERIFY_EVERY_DAYS = 7;
const CORE_STORES = [STORES.CUSTOMERS, STORES.ORDERS, STORES.PAYMENTS];

/**
 * فحص نسخة احتياطية (قراءة فقط).
 * @param {string} id
 * @returns {Promise<{ok:boolean, backupId:string, createdAt:number, errors:string[], warnings:string[], counts:Object}>}
 */
export async function verifyBackup(id) {
  const errors = [];
  const warnings = [];
  const res = (b) => ({ ok: errors.length === 0, backupId: id, createdAt: (b && b.createdAt) || 0,
    errors, warnings, counts: (b && b.counts) || {} });

  let backup = null;
  try { backup = await getBackup(id); } catch { backup = null; }
  if (!backup) { errors.push('النسخة غير موجودة أو تعذّرت قراءتها'); return res(null); }
  if (!backup.stores || typeof backup.stores !== 'object') {
    errors.push('النسخة لا تحتوي مخازن بيانات'); return res(backup);
  }

  /* 1) المخازن الأساسية لازم تكون موجودة؛ الناقص من نسخ أقدم تحذير فقط */
  for (const st of BACKUP_STORES) {
    if (!Array.isArray(backup.stores[st])) {
      if (CORE_STORES.includes(st)) errors.push('المخزن الأساسي «' + st + '» مفقود من النسخة');
      else warnings.push('المخزن «' + st + '» غير موجود (نسخة أقدم من إضافته)');
    }
  }

  /* 2) سلامة السجلات: معرّف موجود وغير مكرر، والعدّاد المسجّل يطابق الفعلي */
  for (const st of BACKUP_STORES) {
    const list = backup.stores[st];
    if (!Array.isArray(list)) continue;
    const seen = new Set();
    let noId = 0; let dup = 0;
    for (const r of list) {
      if (!r || typeof r !== 'object' || r.id == null) { noId++; continue; }
      if (seen.has(r.id)) dup++; else seen.add(r.id);
    }
    if (noId > 0) errors.push('«' + st + '»: ' + noId + ' سجل بلا معرّف (لن يُستعاد)');
    if (dup > 0) errors.push('«' + st + '»: ' + dup + ' سجل مكرر المعرّف');
    if (backup.counts && backup.counts[st] != null && backup.counts[st] !== list.length) {
      errors.push('«' + st + '»: العدد المسجّل ' + backup.counts[st] + ' لا يطابق الفعلي ' + list.length);
    }
  }

  /* 3) قابلة للتصدير كملف JSON (نفس ما يفعله زر المشاركة) */
  try {
    const len = JSON.stringify(backup).length;
    if (!len || len < 10) errors.push('تعذّر تحويل النسخة لملف');
  } catch (e) { errors.push('النسخة لا تُحوَّل لملف JSON: ' + (e && e.message || e)); }

  /* 4) روابط: طلب/دفعة لعميل غير موجود في النسخة (تحذير، قد يكون حذفاً قديماً) */
  const custIds = new Set((backup.stores[STORES.CUSTOMERS] || []).map((c) => c && c.id));
  const countOrphans = (store) => (backup.stores[store] || [])
    .filter((r) => r && r.customerId && !custIds.has(r.customerId)).length;
  const oo = countOrphans(STORES.ORDERS);
  const po = countOrphans(STORES.PAYMENTS);
  if (oo > 0) warnings.push(oo + ' طلب مرتبط بعميل غير موجود في النسخة');
  if (po > 0) warnings.push(po + ' دفعة مرتبطة بعميل غير موجود في النسخة');

  /* 5) مقارنة مع البيانات الحالية: نسخة شبه فارغة والبيانات الحية كبيرة = خطر */
  try {
    for (const st of [STORES.CUSTOMERS, STORES.ORDERS]) {
      const live = await idb.count(st);
      const inBackup = (backup.stores[st] || []).length;
      if (live >= 5 && inBackup === 0) errors.push('«' + st + '» فاضي في النسخة بينما فيه ' + live + ' سجل حالياً');
      else if (live >= 10 && inBackup < live * 0.5) {
        warnings.push('«' + st + '»: ' + inBackup + ' في النسخة مقابل ' + live + ' حالياً (النسخة أقدم بكثير)');
      }
    }
  } catch { /* المقارنة اختيارية */ }

  return res(backup);
}

/** آخر نتيجة فحص محفوظة (أو null). */
export function getLastVerification() {
  try {
    const v = JSON.parse(localStorage.getItem(VERIFY_KEY) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

function saveVerification(r) {
  try {
    localStorage.setItem(VERIFY_KEY, JSON.stringify({
      at: Date.now(), backupId: r.backupId, backupAt: r.createdAt, ok: r.ok,
      errors: r.errors.slice(0, 10), warnings: r.warnings.slice(0, 10),
    }));
  } catch { /* اختياري */ }
}

/**
 * يفحص أحدث نسخة ويحفظ النتيجة.
 * @returns {Promise<Object|null>} null لو لا توجد نسخ
 */
export async function verifyLatestBackup() {
  const list = await listBackups();
  if (list.length === 0) return null;
  const r = await verifyBackup(list[0].id);
  saveVerification(r);
  return r;
}

/**
 * يفحص أحدث نسخة لو مضى أسبوع على آخر فحص، أو ظهرت نسخة أحدث من المفحوصة.
 * @returns {Promise<Object|null>} نتيجة الفحص لو جرى، وإلا null
 */
export async function verifyLatestBackupIfDue() {
  try {
    const last = getLastVerification();
    const list = await listBackups();
    if (list.length === 0) return null;
    const stale = !last || (Date.now() - last.at) > VERIFY_EVERY_DAYS * DAY_MS_EXT;
    const newer = last && last.backupId !== list[0].id;
    if (!stale && !newer) return null;
    return await verifyLatestBackup();
  } catch (e) {
    console.warn('[verifyBackup]', e);
    return null;
  }
}

/* ==========================================================================
   8. تصدير داخلي للاختبار
   ========================================================================== */

export const _internal = { BACKUP_STORES, getLastAutoBackupAt, setLastAutoBackupAt };
