/* ==========================================================================
   sanitize.js — خط الدفاع الأول ضد XSS
   ==========================================================================
   كل إدراج نص أو سمة في DOM يمر عبر هذه الدوال.
   لا تستخدم innerHTML بدون escapeHtml.
   ========================================================================== */

/* --- خرائط التهريب (Maps) — للاستخدام مع String.replace --- */
const HTML_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ATTR_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '=': '&#61;',
};

/* --- أنماط البحث (Patterns) — معرّفة مسبقاً للأداء --- */
const HTML_RE = /[&<>"']/g;
const ATTR_RE = /[&<>"'`=]/g;
const CONTROL_RE = /[\s\u0000-\u001F]/g;

/**
 * تهريب النص قبل الإدراج في HTML.
 * يحوّل الرموز الخطيرة إلى كيانات HTML.
 * يتعامل بأمان مع null / undefined / number.
 * @param {*} value - القيمة (تُحوَّل إلى نص تلقائياً)
 * @returns {string} نص مُهرَّب آمن للإدراج
 * @example
 *   escapeHtml('<script>')      // '&lt;script&gt;'
 *   escapeHtml('"hello"')       // '&quot;hello&quot;'
 *   escapeHtml("O'Brien")       // 'O&#39;Brien'
 *   escapeHtml(null)            // ''
 *   escapeHtml(123)             // '123'
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(HTML_RE, (ch) => HTML_MAP[ch]);
}

/**
 * تهريب أقوى — للاستخدام داخل سمات HTML (attributes).
 * يهرب إضافةً إلى الرموز الأساسية: ` و =
 * @param {*} value
 * @returns {string}
 * @example
 *   escapeAttr('a`b')           // 'a&#96;b'
 *   escapeAttr('a=b')           // 'a&#61;b'
 */
export function escapeAttr(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(ATTR_RE, (ch) => ATTR_MAP[ch]);
}

/**
 * تنقية الروابط (href / src).
 * يرفض المخططات الخطيرة: javascript:, vbscript:, data: (إلا صور bitmap آمنة).
 * يحمي من تجاوزات بمسافات أو محارف تحكم.
 * 🔴 يرفض data:image/svg صراحةً — SVG يمكنه تنفيذ سكربتات عند فتحه كـ document.
 * @param {*} url
 * @returns {string} الرابط الأصلي إن كان آمناً، أو '' إن كان خطيراً
 * @example
 *   sanitizeUrl('https://example.com')          // 'https://example.com'
 *   sanitizeUrl('javascript:alert(1)')          // ''
 *   sanitizeUrl('JavaScript:alert(1)')          // ''
 *   sanitizeUrl('java\nscript:alert(1)')        // ''
 *   sanitizeUrl('data:text/html,<script>')      // ''
 *   sanitizeUrl('data:image/svg+xml,...')       // ''  ← 🔴 محجوب
 *   sanitizeUrl('data:image/png;base64,...')    // مسموح
 *   sanitizeUrl(null)                           // ''
 */
export function sanitizeUrl(url) {
  if (url === null || url === undefined) return '';
  const str = String(url).trim();
  if (str === '') return '';

  // إزالة كل المسافات ومحارف التحكم (لمنع تجاوزات مثل "java\nscript:")
  const normalized = str.replace(CONTROL_RE, '').toLowerCase();

  // رفض المخططات الخطيرة
  if (normalized.startsWith('javascript:')) return '';
  if (normalized.startsWith('vbscript:')) return '';

  // معالجة data: URIs
  if (normalized.startsWith('data:')) {
    // 🔴 رفض SVG صراحةً — يمكنه تنفيذ سكربتات عند فتحه كـ document
    if (normalized.startsWith('data:image/svg')) return '';
    // السماح فقط بصور bitmap آمنة
    if (!normalized.startsWith('data:image/')) return '';
  }

  return str;
}
