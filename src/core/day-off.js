/* ==========================================================================
   day-off.js — أيام إجازة الورشة: أسبوعية (أكثر من يوم) + بتاريخ محدد (v3.5.34)
   ==========================================================================
   كانت الإجازة رقماً واحداً (dayOffWeekday). الآن «مواصفة إجازة» = { weekdays:[0..6], dates:['YYYY-MM-DD'] }.
   كل الدوال تقبل الرقم القديم أيضاً (توافق كامل مع الاستدعاءات والاختبارات السابقة):
     - رقم 0..6 ← يوم أسبوعي واحد؛  null/undefined ← الأحد (0) كما كان؛  غير ذلك ← لا إجازة.
   حماية: لو اختيرت الأيام السبعة كلها تُتجاهل الأسبوعية (حتى لا تدور الحلقات بلا نهاية).
   ========================================================================== */

import { weekdayOf, dayKey } from './day-math.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_HOLIDAYS = 120;
const NORMALIZED = new WeakSet();

function seal(weekdays, dates) {
  const spec = Object.freeze({ weekdays: Object.freeze(weekdays), dates: Object.freeze(dates) });
  NORMALIZED.add(spec);
  return spec;
}

/** تاريخ إجازة صالح؟ (YYYY-MM-DD حقيقي في التقويم) */
export function isValidDateKey(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** @returns {{weekdays:number[], dates:string[]}} مواصفة مُنقّاة (مجمّدة) من رقم قديم أو كائن */
export function dayOffOf(v) {
  if (v && typeof v === 'object' && NORMALIZED.has(v)) return v;
  if (v && typeof v === 'object' && Array.isArray(v.weekdays)) {
    const wd = Array.from(new Set(v.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b);
    const raw = Array.isArray(v.dates) ? v.dates : [];
    const dates = Array.from(new Set(raw.map((x) => (x && typeof x === 'object' ? x.date : x)).filter(isValidDateKey))).sort();
    return seal(wd.length >= 7 ? [] : wd, dates.slice(0, MAX_HOLIDAYS));
  }
  if (v === null || v === undefined) return seal([0], []);
  const n = Number(v);
  return seal(Number.isInteger(n) && n >= 0 && n <= 6 ? [n] : [], []);
}

/** هل اليوم (طابع/تاريخ) إجازة؟ */
export function isDayOff(ts, v) {
  const spec = dayOffOf(v);
  if (spec.weekdays.length === 0 && spec.dates.length === 0) return false;
  return spec.weekdays.includes(weekdayOf(ts)) || spec.dates.includes(dayKey(ts));
}

/** سبب الإجازة: 'weekly' | 'date' | '' */
export function dayOffReason(ts, v) {
  const spec = dayOffOf(v);
  if (spec.weekdays.includes(weekdayOf(ts))) return 'weekly';
  if (spec.dates.includes(dayKey(ts))) return 'date';
  return '';
}

/**
 * مواصفة الإجازة من إعدادات dailyLimit:
 * dayOffWeekdays (مصفوفة، قد تكون فارغة = بلا إجازة أسبوعية) تتقدّم على dayOffWeekday القديم؛
 * holidays = تواريخ نصية أو كائنات {date, name}.
 */
export function resolveDayOffSettings(dl) {
  const d = dl || {};
  const weekdays = Array.isArray(d.dayOffWeekdays) ? d.dayOffWeekdays : (d.dayOffWeekday === undefined || d.dayOffWeekday === null ? [0] : [d.dayOffWeekday]);
  return dayOffOf({ weekdays, dates: d.holidays });
}

/** عناصر holidays مُنقّاة بالأسماء: [{date, name}] مرتبة بالتاريخ بلا تكرار. */
export function normalizeHolidays(list) {
  const seen = new Map();
  for (const x of Array.isArray(list) ? list : []) {
    const date = x && typeof x === 'object' ? x.date : x;
    if (!isValidDateKey(date) || seen.has(date)) continue;
    const name = x && typeof x === 'object' && typeof x.name === 'string' ? x.name.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    seen.set(date, { date, name });
  }
  return Array.from(seen.values()).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, MAX_HOLIDAYS);
}

/** تواريخ نطاق من..إلى (شاملة) كنصوص؛ أقصى 31 يوماً؛ [] إن كان غير صالح. */
export function expandDateRange(fromKey, toKey) {
  if (!isValidDateKey(fromKey)) return [];
  const end = isValidDateKey(toKey) ? toKey : fromKey;
  if (end < fromKey) return [];
  const [y, m, d] = fromKey.split('-').map(Number);
  const out = [];
  for (let i = 0; i < 31; i++) {
    const k = dayKey(new Date(y, m - 1, d + i, 12));
    if (k > end) break;
    out.push(k);
  }
  return out;
}
