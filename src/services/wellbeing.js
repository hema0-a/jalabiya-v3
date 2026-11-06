/* ==========================================================================
   wellbeing.js — الرفاهية المالية (v3.9.1) — دوال نقية
   ==========================================================================
   1) تحدي الشهر: خفّض مصروف البيت X% عن الشهر الماضي — مع سرعة السير والمسموح يومياً.
   2) كشف الالتزام المستتر: مصروف بيت يتكرر بنفس الوصف ومبلغ متقارب في 3 شهور فأكثر
      ولا يوجد التزام بنفس الاسم ⟵ يُقترح تحويله لالتزام ثابت.
   3) الميزانية الصامتة: لون خلفية هادئ (آمن/تنبيه/خطر) من سرعة سداد الالتزامات مقابل أيام الشهر.
   ========================================================================== */

import { normalizeSearch } from '../core/utils.js';

export const DEFAULT_CHALLENGE_PCT = 5;
export const MIN_CHALLENGE_PCT = 1;
export const MAX_CHALLENGE_PCT = 50;
export const HIDDEN_MIN_MONTHS = 3;
export const HIDDEN_TOLERANCE = 0.2;
export const HIDDEN_LOOKBACK_MONTHS = 6;
export const MAX_DISMISSED = 100;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r0 = (v) => Math.round(v);
const monthIdx = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
const daysIn = (now) => new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

export function normalizeChallengePct(v) {
  const x = Math.round(n(v));
  if (!x) return DEFAULT_CHALLENGE_PCT;
  return Math.min(MAX_CHALLENGE_PCT, Math.max(MIN_CHALLENGE_PCT, x));
}

export function normalizeWellbeing(w) {
  const src = w || {};
  const dis = Array.isArray(src.dismissedHidden) ? src.dismissedHidden.filter((x) => typeof x === 'string' && x) : [];
  return { challengePct: normalizeChallengePct(src.challengePct), dismissedHidden: [...new Set(dis)].slice(-MAX_DISMISSED) };
}

const totalOf = (list, idx) => list.reduce((s, e) => (e && e.date && monthIdx(e.date) === idx ? s + n(e.amount) : s), 0);

/**
 * @param {Array} expenses مصاريف البيت (date بالميلي ثانية، amount)
 * @returns {{hasBaseline:boolean, prevTotal:number, curTotal:number, target:number, achieved:boolean, onPace:boolean,
 *            projected:number, remaining:number, dailyAllowance:number, dayNum:number, totalDays:number, pct:number, over:boolean}}
 */
export function challengeState(expenses, pct, now = new Date()) {
  const p = normalizeChallengePct(pct);
  const list = Array.isArray(expenses) ? expenses : [];
  const cur = now.getFullYear() * 12 + now.getMonth();
  const prevTotal = totalOf(list, cur - 1);
  const curTotal = totalOf(list, cur);
  const dayNum = now.getDate();
  const totalDays = daysIn(now);
  const target = prevTotal * (1 - p / 100);
  const hasBaseline = prevTotal > 0;
  const paceLimit = hasBaseline ? target * (dayNum / totalDays) : null;
  const daysLeft = Math.max(0, totalDays - dayNum);
  const remaining = Math.max(0, target - curTotal);
  return {
    hasBaseline, prevTotal: r0(prevTotal), curTotal: r0(curTotal), target: r0(target),
    achieved: hasBaseline && curTotal <= target,
    over: hasBaseline && curTotal > target,
    onPace: !hasBaseline || curTotal <= paceLimit,
    projected: r0(dayNum > 0 ? (curTotal / dayNum) * totalDays : curTotal),
    remaining: r0(remaining),
    dailyAllowance: daysLeft > 0 ? r0(remaining / daysLeft) : 0,
    dayNum, totalDays,
    pct: hasBaseline && target > 0 ? Math.min(100, r0((curTotal / target) * 100)) : 0,
  };
}

/** مفتاح موحّد لوصف المصروف/اسم الالتزام. */
export function descKey(s) {
  return normalizeSearch(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();
}

/**
 * التزامات مستترة: نفس الوصف في ≥3 أشهر مختلفة ضمن آخر 6 أشهر ومبالغها ضمن ±20% من المتوسط.
 * @param {Array} expenses {note,amount,date,category}
 * @param {Array} commitmentsList  لاستبعاد ما صار التزاماً فعلاً
 * @param {string[]} dismissed
 * @returns {Array<{key:string,desc:string,avgAmount:number,months:number,category:string}>}
 */
export function detectHiddenCommitments(expenses, commitmentsList, dismissed, now = new Date()) {
  const cur = now.getFullYear() * 12 + now.getMonth();
  const skip = new Set([...(dismissed || []), ...(commitmentsList || []).map((c) => descKey(c && c.name))]);
  const groups = new Map();
  for (const e of expenses || []) {
    if (!e || !e.date) continue;
    const idx = monthIdx(e.date);
    if (idx > cur || idx <= cur - HIDDEN_LOOKBACK_MONTHS) continue;
    const key = descKey(e.note);
    if (!key || key.length < 2 || skip.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = [];
  for (const [key, items] of groups) {
    const months = new Set(items.map((e) => monthIdx(e.date)));
    if (months.size < HIDDEN_MIN_MONTHS) continue;
    const amounts = items.map((e) => n(e.amount)).filter((a) => a > 0);
    if (amounts.length < HIDDEN_MIN_MONTHS) continue;
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (!amounts.every((a) => Math.abs(a - avg) <= avg * HIDDEN_TOLERANCE)) continue;
    const latest = [...items].sort((a, b) => b.date - a.date)[0];
    out.push({ key, desc: String(latest.note).trim(), avgAmount: r0(avg), months: months.size, category: latest.category || 'other' });
  }
  return out.sort((a, b) => b.avgAmount - a.avgAmount);
}

/**
 * الميزانية الصامتة: مستوى السرعة. paidPct = المدفوع من المتوقع %، مقابل نسبة أيام الشهر المنقضية.
 * @returns {'safe'|'warn'|'danger'|null}
 */
export function moodLevel(paidPct, now = new Date(), hasExpected = true) {
  if (!hasExpected) return null;
  const expected = Math.min(100, (now.getDate() / daysIn(now)) * 100);
  const p = n(paidPct);
  if (p >= expected) return 'safe';
  if (p >= expected * 0.7) return 'warn';
  return 'danger';
}
