/* ==========================================================================
   firestore-sync.js — مزامنة Firestore (Push/Pull)
   ==========================================================================
   المسار: users_v3/{uid}/data/main
   البنية: { stores: { customers: [...], orders: [...], ... }, updatedAt }
   لا يبدأ تلقائياً.
   ========================================================================== */

import { loadFirebase } from './firebase-config.js';
import { FIRESTORE_PATHS } from '../core/config.js';
import * as idb from '../data/idb.js';

/* --- المخازن المُزامَنة (لا تشمل settings — يُعالَج لاحقاً) --- */
const SYNC_STORES = [
  'customers', 'orders', 'payments', 'inventory',
  'workers', 'expenses', 'appointments', 'activity',
];

const VERSION = '10.12.0';
let _fsModule = null;

/**
 * تحميل Firestore module (Lazy).
 */
async function ensureFirestore() {
  const { db } = await loadFirebase();
  if (!_fsModule) {
    _fsModule = await import(
      'https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-firestore.js'
    );
  }
  return { db, fsMod: _fsModule };
}

/**
 * مسار المستند للمستخدم.
 * @param {string} uid
 * @returns {string}
 */
function docPath(uid) {
  return FIRESTORE_PATHS.base + '/' + uid + '/' + FIRESTORE_PATHS.dataMain;
}

/**
 * ترجمة رسائل Firebase إلى العربية.
 */
function translateError(err) {
  const code = err && err.code ? err.code : '';
  const map = {
    'permission-denied':  'لا توجد صلاحية — تحقق من قواعد Firestore',
    'unavailable':        'الخدمة غير متاحة — تحقق من الاتصال',
    'unauthenticated':    'يجب تسجيل الدخول أولاً',
    'failed-precondition':'الخدمة غير مُهيّأة',
    'not-found':          'لا يوجد مستند محفوظ',
  };
  return map[code] || (err && err.message ? err.message : 'خطأ غير معروف');
}

/* ==========================================================================
   Push: رفع البيانات إلى Firestore
   ========================================================================== */

/**
 * رفع كل البيانات إلى Firestore.
 * @param {string} uid
 * @returns {Promise<{ok:boolean, counts?:Object, error?:string}>}
 */
export async function push(uid) {
  if (!uid) return { ok: false, error: 'uid مطلوب' };

  try {
    const { db, fsMod } = await ensureFirestore();
    const stores = {};
    const counts = {};

    for (const s of SYNC_STORES) {
      const list = await idb.getAll(s).catch(() => []);
      stores[s] = list;
      counts[s] = list.length;
    }

    const payload = {
      stores,
      updatedAt: Date.now(),
    };

    const ref = fsMod.doc(db, docPath(uid));
    await fsMod.setDoc(ref, payload);

    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/* ==========================================================================
   Pull: قراءة البيانات من Firestore
   ========================================================================== */

/**
 * قراءة snapshot من Firestore.
 * @param {string} uid
 * @returns {Promise<{ok:boolean, data?:Object, error?:string}>}
 */
export async function pull(uid) {
  if (!uid) return { ok: false, error: 'uid مطلوب' };

  try {
    const { db, fsMod } = await ensureFirestore();
    const ref = fsMod.doc(db, docPath(uid));
    const snap = await fsMod.getDoc(ref);

    if (!snap.exists()) {
      return { ok: true, data: null };
    }

    return { ok: true, data: snap.data() };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/* ==========================================================================
   Apply: دمج البيانات المُنزَّلة في IndexedDB المحلي
   ========================================================================== */

/**
 * دمج snapshot في IndexedDB (يستبدل بيانات كل مخزن).
 * @param {Object} snapshot — { stores: {...}, updatedAt }
 * @returns {Promise<{ok:boolean, counts?:Object, error?:string}>}
 */
export async function apply(snapshot) {
  if (!snapshot || !snapshot.stores) {
    return { ok: false, error: 'snapshot غير صالح' };
  }
  try {
    const counts = {};
    for (const s of SYNC_STORES) {
      const list = Array.isArray(snapshot.stores[s]) ? snapshot.stores[s] : [];
      await idb.clear(s).catch(() => {});
      for (const rec of list) {
        await idb.put(s, rec);
      }
      counts[s] = list.length;
    }
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/**
 * معلومات المستند (updatedAt).
 * @param {string} uid
 * @returns {Promise<number|null>}
 */
export async function lastRemoteUpdate(uid) {
  const res = await pull(uid);
  if (!res.ok || !res.data) return null;
  return res.data.updatedAt || null;
}
