/* ==========================================================================
   circles.js — الجمعيات (دور الجمعية) (v3.16.0) — دوال نقية
   ==========================================================================
   جمعية: كل عضو يدفع قسطاً شهرياً ثابتاً، وفي شهر «دورك» تقبض المجموع (القسط × عدد الأعضاء).
   النموذج: تدفع القسط كل شهر (حتى شهر قبضك، فقبضك يأتي إضافة إلى دفعك) — فصافي الدورة كلها صفر، والفائدة هي أن
   تقبض مبلغاً كبيراً في وقت مبكر أو مناسب. المدفوع يُعلَّم لكل شهر (YYYY-MM)، والقبض يُعلَّم مرة واحدة.
   جدول الأشهر: الشهر 1 هو startYm، والشهر k هو startYm + (k−1). لا DOM ولا قاعدة بيانات.
   ========================================================================== */

export const MAX_MEMBERS = 60;
export const MAX_NAME = 60;
const MAX_AMOUNT = 100000000;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;
const pad = (x) => String(x).padStart(2, '0');

export const validYm = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const ymOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const ymIndex = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); };
const ymFromIndex = (i) => Math.floor(i / 12) + '-' + pad((i % 12) + 1);
export const addMonths = (ym, k) => ymFromIndex(ymIndex(ym) + k);

/** تحقّق من بيانات الجمعية. @returns {{ok:boolean,error?:string,data?:Object}} */
export function checkCircleInput(input) {
  const name = typeof (input && input.name) === 'string' ? input.name.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!name) return { ok: false, error: 'اسم الجمعية مطلوب' };
  const installment = r2(input.installment);
  if (!(installment > 0) || installment > MAX_AMOUNT) return { ok: false, error: 'القسط الشهري لازم يكون أكبر من صفر' };
  const members = Math.round(n(input.members));
  if (members < 2 || members > MAX_MEMBERS) return { ok: false, error: 'عدد الأعضاء بين 2 و' + MAX_MEMBERS };
  const myTurn = Math.round(n(input.myTurn));
  if (myTurn < 1 || myTurn > members) return { ok: false, error: 'دورك لازم يكون بين 1 و' + members };
  if (!validYm(input.startYm)) return { ok: false, error: 'شهر البداية غير صالح' };
  const payDay = Math.round(n(input.payDay));
  const notes = typeof input.notes === 'string' ? input.notes.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return { ok: true, data: { name, installment, members, myTurn, startYm: input.startYm, payDay: payDay >= 1 && payDay <= 31 ? payDay : null, notes } };
}

/** المبلغ الذي تقبضه في شهر دورك. */
export const potOf = (c) => r2(n(c && c.installment) * Math.round(n(c && c.members)));

const paidMap = (c) => (c && c.paid && typeof c.paid === 'object' ? c.paid : {});

/**
 * جدول الجمعية: صف لكل شهر { index, ym, isMyTurn, paid, collect:boolean }.
 * collected (علم القبض) يخص صف دورك.
 */
export function schedule(c) {
  if (!c || !validYm(c.startYm)) return [];
  const members = Math.max(0, Math.min(MAX_MEMBERS, Math.round(n(c.members))));
  const paid = paidMap(c);
  const out = [];
  for (let k = 1; k <= members; k++) {
    const ym = addMonths(c.startYm, k - 1);
    out.push({ index: k, ym, isMyTurn: k === Math.round(n(c.myTurn)), paid: paid[ym] === true });
  }
  return out;
}

/**
 * تقدّم الجمعية.
 * @returns {{totalMonths:number, paidMonths:number, paidAmount:number, remainingAmount:number, pot:number, collected:boolean,
 *            turnYm:string|null, status:'upcoming'|'active'|'finished', nextDueYm:string|null, overdueMonths:number}}
 */
export function circleProgress(c, now = new Date()) {
  const rows = schedule(c);
  const inst = n(c && c.installment);
  const cur = ymIndex(ymOf(now));
  const paidMonths = rows.filter((r) => r.paid).length;
  const turn = rows.find((r) => r.isMyTurn);
  const first = rows[0], last = rows[rows.length - 1];
  let status = 'active';
  if (!rows.length) status = 'finished';
  else if (cur < ymIndex(first.ym)) status = 'upcoming';
  else if (cur > ymIndex(last.ym) && paidMonths === rows.length && c.collected === true) status = 'finished';
  const nextDue = rows.find((r) => !r.paid && ymIndex(r.ym) >= cur - 0);
  const overdue = rows.filter((r) => !r.paid && ymIndex(r.ym) < cur).length;
  return {
    totalMonths: rows.length, paidMonths, paidAmount: r2(paidMonths * inst), remainingAmount: r2((rows.length - paidMonths) * inst),
    pot: potOf(c), collected: !!(c && c.collected === true), turnYm: turn ? turn.ym : null, status,
    nextDueYm: nextDue ? nextDue.ym : null, overdueMonths: overdue,
  };
}

/** إجمالي أقساط هذا الشهر غير المدفوعة عبر الجمعيات النشطة، والقبض المنتظر هذا الشهر. */
export function monthOverview(circles, now = new Date()) {
  const cur = ymOf(now);
  let dueAmount = 0, dueCount = 0, collectAmount = 0, collectCount = 0;
  for (const c of Array.isArray(circles) ? circles : []) {
    if (!c || c.active === false) continue;
    const row = schedule(c).find((r) => r.ym === cur);
    if (!row) continue;
    if (!row.paid) { dueAmount += n(c.installment); dueCount++; }
    if (row.isMyTurn && c.collected !== true) { collectAmount += potOf(c); collectCount++; }
  }
  return { dueAmount: r2(dueAmount), dueCount, collectAmount: r2(collectAmount), collectCount };
}

/** تنبيهات: قسط مستحق خلال `daysAhead` يوماً (أو متأخر)، وقبض هذا الشهر لم يُسجَّل. */
export function circleAlerts(circles, now = new Date(), daysAhead = 3) {
  const out = [];
  const cur = ymOf(now);
  const today = now.getDate();
  for (const c of Array.isArray(circles) ? circles : []) {
    if (!c || c.active === false) continue;
    const rows = schedule(c);
    const overdue = rows.filter((r) => !r.paid && ymIndex(r.ym) < ymIndex(cur));
    if (overdue.length) out.push({ id: c.id, name: c.name, kind: 'overdue', amount: r2(overdue.length * n(c.installment)), months: overdue.length });
    const row = rows.find((r) => r.ym === cur);
    if (!row) continue;
    const day = n(c.payDay);
    if (!row.paid && day >= 1 && day - today <= daysAhead && day - today >= 0) out.push({ id: c.id, name: c.name, kind: 'due', amount: r2(c.installment), daysLeft: day - today });
    else if (!row.paid && day >= 1 && day < today) out.push({ id: c.id, name: c.name, kind: 'late', amount: r2(c.installment), daysLate: today - day });
    if (row.isMyTurn && c.collected !== true) out.push({ id: c.id, name: c.name, kind: 'collect', amount: potOf(c) });
  }
  return out;
}
