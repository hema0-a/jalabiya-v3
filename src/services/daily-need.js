/* ==========================================================================
   daily-need.js — الاحتياج اليومي وخط الأمان الشهري (v3.11.0) — دوال نقية
   ==========================================================================
   منقولة من الإصدار الأقدم (core.js + feature-personal-overview/controls) بتحسينات:
   1) الحد الأدنى المطلوب يومياً من الورشة = (التزامات شهرية ÷ أيام الشغل) + (مصروف البيت آخر 30 يوماً ÷ 30).
      أيام الشغل تحترم الإجازات الأسبوعية والمحدّدة بتاريخ (day-off.js) بدل افتراض ثابت.
   2) خط الأمان: ما حُصّل هذا الشهر من الدفعات مقابل المطلوب شهرياً، ومقارنة بمكان اليوم من الشهر.
   3) الأرقام الثلاثة: باقي هذا الشهر · فائض/عجز اليوم · محصّل الشهر.
   4) أولوية الالتزام (ضروري / مهم / ممكن يتأجل) + اقتراح التأجيل + «وضع الشهر الصعب».
   لا قروض شخصية هنا: القروض في v3 بين أشخاص وليست جدول أقساط، فلا تدخل الحساب.
   كل الدوال لا تلمس DOM ولا قاعدة البيانات؛ معادل الالتزام الشهري يُمرَّر دالة (monthlyOf).
   ========================================================================== */

import { isDayOff } from '../core/day-off.js';

export const PRIORITIES = [
  { id: 'essential', icon: '🔴', label: 'ضروري' },
  { id: 'important', icon: '🟡', label: 'مهم' },
  { id: 'deferrable', icon: '⚖️', label: 'ممكن يتأجل' },
];
export const DEFAULT_PRIORITY = 'important';
const PRIORITY_IDS = PRIORITIES.map((p) => p.id);
export const DEFAULT_CAPACITY = 500;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };

/** أولوية صالحة (أي قيمة أخرى ← مهم، فلا يتغيّر سلوك الالتزامات القديمة). */
export function normalizePriority(v) {
  return PRIORITY_IDS.includes(v) ? v : DEFAULT_PRIORITY;
}

export function priorityMeta(v) {
  const id = normalizePriority(v);
  return PRIORITIES.find((p) => p.id === id);
}

/** إعدادات التحكم الشخصي: وضع الشهر الصعب فقط (يُفعَّل صراحةً). */
export function normalizePersonalControls(p) {
  return { hardMonth: !!(p && p.hardMonth === true) };
}

/**
 * وضع الشهر الصعب: يُبقي الالتزامات «الضرورية» فقط عند الإبلاغ (التنبيهات). لا يحذف شيئاً من القوائم.
 * مُعطَّل ⟵ نفس القائمة تماماً.
 */
export function filterForHardMonth(list, hardMonth) {
  const arr = Array.isArray(list) ? list : [];
  if (!hardMonth) return arr;
  return arr.filter((c) => c && normalizePriority(c.priority) === 'essential');
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** عدد أيام الشغل (غير الإجازة) في آخر `days` يوماً شاملاً اليوم؛ لا يقل عن 1 (لا قسمة على صفر). */
export function workDaysInLast(now, days, dayOff) {
  const total = Math.max(1, Math.round(n(days)) || 30);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let c = 0;
  for (let i = 0; i < total; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 12);
    if (!isDayOff(d.getTime(), dayOff)) c++;
  }
  return Math.max(1, c);
}

const activeOnly = (list) => (Array.isArray(list) ? list : []).filter((c) => c && c.active !== false);

/**
 * الحد الأدنى المطلوب يومياً.
 * @param {Object} a { commitments, houseExpenses (date بالميلي ثانية، amount), monthlyOf(c)=>number, dayOff, now }
 * @returns {{monthlyCommitments:number, wdays:number, commitmentsPerDay:number, houseTotal:number, housePerDay:number, total:number}}
 */
export function requiredDaily(a) {
  const now = a.now || new Date();
  const monthlyOf = typeof a.monthlyOf === 'function' ? a.monthlyOf : () => 0;
  const monthlyCommitments = activeOnly(a.commitments).reduce((s, c) => s + n(monthlyOf(c)), 0);
  const wdays = workDaysInLast(now, 30, a.dayOff);
  const commitmentsPerDay = monthlyCommitments / wdays;
  const since = startOfDay(now) - 29 * 86400000;
  const houseTotal = (Array.isArray(a.houseExpenses) ? a.houseExpenses : [])
    .reduce((s, e) => (e && n(e.date) >= since && n(e.date) < startOfDay(now) + 86400000 ? s + n(e.amount) : s), 0);
  const housePerDay = houseTotal / 30;
  return {
    monthlyCommitments: Math.round(monthlyCommitments), wdays,
    commitmentsPerDay: Math.round(commitmentsPerDay), houseTotal: Math.round(houseTotal),
    housePerDay: Math.round(housePerDay), total: Math.round(commitmentsPerDay + housePerDay),
  };
}

const sameMonth = (ts, now) => { const d = new Date(ts); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };

/**
 * تقدّم الشهر: المحصَّل من الدفعات (createdAt) مقابل المطلوب شهرياً (التزامات + مصروف بيت 30 يوماً).
 * @returns {{requiredMonthly:number, collectedMonth:number, pct:number, remaining:number}|null} null إن لا مطلوب
 */
export function monthProgress(a) {
  const now = a.now || new Date();
  const r = requiredDaily(a);
  const requiredMonthly = r.monthlyCommitments + r.housePerDay * 30;
  if (requiredMonthly <= 0) return null;
  const collectedMonth = (Array.isArray(a.payments) ? a.payments : [])
    .reduce((s, p) => (p && p.createdAt && sameMonth(p.createdAt, now) ? s + n(p.amount) : s), 0);
  const pct = Math.min(100, Math.round((collectedMonth / requiredMonthly) * 100));
  return {
    requiredMonthly: Math.round(requiredMonthly), collectedMonth: Math.round(collectedMonth),
    pct, remaining: Math.max(0, Math.round(requiredMonthly - collectedMonth)),
  };
}

/** مستوى الأمان: أين أنت من الشهر؟ (النسبة المتوقعة = يوم الشهر ÷ أيامه). */
export function safetyStatus(pct, now = new Date()) {
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayNum = now.getDate();
  const expectedPct = Math.min(100, Math.round((dayNum / totalDays) * 100));
  const p = n(pct);
  const level = p >= expectedPct ? 'safe' : (p >= expectedPct * 0.7 ? 'warn' : 'danger');
  return { level, expectedPct, dayNum, totalDays };
}

/** فائض/عجز اليوم: دفعات اليوم − الاحتياج اليومي. null إن لا احتياج. */
export function todaySurplus(a) {
  const now = a.now || new Date();
  const r = requiredDaily(a);
  if (r.total <= 0) return null;
  const t0 = startOfDay(now);
  const revenueToday = (Array.isArray(a.payments) ? a.payments : [])
    .reduce((s, p) => (p && n(p.createdAt) >= t0 && n(p.createdAt) < t0 + 86400000 ? s + n(p.amount) : s), 0);
  return { revenueToday: Math.round(revenueToday), required: r.total, surplus: Math.round(revenueToday - r.total) };
}

/**
 * اقتراح تأجيل: إن كانت طاقتك اليومية أقل من المطلوب وعندك التزامات «ممكن يتأجل».
 * @returns {{count:number, deferrableTotal:number, currentTotal:number, reducedTotal:number}|null}
 */
export function deferrableSuggestion(a) {
  const required = a.required || requiredDaily(a);
  if (required.total <= 0) return null;
  const capacity = n(a.capacity) > 0 ? n(a.capacity) : DEFAULT_CAPACITY;
  if (capacity >= required.total) return null;
  const monthlyOf = typeof a.monthlyOf === 'function' ? a.monthlyOf : () => 0;
  const list = activeOnly(a.commitments).filter((c) => normalizePriority(c.priority) === 'deferrable');
  if (!list.length) return null;
  const deferrableTotal = list.reduce((s, c) => s + n(monthlyOf(c)), 0);
  const reducedTotal = required.total - deferrableTotal / required.wdays;
  return {
    count: list.length, deferrableTotal: Math.round(deferrableTotal),
    currentTotal: required.total, reducedTotal: Math.max(0, Math.round(reducedTotal)),
  };
}

/**
 * خطة تحصيل اليوم (v3.14.0): أي طلبات جاهزة عليها متبقٍّ تحصّل منها لتغطية عجز اليوم؟
 * الأكبر متبقياً أولاً (أقل عدد من المكالمات)، مع تفضيل المتأخر عند التساوي، وبحد أقصى `max` طلبات.
 * @param {Array<{remaining:number, late?:boolean}>} items عناصر computePickups
 * @param {number} target العجز اليومي المطلوب تغطيته
 * @returns {{target:number, picks:Array, covered:number, gap:number, met:boolean}|null} null إن لا عجز
 */
export function collectionPlan(items, target, max = 5) {
  const t = Math.round(n(target));
  if (!(t > 0)) return null;
  const cand = (Array.isArray(items) ? items : []).filter((i) => i && n(i.remaining) > 0)
    .sort((a, b) => n(b.remaining) - n(a.remaining) || (b.late ? 1 : 0) - (a.late ? 1 : 0));
  const limit = Math.max(1, Math.round(n(max)) || 5);
  const picks = [];
  let covered = 0;
  for (const i of cand) {
    if (covered >= t || picks.length >= limit) break;
    picks.push(i);
    covered += n(i.remaining);
  }
  covered = Math.round(covered * 100) / 100;
  return { target: t, picks, covered, gap: Math.max(0, Math.round((t - covered) * 100) / 100), met: covered >= t };
}
