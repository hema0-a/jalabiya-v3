/* ==========================================================================
   day-math.js — حساب الأيام بالتقويم المحلي (نواة التواريخ الوحيدة)
   ==========================================================================
   القاعدة: «اليوم» = تاريخ تقويمي محلي (سنة/شهر/يوم) وليس 24 ساعة.
   كل إضافة أو طرح للأيام تتم بأجزاء التاريخ (new Date(y, m, d + n)) فلا تتأثر
   بالتوقيت الصيفي (يوم 23 أو 25 ساعة)، ولا بحفظ التاريخ 00:00 أو 12:00 أو UTC.
   دوال نقية بلا DOM ولا قاعدة بيانات.
   ========================================================================== */

const MS_PER_DAY = 86400000;

/**
 * تحويل قيمة تاريخ (رقم | Date | نص ISO | نص رقمي) إلى timestamp.
 * @param {*} v
 * @returns {number} NaN إن لم تكن صالحة
 */
export function toTimestamp(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{9,}$/.test(s)) return Number(s);
    return Date.parse(s);
  }
  return NaN;
}

/** بداية اليوم المحلي (00:00). NaN إن كانت القيمة غير صالحة. */
export function startOfDay(v) {
  const t = toTimestamp(v);
  if (Number.isNaN(t)) return NaN;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** نهاية اليوم المحلي (23:59:59.999). */
export function endOfDay(v) {
  const t = toTimestamp(v);
  if (Number.isNaN(t)) return NaN;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * ظهر اليوم المحلي n بعد/قبل اليوم الذي يقع فيه v (الصيغة التي يحفظ بها النموذج المواعيد).
 * @param {*} v
 * @param {number} n
 * @returns {number}
 */
export function addDaysNoon(v, n) {
  const t = toTimestamp(v);
  if (Number.isNaN(t)) return NaN;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0).getTime();
}

/** مفتاح اليوم المحلي YYYY-MM-DD ('' إن كانت القيمة غير صالحة). */
export function dayKey(v) {
  const t = toTimestamp(v);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * عدد الأيام التقويمية من a إلى b (موجب إن كان b بعد a). دقيق عبر التوقيت الصيفي.
 * @returns {number} NaN إن كانت إحدى القيمتين غير صالحة
 */
export function dayDiff(a, b) {
  const ta = toTimestamp(a), tb = toTimestamp(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return NaN;
  const A = new Date(ta), B = new Date(tb);
  return Math.round(
    (Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) -
     Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / MS_PER_DAY
  );
}

/** هل القيمتان في اليوم التقويمي نفسه؟ */
export function isSameDay(a, b) {
  const ka = dayKey(a);
  return ka !== '' && ka === dayKey(b);
}

/** يوم الأسبوع (0 = الأحد) لليوم الذي يقع فيه v. NaN إن كانت غير صالحة. */
export function weekdayOf(v) {
  const t = toTimestamp(v);
  return Number.isNaN(t) ? NaN : new Date(t).getDay();
}
