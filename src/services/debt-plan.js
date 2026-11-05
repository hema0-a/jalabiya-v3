/* ==========================================================================
   debt-plan.js — الالتزامات محددة المدة: عدّاد التحرر + استراتيجية السداد (v3.9.0)
   ==========================================================================
   الالتزام محدد المدة = له حقل اختياري endMonth ('YYYY-MM' = شهر آخر قسط). المتبقي يُحسب
   من الشهر الحالي فيتناقص وحده دون صيانة يدوية.
   - عدّاد التحرر: كم شهراً حتى انتهاء آخر قسط، وجدول «ماذا يخفّ عنك ومتى».
   - الاستراتيجيتان: كرة الثلج (الأصغر إجمالياً أولاً) · الانهيار الجليدي (الأعلى قسطاً شهرياً أولاً).
     (لا فوائد مسجّلة في التطبيق؛ لذلك يُقاس الفرق بالزمن لا بالفائدة.)
   - المحاكاة: ماذا لو دفعت مبلغاً إضافياً شهرياً ووجّهت الأقساط المنتهية للهدف التالي؟
   ========================================================================== */

import { getMonthlyEquivalent } from './commitments-calculator.js';

export const MAX_REMAINING = 600;
export const STRATEGIES = ['snowball', 'avalanche'];

const idxOf = (d) => d.getFullYear() * 12 + d.getMonth();
const monthText = (idx) => { const y = Math.floor(idx / 12); const m = (idx % 12) + 1; return y + '-' + String(m).padStart(2, '0'); };

/** 'YYYY-MM' ⟵ فهرس شهري، أو null. */
export function parseMonth(s) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(s || ''));
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : null;
}

/** شهر آخر قسط من عدد الأقساط المتبقية (1 = هذا الشهر). null إن لم يصلح. */
export function endMonthFromRemaining(remaining, now = new Date()) {
  const n = Math.floor(Number(remaining));
  if (!isFinite(n) || n < 1 || n > MAX_REMAINING) return null;
  return monthText(idxOf(now) + n - 1);
}

/** الأقساط المتبقية شاملة هذا الشهر، 0 إن انتهى، null إن لا مدة. */
export function remainingMonths(c, now = new Date()) {
  const e = parseMonth(c && c.endMonth);
  if (e === null) return null;
  return Math.max(0, Math.min(MAX_REMAINING, e - idxOf(now) + 1));
}

const monthlyOf = (c) => Math.max(0, Number(getMonthlyEquivalent(c)) || 0);

/** الالتزامات النشطة ذات المدة ولم تنتهِ، مع حساباتها. */
export function termedCommitments(list, now = new Date()) {
  const out = [];
  for (const c of list || []) {
    if (!c || c.active === false) continue;
    const rem = remainingMonths(c, now);
    const monthly = monthlyOf(c);
    if (rem === null || rem <= 0 || monthly <= 0) continue;
    out.push({ id: c.id, name: c.name || 'التزام', monthly, remaining: rem, total: Math.round(monthly * rem * 100) / 100, endMonth: c.endMonth });
  }
  return out;
}

/** ترتيب الأولوية حسب الاستراتيجية (لا يغيّر المصفوفة الأصلية). */
export function payoffOrder(termed, strategy) {
  const arr = [...(termed || [])];
  if (strategy === 'avalanche') arr.sort((a, b) => b.monthly - a.monthly || a.total - b.total);
  else arr.sort((a, b) => a.total - b.total || b.monthly - a.monthly);
  return arr.map((x, i) => ({ ...x, rank: i + 1 }));
}

/** عدّاد التحرر + جدول التخفيف. */
export function freedomPlan(termed, now = new Date()) {
  const list = termed || [];
  if (!list.length) return { monthsToFree: 0, freeMonth: null, totalRemaining: 0, monthlyNow: 0, timeline: [] };
  const monthsToFree = Math.max(...list.map((x) => x.remaining));
  const base = idxOf(now);
  const monthlyNow = list.reduce((s, x) => s + x.monthly, 0);
  const ends = [...new Set(list.map((x) => x.remaining))].sort((a, b) => a - b);
  let left = monthlyNow;
  const timeline = ends.map((r) => {
    const freed = list.filter((x) => x.remaining === r);
    const amount = freed.reduce((s, x) => s + x.monthly, 0);
    left -= amount;
    return { monthsFromNow: r, month: monthText(base + r), names: freed.map((x) => x.name), freed: Math.round(amount * 100) / 100, monthlyAfter: Math.max(0, Math.round(left * 100) / 100) };
  });
  return {
    monthsToFree, freeMonth: monthText(base + monthsToFree), timeline,
    totalRemaining: Math.round(list.reduce((s, x) => s + x.total, 0) * 100) / 100,
    monthlyNow: Math.round(monthlyNow * 100) / 100,
  };
}

/**
 * محاكاة: كم شهراً حتى التحرر لو دفعت extra إضافياً شهرياً ووجّهت الأقساط المنتهية (وكل الفائض)
 * إلى الهدف التالي بترتيب الاستراتيجية؟  بدون فوائد: المبلغ الكلي ثابت والفرق في الزمن.
 * @returns {{months:number, baselineMonths:number, savedMonths:number, extra:number}}
 */
export function simulatePayoff(termed, strategy, extra = 0) {
  const ord = payoffOrder(termed, strategy);
  const ex = Math.max(0, Number(extra) || 0);
  const baselineMonths = ord.length ? Math.max(...ord.map((x) => x.remaining)) : 0;
  if (!ord.length) return { months: 0, baselineMonths: 0, savedMonths: 0, extra: ex };
  const bal = ord.map((x) => x.total);
  const pay = ord.map((x) => x.monthly);
  let pool = 0;     /* ما تحرّر من أقساط منتهية + الإضافي */
  let months = 0;
  while (bal.some((b) => b > 0.005) && months < MAX_REMAINING * 2) {
    months += 1;
    let spare = ex + pool;
    for (let i = 0; i < bal.length; i += 1) {
      if (bal[i] <= 0.005) continue;
      const p = Math.min(bal[i], pay[i]);
      bal[i] -= p;
      spare += pay[i] - p;          /* قسط أخير أصغر يترك فائضاً */
    }
    for (let i = 0; i < bal.length && spare > 0.005; i += 1) {   /* الفائض للهدف الأعلى أولوية */
      if (bal[i] <= 0.005) continue;
      const p = Math.min(bal[i], spare);
      bal[i] -= p; spare -= p;
    }
    pool = ord.reduce((s, x, i) => s + (bal[i] <= 0.005 ? x.monthly : 0), 0);
  }
  return { months, baselineMonths, savedMonths: Math.max(0, baselineMonths - months), extra: ex };
}
