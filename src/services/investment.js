/* ==========================================================================
   investment.js — خطة الاستثمار وصافي الثروة (v3.9.2) — دوال نقية
   ==========================================================================
   جيوب (مثل: طوارئ، ذهب، شهادات) لكل منها نسبة مستهدفة من الفائض الشهري ورصيد وسجل نمو.
   - توزيع الفائض على الجيوب بنسبها (تُطبَّع إن لم يكن المجموع 100%).
   - السحب = تنفيذ فعلي بتاريخ وسبب (لا يتجاوز الرصيد).
   - صافي الثروة = الجيوب + أهداف الادخار + قيمة المخزون − المتبقي من الأقساط.
   كل الدوال تُرجع كائنات جديدة (لا تعدّل المُدخل).
   ========================================================================== */

export const MAX_POCKETS = 12;
export const MAX_NAME = 30;
export const MAX_REASON = 60;
export const MAX_HISTORY = 24;
export const MAX_WITHDRAWALS = 200;
export const MAX_DISTRIBUTIONS = 24;
export const COLORS = ['#B8863B', '#1F6D57', '#5A7EBB', '#B65A6C', '#8A6FBF', '#4C9A8E', '#C48A3A'];

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const clampPct = (v) => Math.min(100, Math.max(0, r2(n(v))));
const ym = (d) => { const x = d instanceof Date ? d : new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
export const monthOf = ym;

export const newPocketId = () => 'pk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function normHistory(h) {
  const list = Array.isArray(h) ? h : [];
  const map = new Map();
  list.forEach((e) => { if (e && /^\d{4}-\d{2}$/.test(e.ym) && isFinite(Number(e.balance))) map.set(e.ym, r2(Number(e.balance))); });
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-MAX_HISTORY).map(([k, v]) => ({ ym: k, balance: v }));
}

export function normalizePocket(p, index = 0) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name == null ? '' : p.name).trim().slice(0, MAX_NAME);
  if (!name) return null;
  return {
    id: String(p.id || newPocketId()), name,
    targetPct: clampPct(p.targetPct), balance: Math.max(0, r2(n(p.balance))),
    color: typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : COLORS[index % COLORS.length],
    history: normHistory(p.history),
  };
}

export function normalizeInvestment(inv) {
  const src = inv || {};
  const seen = new Set(); const pockets = [];
  (Array.isArray(src.pockets) ? src.pockets : []).forEach((p) => {
    const q = normalizePocket(p, pockets.length);
    if (q && !seen.has(q.id) && pockets.length < MAX_POCKETS) { seen.add(q.id); pockets.push(q); }
  });
  const withdrawals = (Array.isArray(src.withdrawals) ? src.withdrawals : [])
    .filter((w) => w && w.pocketId && n(w.amount) > 0 && n(w.date) > 0)
    .map((w) => ({ id: String(w.id || ''), pocketId: String(w.pocketId), pocketName: String(w.pocketName || '').slice(0, MAX_NAME), amount: r2(n(w.amount)), date: n(w.date), reason: String(w.reason || '').slice(0, MAX_REASON) }))
    .slice(-MAX_WITHDRAWALS);
  const distributions = (Array.isArray(src.distributions) ? src.distributions : [])
    .filter((d) => d && /^\d{4}-\d{2}$/.test(d.ym) && n(d.amount) > 0).map((d) => ({ ym: d.ym, amount: r2(n(d.amount)) })).slice(-MAX_DISTRIBUTIONS);
  return { pockets, withdrawals, distributions, netWorthHistory: normHistory((Array.isArray(src.netWorthHistory) ? src.netWorthHistory : []).map((e) => ({ ym: e && e.ym, balance: e && e.value }))).map((e) => ({ ym: e.ym, value: e.balance })) };
}

export const totalPct = (pockets) => r2((pockets || []).reduce((s, p) => s + n(p.targetPct), 0));
export const totalBalance = (pockets) => r2((pockets || []).reduce((s, p) => s + n(p.balance), 0));

/** الفائض المقترح = الدخل − مصروف الورشة − الالتزامات − مصروف البيت (لا يقل عن صفر). */
export function suggestedSurplus(b) {
  const x = b || {};
  return Math.max(0, Math.round(n(x.income) - n(x.workshopExpenses) - n(x.commitments) - n(x.house)));
}

/**
 * توزيع مبلغ على الجيوب بنسبها. إن مجموع النسب ≠ 100 يُطبَّع (مثلاً 40+40 ⟵ 50/50).
 * الجيوب بنسبة 0 لا تأخذ شيئاً. مجموع التوزيع = المبلغ تماماً (الباقي يذهب لأكبر نسبة).
 * @returns {Array<{id:string,name:string,amount:number}>}
 */
export function distributeSurplus(pockets, amount) {
  const amt = Math.max(0, Math.round(n(amount) * 100) / 100);
  const list = (pockets || []).filter((p) => n(p.targetPct) > 0);
  const sum = list.reduce((s, p) => s + n(p.targetPct), 0);
  if (!amt || !sum) return [];
  const out = list.map((p) => ({ id: p.id, name: p.name, amount: r2((amt * n(p.targetPct)) / sum), _w: n(p.targetPct) }));
  const diff = r2(amt - out.reduce((s, x) => s + x.amount, 0));
  if (diff) { const big = out.reduce((a, b) => (b._w > a._w ? b : a)); big.amount = r2(big.amount + diff); }
  return out.map(({ id, name, amount: a }) => ({ id, name, amount: a })).filter((x) => x.amount > 0);
}

const upsertHist = (hist, key, bal) => normHistory([...(hist || []).filter((e) => e.ym !== key), { ym: key, balance: bal }]);

/** تطبيق توزيع: يزيد الأرصدة ويسجّل نقطة نمو ويحفظ التوزيع الشهري. */
export function applyDistribution(inv, allocations, when = new Date()) {
  const cur = normalizeInvestment(inv);
  const key = ym(when);
  const byId = new Map((allocations || []).map((a) => [a.id, Math.max(0, n(a.amount))]));
  const pockets = cur.pockets.map((p) => {
    const add = byId.get(p.id) || 0;
    if (!add) return p;
    const balance = r2(p.balance + add);
    return { ...p, balance, history: upsertHist(p.history, key, balance) };
  });
  const total = r2([...byId.values()].reduce((s, v) => s + v, 0));
  const dists = total > 0 ? [...cur.distributions.filter((d) => d.ym !== key), { ym: key, amount: r2(total + (cur.distributions.find((d) => d.ym === key) || { amount: 0 }).amount) }] : cur.distributions;
  return { ...cur, pockets, distributions: dists.slice(-MAX_DISTRIBUTIONS) };
}

/** سحب فعلي. @returns {{ok:boolean,error?:string,inv:object}} */
export function withdraw(inv, pocketId, amount, reason, when = new Date()) {
  const cur = normalizeInvestment(inv);
  const p = cur.pockets.find((x) => x.id === pocketId);
  const amt = r2(n(amount));
  if (!p) return { ok: false, error: 'الجيب غير موجود', inv: cur };
  if (amt <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً', inv: cur };
  if (amt > p.balance) return { ok: false, error: 'المبلغ أكبر من رصيد الجيب (' + p.balance + ')', inv: cur };
  const key = ym(when);
  const balance = r2(p.balance - amt);
  const pockets = cur.pockets.map((x) => (x.id === pocketId ? { ...x, balance, history: upsertHist(x.history, key, balance) } : x));
  const date = when instanceof Date ? when.getTime() : n(when);
  const withdrawals = [...cur.withdrawals, { id: 'wd_' + date.toString(36) + Math.random().toString(36).slice(2, 5), pocketId, pocketName: p.name, amount: amt, date, reason: String(reason || '').trim().slice(0, MAX_REASON) }].slice(-MAX_WITHDRAWALS);
  return { ok: true, inv: { ...cur, pockets, withdrawals } };
}

/** تصحيح رصيد جيب يدوياً (مثلاً بعد ربح/تقييم). */
export function setBalance(inv, pocketId, balance, when = new Date()) {
  const cur = normalizeInvestment(inv);
  const b = Math.max(0, r2(n(balance)));
  const key = ym(when);
  return { ...cur, pockets: cur.pockets.map((p) => (p.id === pocketId ? { ...p, balance: b, history: upsertHist(p.history, key, b) } : p)) };
}

/** صافي الثروة. */
export function netWorth({ pockets = 0, goals = 0, inventory = 0, debt = 0 } = {}) {
  const assets = r2(Math.max(0, n(pockets)) + Math.max(0, n(goals)) + Math.max(0, n(inventory)));
  const d = Math.max(0, r2(n(debt)));
  return { assets, debt: d, net: r2(assets - d) };
}

/** سجل صافي الثروة الشهري (يحدّث شهر اليوم). يُرجع null إن لا تغيير يستحق الكتابة. */
export function recordNetWorth(inv, value, when = new Date()) {
  const cur = normalizeInvestment(inv);
  const key = ym(when);
  const v = r2(n(value));
  const old = cur.netWorthHistory.find((e) => e.ym === key);
  if (old && Math.abs(old.value - v) < 0.5) return null;
  const list = [...cur.netWorthHistory.filter((e) => e.ym !== key), { ym: key, value: v }].sort((a, b) => (a.ym < b.ym ? -1 : 1)).slice(-MAX_HISTORY);
  return { ...cur, netWorthHistory: list };
}

/** تنبيه: فائض الشهر الماضي لم يُوزَّع (أو وُزِّع أقل من نصفه). */
export function unallocatedLastMonth(inv, lastMonthSurplus, now = new Date()) {
  const s = Math.max(0, n(lastMonthSurplus));
  if (s <= 0) return null;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = ym(prev);
  const done = (normalizeInvestment(inv).distributions.find((d) => d.ym === key) || { amount: 0 }).amount;
  return done >= s * 0.5 ? null : { ym: key, surplus: Math.round(s), distributed: Math.round(done) };
}
