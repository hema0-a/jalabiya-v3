/* ==========================================================================
   firestore-sync.js — مزامنة Firestore (Push/Pull) — الصيغة v2
   ==========================================================================
   المسار:
     users_v3/{uid}/data/main                ← manifest: { version:2, gen, updatedAt, manifest:{ store:{chunks,count} } }
     users_v3/{uid}/data/store_{s}_g{gen}_{n} ← شريحة سجلات { store, index, records:[...] }
   (الصيغة السابقة بلا gen: store_{s}_{n} — ما زالت تُقرأ.)
   كل شريحة أقل من ~700KB فلا يصطدم الرفع بحد 1 MB للمستند، ويغطي كل مخازن البيانات.

   ضمانات عدم فقدان البيانات (v3.3.21):
     1) كل رفع يكتب شرائح «جيل» جديد بمسارات جديدة، ولا يلمس شرائح النسخة الحالية.
        المستند الرئيسي (الذي يشير للجيل) يُحدَّث أخيراً وبمعاملة مقارنة-وتبديل،
        فانقطاع الرفع لا يُفسد النسخة السحابية القائمة، وتُحذف الشرائح اليتيمة.
     2) لا يُرفع شيء فوق سحابة تغيّرت من جهاز آخر (أو لم يزامنها هذا الجهاز قط)
        إلا بقرار صريح (force) — والحل الموصى به: دمج ثم رفع.
     3) رفع بيانات أقل بكثير من السحابة يُوقَف (بيانات محلية ناقصة غالباً).
     4) التنزيل يدعم الدمج (apply mode:'merge'): لا يُمسح أي سجل محلي، والأحدث updatedAt يفوز.
   القراءة تدعم أيضاً الصيغة القديمة (مستند واحد فيه stores) لمن رفع قبل v3.3.12.
   لا يبدأ تلقائياً.
   ========================================================================== */

import { loadFirebase } from './firebase-config.js';
import { FIRESTORE_PATHS } from '../core/config.js';
import * as idb from '../data/idb.js';
import { markClean, markCleanIfUnchanged } from './dirty-state.js';

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

/** مسار شريحة (gen فارغ = الصيغة السابقة بلا جيل). */
function chunkPath(uid, store, n, gen) {
  return FIRESTORE_PATHS.base + '/' + uid + '/data/store_' + store + '_' + (gen ? 'g' + gen + '_' : '') + n;
}

/* ==========================================================================
   رقم نسخة السحابة التي يعرفها هذا الجهاز (آخر ما نزّله أو رفعه)
   يُقارَن بالتساوي فقط (لا بالترتيب) فلا تتأثر الحماية بفرق ساعات الأجهزة.
   ========================================================================== */
const KNOWN_REV_KEY = 'jalabiya_v3_remote_rev';

/** @returns {number|null} null = هذا الجهاز لم يزامن مع السحابة قط */
export function getKnownRev() {
  try {
    const v = localStorage.getItem(KNOWN_REV_KEY);
    return v === null ? null : Number(v) || 0;
  } catch (e) { return null; }
}

export function setKnownRev(rev) {
  try {
    if (rev === null || rev === undefined) localStorage.removeItem(KNOWN_REV_KEY);
    else localStorage.setItem(KNOWN_REV_KEY, String(Number(rev) || 0));
  } catch (e) { /* ignore */ }
}

/** مجموع السجلات المعلن في المستند الرئيسي (الصيغتين). */
function remoteTotal(main) {
  if (!main) return 0;
  if (main.manifest) {
    return Object.values(main.manifest).reduce((a, m) => a + (Number(m && m.count) || 0), 0);
  }
  if (main.stores) {
    return Object.values(main.stores).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0);
  }
  return 0;
}

/** كتابة المستند الرئيسي: مقارنة-وتبديل ذرّية إن توفّرت المعاملات (expectedRev=undefined = بلا مقارنة). */
async function commitMain(fsMod, db, uid, newMain, expectedRev) {
  const ref = fsMod.doc(db, docPath(uid));
  if (expectedRev !== undefined && typeof fsMod.runTransaction === 'function') {
    await fsMod.runTransaction(db, async (tx) => {
      const cur = await tx.get(ref);
      const curRev = cur.exists() && cur.data() ? (Number(cur.data().updatedAt) || 0) : null;
      if (curRev !== expectedRev) {
        const e = new Error('remote-changed');
        e.code = 'remote-changed';
        throw e;
      }
      tx.set(ref, newMain);
    });
  } else {
    await fsMod.setDoc(ref, newMain);
  }
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
 * @param {{force?:boolean}} [opts] — force: تجاوز حمايات «السحابة تغيّرت/البيانات المحلية أقل» (قرار صريح من المستخدم)
 * @returns {Promise<{ok:boolean, counts?:Object, error?:string, code?:string, remoteUpdatedAt?:number, firstSync?:boolean, remoteTotal?:number, localTotal?:number}>}
 *   code: 'remote-changed' | 'shrink' عند إيقاف الرفع حمايةً للسحابة.
 */
export async function push(uid, opts = {}) {
  if (!uid) return { ok: false, error: 'uid مطلوب' };
  const force = !!(opts && opts.force);
  const startedAt = Date.now(); /* تعديل بعد هذه اللحظة يبقى «غير مرفوع» */

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

    /* حالة السحابة الآن: إلزامية (إن تعذّرت القراءة لا نرفع على العمياء) */
    let remote = null;
    try {
      const snap = await fsMod.getDoc(fsMod.doc(db, docPath(uid)));
      if (snap.exists() && snap.data()) remote = snap.data();
    } catch (e) {
      return { ok: false, error: 'تعذّر التحقق من حالة السحابة قبل الرفع — ' + translateError(e) };
    }
    const remoteRev = remote ? (Number(remote.updatedAt) || 0) : null;
    const oldManifest = remote && remote.manifest ? remote.manifest : null;
    const oldGen = remote && remote.gen ? remote.gen : null;

    if (remote && !force) {
      const known = getKnownRev();
      if (known === null || known !== remoteRev) {
        return {
          ok: false, code: 'remote-changed', remoteUpdatedAt: remoteRev, firstSync: known === null,
          error: known === null
            ? 'هذا الجهاز لم يزامن مع السحابة من قبل وفيها بيانات — الرفع المباشر قد يمسحها'
            : 'السحابة تغيّرت من جهاز آخر منذ آخر مزامنة — الرفع المباشر قد يمسح تعديلاتها',
        };
      }
      const rTotal = remoteTotal(remote);
      if (rTotal >= 10 && totalRecords < rTotal * 0.5) {
        return {
          ok: false, code: 'shrink', remoteTotal: rTotal, localTotal: totalRecords,
          error: 'بيانات هذا الجهاز (' + totalRecords + ' سجل) أقل بكثير من السحابة (' + rTotal + ' سجل) — غالباً بياناته ناقصة',
        };
      }
    }

    /* 1) شرائح جيل جديد بمسارات جديدة — لا نلمس شرائح النسخة الحالية */
    const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const written = [];
    const manifest = {};
    const newRev = Math.max(Date.now(), (remoteRev || 0) + 1);
    try {
      for (const s of SYNC_STORES) {
        const chunks = plan[s];
        for (let i = 0; i < chunks.length; i++) {
          const path = chunkPath(uid, s, i, gen);
          await fsMod.setDoc(fsMod.doc(db, path), { store: s, index: i, records: chunks[i] });
          written.push(path);
        }
        manifest[s] = { chunks: chunks.length, count: counts[s] };
      }

      /* 2) المستند الرئيسي أخيراً = لحظة اعتماد النسخة (مقارنة-وتبديل: يفشل إن تغيّرت السحابة أثناء الرفع) */
      await commitMain(fsMod, db, uid, { version: 2, gen, updatedAt: newRev, manifest }, force ? undefined : remoteRev);
    } catch (err) {
      /* النسخة القديمة سليمة؛ ننظّف الشرائح اليتيمة (best-effort) */
      for (const path of written) {
        try { await fsMod.deleteDoc(fsMod.doc(db, path)); } catch (e) { /* لا يضر */ }
      }
      if (err && err.code === 'remote-changed') {
        return { ok: false, code: 'remote-changed', remoteUpdatedAt: null, firstSync: false,
          error: 'السحابة تغيّرت أثناء الرفع من جهاز آخر — لم يُستبدل شيء' };
      }
      return { ok: false, error: translateError(err) };
    }

    setKnownRev(newRev);
    markCleanIfUnchanged(startedAt);

    /* 3) حذف شرائح الجيل السابق (best-effort) — بعد اعتماد الجديد فقط */
    if (oldManifest) {
      for (const s of Object.keys(oldManifest)) {
        const had = Number(oldManifest[s] && oldManifest[s].chunks) || 0;
        for (let i = 0; i < had; i++) {
          try { await fsMod.deleteDoc(fsMod.doc(db, chunkPath(uid, s, i, oldGen))); } catch (e) { /* لا يضر */ }
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
 * إن اختفت شريحة أثناء القراءة (جهاز آخر رفع نسخة جديدة وحذف القديمة) نعيد القراءة مرة.
 * @param {string} uid
 * @returns {Promise<{ok:boolean, data?:Object, error?:string}>}
 */
export async function pull(uid) {
  if (!uid) return { ok: false, error: 'uid مطلوب' };

  try {
    const { db, fsMod } = await ensureFirestore();
    let lastError = 'النسخة السحابية ناقصة — أعد الرفع من الجهاز الأصلي';

    for (let attempt = 0; attempt < 2; attempt++) {
      const snap = await fsMod.getDoc(fsMod.doc(db, docPath(uid)));

      if (!snap.exists()) {
        return { ok: true, data: null };
      }
      const main = snap.data();

      /* الصيغة القديمة: المستند الواحد فيه stores */
      if (!main.manifest) return { ok: true, data: { ...main, updatedAt: Number(main.updatedAt) || 0 } };

      const gen = main.gen || null;
      const stores = {};
      let retry = false;
      for (const s of Object.keys(main.manifest)) {
        const info = main.manifest[s] || {};
        const records = [];
        for (let i = 0; i < (Number(info.chunks) || 0); i++) {
          const c = await fsMod.getDoc(fsMod.doc(db, chunkPath(uid, s, i, gen)));
          if (!c.exists()) {
            lastError = 'النسخة السحابية ناقصة (الشريحة ' + s + '#' + i + ') — أعد الرفع من الجهاز الأصلي';
            retry = true;
            break;
          }
          const arr = c.data() && c.data().records;
          if (Array.isArray(arr)) records.push(...arr);
        }
        if (retry) break;
        if (records.length !== (Number(info.count) || 0)) {
          return { ok: false, error: 'عدد سجلات «' + s + '» في السحابة لا يطابق المانيفست — لم يُطبَّق شيء' };
        }
        stores[s] = records;
      }
      if (retry) continue;
      return { ok: true, data: { stores, updatedAt: Number(main.updatedAt) || 0 } };
    }
    return { ok: false, error: lastError };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/* ==========================================================================
   Apply: دمج البيانات المُنزَّلة في IndexedDB المحلي
   ========================================================================== */

function recTime(r) { return Number(r && r.updatedAt) || 0; }

/**
 * مقارنة سجلات سحابية بالمحلية في مخزن واحد.
 * @returns {{toPut:Array, added:number, updated:number, localOnly:number, localNewer:number}}
 *   toPut: سجلات السحابة التي يجب كتابتها محلياً في الدمج (جديدة أو أحدث).
 */
function compareStore(local, cloud) {
  const localMap = new Map();
  for (const r of local) if (r && r.id != null) localMap.set(r.id, r);
  const cloudIds = new Set();
  const toPut = [];
  let added = 0, updated = 0, localNewer = 0;
  for (const c of cloud) {
    if (!c || typeof c !== 'object' || c.id == null) continue;
    cloudIds.add(c.id);
    const l = localMap.get(c.id);
    if (!l) { toPut.push(c); added++; }
    else if (recTime(c) > recTime(l)) { toPut.push(c); updated++; }
    else if (recTime(l) > recTime(c)) { localNewer++; }
  }
  let localOnly = 0;
  for (const id of localMap.keys()) if (!cloudIds.has(id)) localOnly++;
  return { toPut, added, updated, localOnly, localNewer };
}

/**
 * ماذا سيحدث لو دُمجت السحابة مع المحلي؟ (للقراءة فقط — لا يكتب شيئاً)
 * @param {Object} snapshot — { stores }
 * @returns {Promise<{ok:boolean, localOnly?:number, localNewer?:number, added?:number, updated?:number, error?:string}>}
 */
export async function analyzeLocalVsCloud(snapshot) {
  if (!snapshot || !snapshot.stores) return { ok: false, error: 'snapshot غير صالح' };
  try {
    const tot = { localOnly: 0, localNewer: 0, added: 0, updated: 0 };
    for (const s of SYNC_STORES) {
      if (!Array.isArray(snapshot.stores[s])) continue;
      const local = await idb.getAll(s);
      const r = compareStore(Array.isArray(local) ? local : [], snapshot.stores[s]);
      tot.localOnly += r.localOnly; tot.localNewer += r.localNewer;
      tot.added += r.added; tot.updated += r.updated;
    }
    return { ok: true, ...tot };
  } catch (err) {
    return { ok: false, error: translateError(err) };
  }
}

/**
 * تطبيق بيانات السحابة محلياً (ذرّياً).
 *  - mode 'replace' (الافتراضي): استبدال مخازن الـ snapshot بالسحابة.
 *  - mode 'merge': لا يُمسح أي سجل محلي؛ سجلات السحابة الجديدة تُضاف، وفي التعارض يفوز الأحدث updatedAt
 *    (والمحلي عند التساوي). ثمنه: سجل حُذف على جهاز آخر قد يعود هنا — أهون من ضياع بيانات.
 * @param {Object} snapshot — { stores: {...}, updatedAt }
 * @param {{mode?:'replace'|'merge'}} [opts]
 * @returns {Promise<{ok:boolean, counts?:Object, merge?:Object, error?:string}>}
 */
export async function apply(snapshot, opts = {}) {
  if (!snapshot || !snapshot.stores) {
    return { ok: false, error: 'snapshot غير صالح' };
  }
  const merge = !!(opts && opts.mode === 'merge');
  try {
    /* استبدال/دمج ذرّي: لا تبقى البيانات نصف مكتوبة إن انقطع الاتصال أو فسد سجل */
    const plan = {};
    const stats = { added: 0, updated: 0, localOnly: 0, localNewer: 0 };
    for (const s of SYNC_STORES) {
      /* مخزن غائب من النسخة السحابية (نسخة أقدم/ناقصة) لا يُمسح محلياً */
      if (!Array.isArray(snapshot.stores[s])) continue;
      const list = snapshot.stores[s];
      if (merge) {
        const local = await idb.getAll(s);
        const r = compareStore(Array.isArray(local) ? local : [], list);
        plan[s] = { clear: false, records: r.toPut };
        stats.added += r.added; stats.updated += r.updated;
        stats.localOnly += r.localOnly; stats.localNewer += r.localNewer;
      } else {
        plan[s] = { clear: true, records: list.filter((r) => r && typeof r === 'object' && r.id != null) };
      }
    }
    if (Object.keys(plan).length === 0) {
      return { ok: false, error: 'النسخة السحابية لا تحتوي أي مخزن صالح' };
    }
    const counts = await idb.writeBatch(plan);
    /* بعد التطبيق صار هذا الجهاز يعرف نسخة السحابة هذه — فيسمح الرفع التالي */
    if (snapshot.updatedAt !== undefined) setKnownRev(snapshot.updatedAt);
    /* استبدال (أو دمج بلا زيادات محلية) = الجهاز يطابق السحابة؛ دمج مع زيادات محلية = يحتاج رفعاً */
    if (!merge || (stats.localOnly === 0 && stats.localNewer === 0)) markClean();
    return merge ? { ok: true, counts, merge: stats } : { ok: true, counts };
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
