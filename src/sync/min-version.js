/* ==========================================================================
   min-version.js — حارس الإصدار الأدنى للمزامنة (v3.3.84)
   ==========================================================================
   المشكلة: جهاز لم يُحدَّث (قبل 3.3.83) لا يعرف الدفتر المرجع؛ يكتب الرصيد والنقاط مباشرة ويرفعها،
   ويستبدل الدفتر عند «الاستبدال» (ثغرة أُغلقت في 3.3.83). كود هذا الإصدار وحده لا يوقفه لأنه لا يحمله.
   الحل على ثلاث طبقات:
     1) كل رفع من إصدار جديد يختم المستند الرئيسي بـ writerBuild (إصدار الكاتب) و minClientBuild (الأدنى المسموح،
        لا ينخفض أبداً). الإصدار الجديد يرفض الرفع/التنزيل إن كان أقدم من minClientBuild (client-outdated)
        ولو بـ force — فالقوة تتجاوز حماية البيانات لا حماية الإصدار.
     2) كشف: مستند رئيسي بلا writerBuild أو بإصدار أقدم من الحد ⟵ آخر رفع جاء من جهاز قديم (تنبيه + المصالحة).
     3) المنع الفعلي لجهاز قديم: شرط في firestore.rules يرفض كتابة المستند الرئيسي بلا writerBuild كافٍ
        (يُنشر يدوياً من Firebase Console بعد تحديث كل أجهزتك — انظر firestore.rules).
   وحدة نقية بلا idb/Firebase.
   ========================================================================== */

import { APP_CONFIG } from '../core/config.js';

/**
 * أدنى إصدار مسموح له بالمزامنة. 3.3.87 = الوسائط الجديدة تُكتب في orderMedia: جهاز أقدم لا يعرف المخزن فيمحوه من السحابة
 * عند رفع بيان مخازنه، وواجهة 3.3.86 لا تقرأ الوسائط المفصولة (ستبدو الصور مفقودة). (قبلها: 3003084 = الدفتر المرجع.)
 */
export const MIN_CLIENT_BUILD = 3003087;

/** رسالة موحّدة للمستخدم. */
export const OUTDATED_MESSAGE = 'إصدار التطبيق على هذا الجهاز أقدم من المسموح للمزامنة مع السحابة — حدّث التطبيق (أغلقه وأعد فتحه، أو امسح ذاكرة الموقع) ثم أعد المحاولة. لم يُكتب شيء.';

/**
 * يحوّل رقم إصدار «3.3.84» إلى عدد صحيح قابل للمقارنة (3003084). غير صالح ⟵ 0.
 * @param {string} version
 * @returns {number}
 */
export function toBuild(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!m) return 0;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (b > 999 || c > 999) return 0;
  return a * 1_000_000 + b * 1_000 + c;
}

/** @returns {number} رقم بناء هذا التطبيق */
export function clientBuild() { return toBuild(APP_CONFIG.version); }

/**
 * هل يسمح هذا الإصدار بالمزامنة مع المستند الرئيسي الحالي؟
 * @param {Object|null} main — المستند الرئيسي في السحابة (null = لا يوجد)
 * @param {number} [myBuild]
 * @returns {{ok:boolean, minBuild:number}}
 */
export function checkClient(main, myBuild = clientBuild()) {
  const minBuild = Number(main && main.minClientBuild) || 0;
  return { ok: myBuild >= minBuild, minBuild };
}

/**
 * الحقول التي تُختم بها المستند الرئيسي عند الرفع. الحد الأدنى لا ينخفض أبداً (أعلى القيمتين).
 * @param {Object|null} remoteMain
 * @param {number} [myBuild]
 * @returns {{writerVersion:string, writerBuild:number, minClientBuild:number}}
 */
export function writerStamp(remoteMain, myBuild = clientBuild()) {
  const remoteMin = Number(remoteMain && remoteMain.minClientBuild) || 0;
  return {
    writerVersion: APP_CONFIG.version,
    writerBuild: myBuild,
    minClientBuild: Math.max(MIN_CLIENT_BUILD, remoteMin),
  };
}

/**
 * هل آخر كاتب للسحابة إصدار أقدم من الحد؟ (مستند بلا ختم = كتبه إصدار قبل 3.3.84.)
 * @param {Object|null} main
 * @returns {boolean} false إن لم يوجد مستند أصلاً
 */
export function isOldWriter(main) {
  if (!main) return false;
  return (Number(main.writerBuild) || 0) < MIN_CLIENT_BUILD;
}
