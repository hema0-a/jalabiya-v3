/* ==========================================================================
   sync-identity.js — محو هوية المزامنة من هذا الجهاز (v3.3.50)
   ==========================================================================
   «مسح بيانات الجهاز» (نسيان الرقم السري) كان يمسح مخازن IndexedDB والرقم فقط، فتبقى:
   - جلسة Firebase المحفوظة (IndexedDB: firebaseLocalStorageDb) ← من يمسح البيانات يفتح «المزامنة
     السحابية» وهو ما زال مسجَّلاً بحساب المالك فيسحب كل بياناته من السحابة بلا كلمة مرور.
   - مفاتيح المزامنة (صاحب الجهاز، رقم نسخة السحابة، علامات «غير مرفوع»، طابور الرفع المؤجَّل)،
     وتسجيل البصمة المرتبط بالرقم المحذوف، ومسودات النماذج (فيها أسماء ومبالغ) وسجل حاسبة التسعير.
   بعدها يلزم تسجيل الدخول بكلمة المرور ليُنزَّل أي شيء (وهو المسار الموثَّق للاستعادة).
   لا يعتمد على الشبكة (يعمل دون اتصال)، ولا يرمي أخطاءً.
   ========================================================================== */

import { STORAGE_KEYS } from '../core/config.js';

/** مفاتيح localStorage الخاصة بالمزامنة والهوية على هذا الجهاز */
export const SYNC_IDENTITY_KEYS = [
  STORAGE_KEYS.V3_LAST_SYNC,
  STORAGE_KEYS.V3_OFFLINE_QUEUE,
  'jalabiya_v3_remote_rev',
  'jalabiya_v3_owner_uid',
  'jalabiya_v3_dirty_since',
  'jalabiya_v3_dirty_last',
  'jalabiya_v3_last_push',
  'jalabiya_v3_sync_blocked',
  'jalabiya_v3_bio_cred',
  STORAGE_KEYS.V3_PRICING_HISTORY,   /* سجل حاسبة التسعير (أسعار الورشة) */
];

/** بادئات مفاتيح تحمل بيانات مُدخَلة لم تُحفظ بعد (مسودات النماذج: أسماء ومبالغ وملاحظات) */
const RESIDUE_PREFIXES = ['firebase:', 'firebase_', 'jalabiya_v3_draft_'];

/** قواعد Firebase المحفوظة (الجلسة). deleteDatabase المؤجَّلة تكتمل عند إغلاق الاتصالات (إعادة التحميل). */
const FIREBASE_DBS = ['firebaseLocalStorageDb', 'firebase-heartbeat-database', 'firebase-installations-database'];

function deleteDb(name) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = finish; req.onerror = finish;
      req.onblocked = finish;           /* اتصال مفتوح: يُحذف فور إغلاقه */
      setTimeout(finish, 3000);
    } catch (e) { finish(); }
  });
}

/**
 * @returns {Promise<{keys:number, dbs:number}>} ما مُسح (للاختبار)
 */
export async function clearSyncIdentity() {
  let keys = 0;
  try {
    for (const k of SYNC_IDENTITY_KEYS) {
      if (k && localStorage.getItem(k) !== null) { localStorage.removeItem(k); keys++; }
    }
    /* جلسة Firebase إن كانت في localStorage (بديل IndexedDB) */
    const extra = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && RESIDUE_PREFIXES.some((pre) => k.startsWith(pre))) extra.push(k);
    }
    extra.forEach((k) => { localStorage.removeItem(k); keys++; });
  } catch (e) { /* التخزين قد يكون غير متاح */ }
  await Promise.all(FIREBASE_DBS.map(deleteDb));
  return { keys, dbs: FIREBASE_DBS.length };
}
