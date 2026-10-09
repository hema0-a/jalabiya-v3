/* ==========================================================================
   firestore-sync.js — مزامنة Firestore (Push/Pull) — الصيغة v2
   ==========================================================================
   المسار:
     users_v3/{uid}/data/main           ← manifest: { version:2, updatedAt, manifest:{ store:{chunks,count} } }
     users_v3/{uid}/data/store_{s}_{n}  ← شريحة سجلات { store, index, records:[...] }
   كل شريحة أقل من ~700KB فلا يصطدم الرفع بحد 1 MB للمستند، ويغطي كل مخازن البيانات.
   المستند الرئيسي يُكتب أخيراً: إن انقطع الرفع في المنتصف تبقى النسخة السحابية القديمة سليمة.
   القراءة تدعم أيضاً الصيغة القديمة (مستند واحد فيه stores) لمن رفع قبل v3.3.12.
   لا يبدأ تلقائياً.
   ========================================================================== */

import { loadFirebase } from './firebase-config.js';
import { FIRESTORE_PATHS } from '../core/config.js';
import * as idb from '../data/idb.js';

/* --- المخازن المُزامَنة (لا تشمل settings ولا trash ولا backups) --- */
export const SYNC_STORES = [
  'customers', 'orders', 'payments', 'inventory',
  'workers', 'expenses', 'appointments', 'activity',
  'portfolio', 'commitments', 'commitmentPayments', 'savingsGoals',
  'houseExpenses', 'personalLoans', 'loanPayments', 'referrals', 'workerPayments',
];

const VERSION = '10.12.0';
/* حجم الشريحة الواحدة (JSON) — حد Firestore 1,048,576 بايت ونترك هامشاً للترميز */
const CHUNK_LIMIT_BYTES = 700000;
let _fsModule = null;
let _testBackend = null;

/** حقن بديل Firestore للاختبار فقط. */
export function _setBackendForTest(backend) { _testBackend = backend; }

/**
 * تحميل Firestore module (Lazy).
 */
async function ensureFirestore() {
  if (_testBackend) return _testBackend;
  const { db } = await loadFirebase();
  if (!_fsModule) {
    _fsModule = await import(
      'https://www.gstatic.com/firebasejs/' + VERSION + '/firebase-firestore.js'
    );
  }
  return { db, fsMod: _fsModule };
}

/**
 * مسار المستند الرئيسي للمستخدم.
 * @param {string} uid
 * @returns {string}
 */
function docPath(uid) {
  return FIRESTORE_PATHS.base + '/' + uid + '/' + FIRESTORE_PATHS.dataMain;
}

/** مسار شريحة. */
function chunkPath(uid, store, n) {
  return FIRESTORE_PATHS.base + '/' + uid + '/data/store_' + store + '_' + n;
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

/**
 * تقسيم سجلات مخزن إلى شرائح أقل من الحد.
 * @returns {{chunks:Array[], oversized:Object|null}}
 */
function splitIntoChunks(list) {
  const enc = new TextEncoder();
  const chunks = [];
  let cur = [];
  let curBytes = 0;
  for (const rec of list) {
    const bytes = enc.encode(JSON.stringify(rec)).length + 1;
    if (bytes > CHUNK_LIMIT_BYTES) return { chunks: null, oversized: rec };
    if (cur.length > 0 && curBytes + bytes > CHUNK_LIMIT_BYTES) {
      chunks.push(cur); cur = []; curBytes = 0;
    }
    cur.push(rec); curBytes += bytes;
  }
  if (cur.length > 0) chunks.push(cur);
  return { chunks, oversized: null };
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
    const counts = {};
    const plan = {};

    for (const s of SYNC_STORES) {
      /* فشل قراءة أي مخزن يوقف الرفع كله: رفع قائمة فارغة بدل الفاشلة كان سيمسح بياناته في السحابة */
      let list;
      try { list = await idb.getAll(s); }
      catch (e) { return { ok: false, error: 'تعذّرت قراءة بيانات «' + s + '» محلياً — لم يُرفع شيء حمايةً لنسخة السحابة' }; }
      list = Array.isArray(list) ? list : [];
      counts[s] = list.length;
      const { chunks, oversized } = splitIntoChunks(list);
      if (oversized) {
        return { ok: false, error: 'سجل واحد في «' + s + '» يتجاوز 700KB (غالباً صورة كبيرة جداً) — صغّر الصورة ثم أعد الرفع' };
      }
      plan[s] = chunks;
    }

    /* حماية: رفع قاعدة فارغة يمسح نسخة السحابة السليمة (جهاز جديد / بيانات متصفح ممسوحة) */
    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalRecords === 0) {
      return { ok: false, error: 'لا توجد بيانات محلية لرفعها — الرفع الآن سيمسح بيانات السحابة' };
    }

    /* المانيفست القديم (لحذف الشرائح الزائدة بعد النجاح) */
    let oldManifest = null;
    try {
      const old = await fsMod.getDoc(fsMod.doc(db, docPath(uid)));
      if (old.exists() && old.data() && old.data().manifest) oldManifest = old.data().manifest;
    } catch (e) { /* اختياري */ }

    /* 1) الشرائح أولاً */
    const manifest = {};
    for (const s of SYNC_STORES) {
      const chunks = plan[s];
      for (let i = 0; i < chunks.length; i++) {
        await fsMod.setDoc(fsMod.doc(db, chunkPath(uid, s, i)), { store: s, index: i, records: chunks[i] });
      }
      manifest[s] = { chunks: chunks.length, count: counts[s] };
    }

    /* 2) المستند الرئيسي أخيراً = لحظة اعتماد النسخة */
    await fsMod.setDoc(fsMod.doc(db, docPath(uid)), { version: 2, updatedAt: Date.now(), manifest });

    /* 3) تنظيف الشرائح الزائدة من نسخة سابقة (best-effort) */
    if (oldManifest) {
      for (const s of Object.keys(oldManifest)) {
        const had = Number(oldManifest[s] && oldManifest[s].chunks) || 0;
        const now = manifest[s] ? manifest[s].chunks : 0;
        for (let i = now; i < had; i++) {
          try { await fsMod.deleteDoc(fsMod.doc(db, chunkPath(uid, s, i))); } catch (e) { /* لا يضر */ }
        }
      }
    }

    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/* ==========================================================================
   Pull: قراءة البيانات من Firestore
   ========================================================================== */

/**
 * قراءة snapshot من Firestore (يدعم الصيغتين).
 * @param {string} uid
 * @returns {Promise<{ok:boolean, data?:Object, error?:string}>}
 */
export async function pull(uid) {
  if (!uid) return { ok: false, error: 'uid مطلوب' };

  try {
    const { db, fsMod } = await ensureFirestore();
    const snap = await fsMod.getDoc(fsMod.doc(db, docPath(uid)));

    if (!snap.exists()) {
      return { ok: true, data: null };
    }
    const main = snap.data();

    /* الصيغة القديمة: المستند الواحد فيه stores */
    if (!main.manifest) return { ok: true, data: main };

    const stores = {};
    for (const s of Object.keys(main.manifest)) {
      const info = main.manifest[s] || {};
      const records = [];
      for (let i = 0; i < (Number(info.chunks) || 0); i++) {
        const c = await fsMod.getDoc(fsMod.doc(db, chunkPath(uid, s, i)));
        if (!c.exists()) {
          return { ok: false, error: 'النسخة السحابية ناقصة (الشريحة ' + s + '#' + i + ') — أعد الرفع من الجهاز الأصلي' };
        }
        const arr = c.data() && c.data().records;
        if (Array.isArray(arr)) records.push(...arr);
      }
      if (records.length !== (Number(info.count) || 0)) {
        return { ok: false, error: 'عدد سجلات «' + s + '» في السحابة لا يطابق المانيفست — لم يُطبَّق شيء' };
      }
      stores[s] = records;
    }
    return { ok: true, data: { stores, updatedAt: main.updatedAt } };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/* ==========================================================================
   Apply: دمج البيانات المُنزَّلة في IndexedDB المحلي
   ========================================================================== */

/**
 * استبدال بيانات المخازن الموجودة في snapshot (ذرّياً).
 * @param {Object} snapshot — { stores: {...}, updatedAt }
 * @returns {Promise<{ok:boolean, counts?:Object, error?:string}>}
 */
export async function apply(snapshot) {
  if (!snapshot || !snapshot.stores) {
    return { ok: false, error: 'snapshot غير صالح' };
  }
  try {
    /* استبدال ذرّي: لا تبقى البيانات نصف مكتوبة إن انقطع الاتصال أو فسد سجل */
    const plan = {};
    for (const s of SYNC_STORES) {
      /* مخزن غائب من النسخة السحابية (نسخة أقدم/ناقصة) لا يُمسح محلياً */
      if (!Array.isArray(snapshot.stores[s])) continue;
      const list = snapshot.stores[s];
      plan[s] = { clear: true, records: list.filter((r) => r && typeof r === 'object' && r.id != null) };
    }
    if (Object.keys(plan).length === 0) {
      return { ok: false, error: 'النسخة السحابية لا تحتوي أي مخزن صالح' };
    }
    const counts = await idb.writeBatch(plan);
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/**
 * وقت آخر تحديث للنسخة السحابية (يقرأ المستند الرئيسي فقط).
 * @param {string} uid
 * @returns {Promise<number|null>}
 */
export async function lastRemoteUpdate(uid) {
  try {
    const { db, fsMod } = await ensureFirestore();
    const snap = await fsMod.getDoc(fsMod.doc(db, docPath(uid)));
    if (!snap.exists()) return null;
    return (snap.data() && snap.data().updatedAt) || null;
  } catch (e) {
    return null;
  }
}
