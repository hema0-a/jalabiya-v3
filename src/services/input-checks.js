/* ==========================================================================
   input-checks.js — المدقّق الذكي للمدخلات (v3.8.1) — دوال نقية
   ==========================================================================
   تنبيهات إرشادية فقط (لا تمنع الحفظ أبداً). كل دالة تُرجع null (لا ملاحظة) أو
   { level: 'danger' | 'warn' | 'info' | 'good', msg }.
   الأسعار: مقارنة بسعر الصنف المعتاد في الكتالوج متى عُرف، وإلا حدود عامة واسعة.
   ========================================================================== */

import { toLatinDigits, isEgyptPhone } from '../core/utils.js';
import { startOfDayPlus } from '../core/day-math.js';

const DAY = 86400000;
export const PRICE_INFO = 10000;
export const PRICE_WARN = 30000;
export const QTY_INFO = 50;
export const QTY_WARN = 200;
export const FAR_DAYS = 90;
export const REF_RATIO = 3;

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(toLatinDigits(String(v))));

/** رقم هاتف مصري. */
export function checkPhone(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const d = toLatinDigits(raw).replace(/\D/g, '');
  if (!d) return { level: 'danger', msg: 'الرقم يجب أن يحتوي أرقاماً' };
  if (isEgyptPhone(d)) return { level: 'good', msg: 'رقم صحيح' };
  if (/^1[0125]\d{8}$/.test(d)) return { level: 'info', msg: 'الرقم بلا الصفر الأول — سيُعامل كرقم مصري' };
  if (/^0[23]\d{7,8}$/.test(d)) return { level: 'info', msg: 'يبدو رقماً أرضياً — لن يصلح للواتساب' };
  if (!d.startsWith('01') && !d.startsWith('20') && !d.startsWith('1')) return { level: 'danger', msg: 'رقم الموبايل المصري يبدأ بـ 010 أو 011 أو 012 أو 015' };
  if (/^01/.test(d) && !/^01[0125]/.test(d)) return { level: 'danger', msg: 'رقم الموبايل المصري يبدأ بـ 010 أو 011 أو 012 أو 015' };
  if (d.length < 11) return { level: 'warn', msg: 'الرقم ناقص: المطلوب 11 رقماً (الحالي ' + d.length + ')' };
  return { level: 'warn', msg: 'الرقم زائد عن 11 رقماً (الحالي ' + d.length + ')' };
}

/** اسم عميل (الطول والشكل؛ التكرار له كاشفه المستقل). */
export function checkName(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return null;
  if (s.length < 2) return { level: 'warn', msg: 'الاسم قصير جداً' };
  if (/^[\d\s+\-().]+$/.test(toLatinDigits(s))) return { level: 'warn', msg: 'الاسم أرقام فقط — هل وضعت الهاتف هنا؟' };
  if (s.length > 50) return { level: 'info', msg: 'الاسم طويل — تأكد من صحته' };
  return null;
}

/**
 * سعر بند. reference = سعر الصنف المعتاد (اختياري) للمقارنة.
 * @param {*} value @param {{reference?:number}} [opts]
 */
export function checkPrice(value, opts) {
  const n = num(value);
  if (value === '' || value === null || value === undefined) return null;
  if (!isFinite(n)) return { level: 'danger', msg: 'يجب إدخال رقم' };
  if (n < 0) return { level: 'danger', msg: 'لا يمكن أن يكون السعر سالباً' };
  if (n === 0) return { level: 'info', msg: 'السعر صفر' };
  const ref = Number(opts && opts.reference);
  if (ref > 0) {
    if (n >= ref * REF_RATIO) return { level: 'warn', msg: 'أعلى بكثير من السعر المعتاد لهذا الصنف (' + ref + ') — تأكد من الأصفار' };
    if (n <= ref / REF_RATIO) return { level: 'warn', msg: 'أقل بكثير من السعر المعتاد لهذا الصنف (' + ref + ')' };
    return null;
  }
  if (n > PRICE_WARN) return { level: 'warn', msg: 'قيمة عالية جداً — تأكد من صحة الرقم' };
  if (n > PRICE_INFO) return { level: 'info', msg: 'قيمة عالية — تأكد من صحة الرقم' };
  return null;
}

/** كمية بند. */
export function checkQty(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = num(value);
  if (!isFinite(n)) return { level: 'danger', msg: 'يجب إدخال رقم' };
  if (n < 1) return { level: 'danger', msg: 'الكمية 1 على الأقل' };
  if (!Number.isInteger(n)) return { level: 'warn', msg: 'الكمية كسر — هل تقصد عدداً صحيحاً؟' };
  if (n > QTY_WARN) return { level: 'warn', msg: 'كمية ضخمة (' + n + ') — تأكد' };
  if (n > QTY_INFO) return { level: 'info', msg: 'كمية كبيرة (' + n + ') — تأكد' };
  return null;
}

/** موعد التسليم نسبةً لليوم. ts بالميلي ثانية. */
export function checkDueDate(ts, now) {
  const t = Number(ts);
  if (!t || !isFinite(t)) return null;
  const today = startOfDayPlus(now == null ? Date.now() : now, 0);
  const diff = Math.round((startOfDayPlus(t, 0) - today) / DAY);
  if (diff < 0) return { level: 'warn', msg: 'موعد التسليم في الماضي (قبل ' + Math.abs(diff) + ' يوم)' };
  if (diff > FAR_DAYS) return { level: 'info', msg: 'موعد التسليم بعد ' + diff + ' يوم — تأكد من السنة' };
  return null;
}

/** مقدّم/مدفوع أكبر من الإجمالي. */
export function checkDeposit(deposit, total) {
  const d = num(deposit); const t = Number(total);
  if (!isFinite(d) || d === 0) return null;
  if (d < 0) return { level: 'danger', msg: 'المقدم لا يكون سالباً' };
  if (t > 0 && d > t) return { level: 'warn', msg: 'المقدم أكبر من إجمالي الطلب' };
  return null;
}
