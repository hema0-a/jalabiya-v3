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
 * تحويل الأرقام العربية-الهندية (٠-٩) والفارسية (۰-۹) إلى لاتينية.
 * لوحات المفاتيح العربية تُدخل هذه الأرقام فكانت تُرفض في الهاتف والرقم السري.
 * @param {*} value
 * @returns {string}
 */
export function toLatinDigits(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * التحقق من رقم هاتف مصري (01x + 8 أرقام).
 * يقبل: 010/011/012/015.
 * @param {*} phone
 * @returns {boolean}
 */
export function isEgyptPhone(phone) {
  const clean = toLatinDigits(phone).replace(/\D/g, '');
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
  return /^\d{4}$/.test(toLatinDigits(pin));
}

/**
 * تحويل رقم مصري محلي إلى صيغة دولية.
 * @param {*} phone
 * @returns {string} رقم بصيغة +20... أو السلسلة الأصلية
 */
export function normalizePhone(phone) {
  const clean = toLatinDigits(phone).replace(/\D/g, '');
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

/**
 * تاريخ محلي بصيغة YYYY-MM-DD لحقول <input type="date">.
 * toISOString() يعيد تاريخ UTC فيظهر «أمس» بين منتصف الليل وفجراً بتوقيت مصر؛ هنا نستخدم أجزاء التاريخ المحلية.
 * @param {number|Date} [value] — الافتراضي الآن
 * @returns {string}
 */
export function localDateInput(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * تحويل قيمة <input type="date"> (YYYY-MM-DD) إلى timestamp.
 * يُحفظ التاريخ عند الساعة 12:00 ظهراً بالتوقيت المحلي، فيبقى اليوم نفسه في أي منطقة زمنية
 * (كان يُحفظ كمنتصف ليل UTC فيظهر يوماً سابقاً لمن توقيته غرب UTC).
 * يتبادل مع localDateInput() بلا انزياح.
 * @param {string} str
 * @returns {number|null} null إن كانت القيمة فارغة أو غير صالحة
 */
export function parseDateInput(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toLatinDigits(str).trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, day = Number(m[3]);
  const d = new Date(y, mo, day, 12, 0, 0, 0);
  /* رفض التواريخ المتجاوزة (مثل 2026-13-45 أو 2026-02-31) بدل تحويلها بصمت لتاريخ آخر */
  if (isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d.getTime();
}
