/* ==========================================================================
   family-budget.js — ميزانية الأسرة: سقف شهري لكل فئة من مصروف البيت (v3.15.0) — دوال نقية
   ==========================================================================
   تضع سقفاً شهرياً لفئات مصروف البيت (وإجمالياً اختيارياً)، فيُعرض ما أُنفق هذا الشهر مقابل كل سقف وما تبقّى
   والتوقّع بمعدل إنفاقك الحالي، وتنبيه عند الاقتراب (80%) أو التجاوز (100%).
   مستوى: ok (<80%) · warn (≥80%) · over (≥100%). التوقّع لا يُحسب قبل اليوم الخامس (ضجيج الأيام الأولى).
   لا DOM ولا قاعدة بيانات؛ الفئات المجهولة تُحتسب «خارج السقوف».
   ========================================================================== */

export const WARN_PCT = 80;
export const MIN_PROJECTION_DAY = 5;
export const MAX_CAPS = 30;
const MAX_AMOUNT = 100000000;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r0 = (v) => Math.round(n(v));

/** ميزانية صالحة: { total:number (0=بلا إجمالي), caps:{[categoryId]:amount>0} }. */
export function normalizeBudget(x) {
  const caps = {};
  const src = x && typeof x === 'object' && x.caps && typeof x.caps === 'object' ? x.caps : {};
  let count = 0;
  for (const [k, v] of Object.entries(src)) {
    const id = typeof k === 'string' ? k.trim().slice(0, 40) : '';
    const amt = Math.round(n(v) * 100) / 100;
    if (!id || !(amt > 0) || amt > MAX_AMOUNT || count >= MAX_CAPS) continue;
    caps[id] = amt; count++;
  }
  const total = Math.round(n(x && x.total) * 100) / 100;
  return { total: total > 0 && total <= MAX_AMOUNT ? total : 0, caps };
}

export const hasBudget = (b) => { const nb = normalizeBudget(b); return nb.total > 0 || Object.keys(nb.caps).length > 0; };

const levelOf = (pct) => (pct >= 100 ? 'over' : (pct >= WARN_PCT ? 'warn' : 'ok'));
const sameMonth = (ts, now) => { const d = new Date(n(ts)); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };

/**
 * حالة الميزانية للشهر الحالي.
 * @param {{expenses:Array, budget:Object, now?:Date, cats?:Array<{id,label,icon}>}} a
 * @returns {{has:boolean, rows:Array, total:Object|null, unbudgeted:number}}
 */
export function budgetStatus(a) {
  const now = a.now || new Date();
  const budget = normalizeBudget(a.budget);
  const meta = new Map((Array.isArray(a.cats) ? a.cats : []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const spentBy = new Map();
  let spentAll = 0;
  for (const e of Array.isArray(a.expenses) ? a.expenses : []) {
    if (!e || !e.date || !sameMonth(e.date, now) || !(n(e.amount) > 0)) continue;
    const id = e.category || 'other';
    spentBy.set(id, (spentBy.get(id) || 0) + n(e.amount));
    spentAll += n(e.amount);
  }
  const dayNum = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const project = (spent) => (dayNum >= MIN_PROJECTION_DAY ? r0((spent / dayNum) * daysInMonth) : null);

  const rows = Object.entries(budget.caps).map(([id, cap]) => {
    const m = meta.get(id) || { label: id, icon: '📌' };
    const spent = r0(spentBy.get(id) || 0);
    const pct = Math.round((spent / cap) * 100);
    return { id, label: m.label, icon: m.icon, cap, spent, remaining: r0(cap - spent), pct, level: levelOf(pct), projected: project(spent) };
  }).sort((x, y) => y.pct - x.pct || String(x.label).localeCompare(String(y.label), 'ar'));

  const sumCaps = Object.values(budget.caps).reduce((s, v) => s + v, 0);
  const totalCap = budget.total > 0 ? budget.total : sumCaps;
  let total = null;
  if (totalCap > 0) {
    const spent = r0(spentAll);
    const pct = Math.round((spent / totalCap) * 100);
    total = { cap: totalCap, spent, remaining: r0(totalCap - spent), pct, level: levelOf(pct), projected: project(spentAll), explicit: budget.total > 0 };
  }
  const unbudgeted = r0([...spentBy].reduce((s, [id, v]) => (budget.caps[id] ? s : s + v), 0));
  return { has: rows.length > 0 || total !== null, rows, total, unbudgeted };
}

/** تنبيهات الميزانية: الفئات الواصلة 80% فصاعداً (والإجمالي إن تجاوز) — الأخطر أولاً. */
export function budgetAlerts(status) {
  const out = [];
  if (!status || !status.has) return out;
  for (const r of status.rows) if (r.level !== 'ok') out.push({ id: r.id, label: r.label, level: r.level, pct: r.pct, spent: r.spent, cap: r.cap });
  if (status.total && status.total.explicit && status.total.level !== 'ok') out.push({ id: '_total', label: 'إجمالي الميزانية', level: status.total.level, pct: status.total.pct, spent: status.total.spent, cap: status.total.cap });
  return out.sort((a, b) => (b.level === 'over') - (a.level === 'over') || b.pct - a.pct);
}
