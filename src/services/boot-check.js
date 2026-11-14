/* ==========================================================================
   boot-check.js — فحص سلامة التخزين عند الإقلاع (دوال نقية)
   ==========================================================================
   حالتان تستحقان التوقف قبل فتح التطبيق:
     1) open-failed   : تعذّر فتح قاعدة IndexedDB أصلاً (تبويب آخر يمنع التحديث، تلف، إلخ).
     2) possible-wipe : القاعدة فُتحت **فارغة** رغم أن الجهاز سبق أن أخذ نسخة تلقائية.
                        هذا ما يحدث حين يحذف المتصفح التخزين عند امتلاء الهاتف — وتضيع معه النسخ
                        الداخلية أيضاً (لأنها في نفس القاعدة)، فالمنقذ الوحيد ملف نسخة خارجية.
   لا استعادة صامتة أبداً: الاستعادة قرار المستخدم (قد تكون النسخة أقدم من بيانات حالية).
   ========================================================================== */

/**
 * @param {{openError?:*, lastAutoBackupAt?:number, lastExternalBackupAt?:number,
 *          recordCount?:number, backupCount?:number, ackedAt?:number}} s
 *   recordCount: عدد سجلات البيانات الحقيقية (بدون الإعدادات). backupCount: النسخ الداخلية.
 *   ackedAt: قيمة آخر نسخة تلقائية كان المستخدم قد قرّر عندها «ابدأ ببيانات جديدة».
 * @returns {{status:'ok'|'open-failed'|'possible-wipe', reason:string}}
 */
export function assessStartup(s = {}) {
  const st = s || {};
  if (st.openError) return { status: 'open-failed', reason: 'open-error' };
  const lastAuto = Number(st.lastAutoBackupAt) || 0;
  const lastExt = Number(st.lastExternalBackupAt) || 0;
  const hadData = Math.max(lastAuto, lastExt);
  if (!hadData) return { status: 'ok', reason: 'fresh-install' };
  if ((Number(st.recordCount) || 0) > 0 || (Number(st.backupCount) || 0) > 0) return { status: 'ok', reason: 'has-data' };
  if ((Number(st.ackedAt) || 0) >= hadData) return { status: 'ok', reason: 'acknowledged' };
  return { status: 'possible-wipe', reason: 'empty-after-backups' };
}

export const BOOT_ACK_KEY = 'jalabiya_v3_boot_wipe_ack';
