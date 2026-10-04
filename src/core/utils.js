/* ==========================================================================
   utils.js — أدوات مساعدة (validators + dates + currency + timing)
   ==========================================================================
   لا تعتمد على أي مكتبة خارجية.
   كل الدوال تتعامل بأمان مع null / undefined.
   ========================================================================== */

/* ==========================================================================
   1. التحقق (Validators)
   ========================================================================== */

/**
 * التحقق من رقم هاتف مصري (01x + 8 أرقام).
 * يقبل: 010/011/012/015.
 * @param {*} phone
 * @returns {boolean}
 */
export function isEgyptPhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  return /^01[0125]\d{8}$/.test(clean) || /^201[0125]\d{8}$/.test(clean);
}

/**
 * التحقق من بريد إلكتروني — regex بسيط آمن.
 * @param {*} email
 * @returns {boolean}
 */
export function isEmail(email) {
  const str = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

/**
 * التحقق من PIN — 4 أرقام بالضبط.
 * @param {*} pin
 * @returns {boolean}
 */
export function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

/**
 * تحويل رقم مصري محلي إلى صيغة دولية.
 * @param {*} phone
 * @returns {string} رقم بصيغة +20... أو السلسلة الأصلية
 */
export function normalizePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (/^01[0125]\d{8}$/.test(clean)) return '+20' + clean.slice(1);
  if (/^201[0125]\d{8}$/.test(clean)) return '+' + clean;
  return String(phone || '');
}

/* ==========================================================================
   2. التنسيق (Formatters)
   ========================================================================== */

const AR_LOCALE = 'ar-EG-u-nu-latn';

/**
 * صياغة عدد بالعربية حسب قواعد التمييز.
 * - 0 → '' (لا شيء، يتولى المتصل صياغته)
 * - 1 → مفرد
 * - 2 → مثنى (بدون رقم)
 * - 3-10 → رقم + جمع
 * - 11+ → رقم + مفرد
 * @param {number} count
 * @param {[string, string, string]} forms - [مفرد، مثنى، جمع]
 * @returns {string}
 */
export function agoPhrase(count, forms) {
  const [singular, dual, plural] = forms;
  if (count < 1) return '';
  if (count === 1) return singular;
  if (count === 2) return dual;
  if (count >= 3 && count <= 10) return `${count} ${plural}`;
  return `${count} ${singular}`;
}

/**
 * تنسيق التاريخ بصيغة عربية: 4 أكتوبر 2026.
 * @param {Date|number|string} date
 * @returns {string} '' إن كانت المدخلة غير صالحة
 */
export function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(AR_LOCALE, {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

/**
 * تنسيق الوقت: 02:30 م.
 * @param {Date|number} date
 * @returns {string}
 */
export function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(AR_LOCALE, {
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
}

/**
 * الوقت النسبي بصياغة عربية صحيحة: "منذ 5 دقائق"، "منذ دقيقتين".
 * ملاحظة: 0 يُعامل كـ timestamp صحيح (Unix epoch)، لا كقيمة فارغة.
 * @param {Date|number} timestamp
 * @returns {string}
 */
export function relativeTime(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') return '';
  const then = timestamp instanceof Date ? timestamp.getTime() : Number(timestamp);
  if (isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);

  if (diffSec < 60) return 'الآن';

  const min = Math.floor(diffSec / 60);
  if (min < 60) {
    return `منذ ${agoPhrase(min, ['دقيقة', 'دقيقتين', 'دقائق'])}`;
  }

  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `منذ ${agoPhrase(hr, ['ساعة', 'ساعتين', 'ساعات'])}`;
  }

  const day = Math.floor(hr / 24);
  if (day < 30) {
    return `منذ ${agoPhrase(day, ['يوم', 'يومين', 'أيام'])}`;
  }

  const month = Math.floor(day / 30);
  if (month < 12) {
    return `منذ ${agoPhrase(month, ['شهر', 'شهرين', 'شهور'])}`;
  }

  const year = Math.floor(month / 12);
  return `منذ ${agoPhrase(year, ['سنة', 'سنتين', 'سنوات'])}`;
}

/**
 * تنسيق المبلغ بالجنيه المصري: 1,234.50 ج.م.
 * @param {number} amount
 * @returns {string}
 */
export function formatEGP(amount) {
  const num = Number(amount);
  if (!isFinite(num)) return '0 ج.م';
  const formatted = new Intl.NumberFormat(AR_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
  return `${formatted} ج.م`;
}

/* ==========================================================================
   3. التوقيت (Timing)
   ========================================================================== */

/**
 * تأخير تنفيذ دالة حتى مرور ms من آخر استدعاء.
 * @param {Function} fn
 * @param {number} [ms=300]
 * @returns {Function} نسخة مؤخَّرة
 */
export function debounce(fn, ms = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * تحديد معدّل تنفيذ دالة (لا تُنفَّذ أكثر من مرة كل ms).
 * @param {Function} fn
 * @param {number} [ms=300]
 * @returns {Function} نسخة محدودة
 */
export function throttle(fn, ms = 300) {
  let last = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      timer = null;
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/* ==========================================================================
   4. متفرقات (Misc)
   ========================================================================== */

/**
 * معرّف فريد — timestamp + عشوائي (base36).
 * كافٍ للاستخدام المحلي (لا يُستخدم كـ UUID آمن).
 * @returns {string}
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
