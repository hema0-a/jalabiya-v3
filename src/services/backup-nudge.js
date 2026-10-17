/* ==========================================================================
   backup-nudge.js — متى نذكّر بنسخة احتياطية خارج الجهاز؟ (دوال نقية)
   ==========================================================================
   النسخ داخل الجهاز لا تحمي من ضياع الهاتف. نُذكّر فقط حين يكون هناك بيانات تستحق الحماية
   ولم تُحفظ نسخة خارج الجهاز منذ مدة، ولا نُلحّ: التأجيل يُسكت التذكير أياماً.
   ========================================================================== */

export const NUDGE_MIN_RECORDS = 20;
export const NUDGE_AFTER_DAYS = 14;
export const NUDGE_SNOOZE_DAYS = 3;
const DAY = 86400000;

/**
 * @param {{externalAt?:number, recordCount?:number, snoozedAt?:number}} s
 * @param {number} [now]
 * @returns {{show:boolean, never:boolean, days:number, text:string}}
 */
export function backupNudge(state = {}, now = Date.now()) {
  const s = state || {};
  const external = Number(s.externalAt) || 0;
  const count = Number(s.recordCount) || 0;
  const snoozed = Number(s.snoozedAt) || 0;
  const none = { show: false, never: false, days: 0, text: '' };
  if (count < NUDGE_MIN_RECORDS) return none;
  if (snoozed && now - snoozed < NUDGE_SNOOZE_DAYS * DAY) return none;
  if (!external) {
    return { show: true, never: true, days: 0, text: '💾 لم تحفظ نسخة احتياطية خارج هذا الهاتف بعد — لو ضاع الهاتف تضيع بيانات ورشتك (' + count + ' سجل).' };
  }
  const days = Math.floor((now - external) / DAY);
  if (days < NUDGE_AFTER_DAYS) return none;
  return { show: true, never: false, days, text: '💾 مرّ ' + days + ' يوماً على آخر نسخة احتياطية خارج الهاتف — احفظ نسخة جديدة لتحمي عملك.' };
}
