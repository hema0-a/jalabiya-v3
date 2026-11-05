/* ==========================================================================
   lead-time.js — مدة التنفيذ الفعلية لكل صنف (v3.8.2) — دوال نقية
   ==========================================================================
   يتعلّم من طلبات الورشة المنتهية: المدة من إنشاء الطلب حتى «جاهز» (readyAt)،
   لكل صنف (الطلبات ذات الصنف الواحد فقط حتى لا تتلوّث الأرقام بطلبات مختلطة).
   المخرجات: المتوسط والوسيط وp80 (مدة «آمنة» يلتزم بها 80% من الطلبات) ونسبة التأخر
   عن الموعد الذي وُعد به العميل.
   ========================================================================== */

import { normalizeSearch } from '../core/utils.js';

const DAY = 86400000;
export const MIN_SAMPLES = 3;
export const MAX_DAYS = 365;
export const LATE_WARN_RATE = 30;     /* % */
export const LATE_WARN_MIN = 2;       /* عدد طلبات متأخرة على الأقل */

const key = (s) => normalizeSearch(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();

/** أسماء أصناف الطلب (مفاتيح موحّدة، بلا تكرار). */
export function itemKeys(order) {
  const items = (order && Array.isArray(order.items)) ? order.items : [];
  return [...new Set(items.map((i) => key(i && i.name)).filter(Boolean))];
}

/** مدة التنفيذ بالأيام (صحيحة) أو null إن لم تُعرف/غير معقولة. */
export function orderLeadDays(o) {
  if (!o || (o.status !== 'ready' && o.status !== 'delivered')) return null;
  const start = Number(o.createdAt) || 0;
  const end = Number(o.readyAt) || 0;
  if (!start || !end || end < start) return null;
  const d = Math.round((end - start) / DAY);
  return d > MAX_DAYS ? null : d;
}

/** هل تأخر عن الموعد الموعود؟ null إن لم يكن هناك موعد. */
export function wasLate(o) {
  const due = Number(o && o.dueDate) || 0;
  const end = Number(o && o.readyAt) || 0;
  if (!due || !end) return null;
  return end > due + DAY - 1;      /* يُسمح حتى نهاية يوم الموعد */
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * @param {Array} orders
 * @returns {Map<string,{key:string,name:string,count:number,avgDays:number,medianDays:number,p80Days:number,lateCount:number,lateRate:number,reliable:boolean}>}
 */
export function learnLeadTimes(orders) {
  const acc = new Map();
  for (const o of orders || []) {
    const days = orderLeadDays(o);
    if (days === null) continue;
    const ks = itemKeys(o);
    if (ks.length !== 1) continue;                    /* صنف واحد فقط */
    const k = ks[0];
    if (!acc.has(k)) acc.set(k, { name: String(o.items.find((i) => key(i && i.name) === k).name).trim(), days: [], late: 0, judged: 0 });
    const a = acc.get(k);
    a.days.push(days);
    const l = wasLate(o);
    if (l !== null) { a.judged += 1; if (l) a.late += 1; }
  }
  const out = new Map();
  for (const [k, a] of acc) {
    const s = [...a.days].sort((x, y) => x - y);
    const sum = s.reduce((x, y) => x + y, 0);
    out.set(k, {
      key: k, name: a.name, count: s.length,
      avgDays: Math.round((sum / s.length) * 10) / 10,
      medianDays: percentile(s, 50), p80Days: percentile(s, 80),
      lateCount: a.late, lateRate: a.judged ? Math.round((a.late / a.judged) * 100) : 0,
      reliable: s.length >= MIN_SAMPLES,
    });
  }
  return out;
}

/** الأصناف المعروفة في الطلب الحالي (الموثوقة فقط)، بالترتيب الأطول مدة أولاً. */
export function statsForItems(learned, names) {
  const seen = new Set(); const res = [];
  for (const n of names || []) {
    const k = key(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const s = learned && learned.get(k);
    if (s && s.reliable) res.push(s);
  }
  return res.sort((a, b) => b.p80Days - a.p80Days);
}

/** مدة مقترحة للطلب الحالي = أطول p80 بين أصنافه المعروفة (الأصناف تُنفَّذ معاً)، أو null. */
export function suggestLeadDays(stats) {
  if (!stats || !stats.length) return null;
  return Math.max(...stats.map((s) => s.p80Days));
}

/** هل يستحق الصنف تحذير «يتأخر عادةً»؟ */
export function isChronicallyLate(s) {
  return !!s && s.lateCount >= LATE_WARN_MIN && s.lateRate >= LATE_WARN_RATE;
}
