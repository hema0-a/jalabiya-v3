/* ==========================================================================
   whatif.js — محاكي «ماذا لو» المالي (v3.7.0) — دوال نقية
   ==========================================================================
   يأخذ خط أساس شهرياً ويطبّق سيناريو (تغيّر دخل/مصروف ورشة/التزام جديد/
   تخفيض مصروف البيت/قرض) ويُرجع الفائض قبل وبعد والأثر السنوي.
   ========================================================================== */

export const MAX_PCT = 300;
export const MAX_LOAN_MONTHS = 120;

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, n(v)));
const r2 = (v) => Math.round(v * 100) / 100;

export function normalizeBaseline(b) {
  b = b || {};
  return {
    income: Math.max(0, n(b.income)),
    workshopExpenses: Math.max(0, n(b.workshopExpenses)),
    commitments: Math.max(0, n(b.commitments)),
    house: Math.max(0, n(b.house)),
  };
}

export function normalizeScenario(s) {
  s = s || {};
  return {
    incomePct: clamp(s.incomePct, -100, MAX_PCT),
    expensePct: clamp(s.expensePct, -100, MAX_PCT),
    newCommitment: Math.max(0, n(s.newCommitment)),
    housePct: clamp(s.housePct, -100, MAX_PCT),
    loanAmount: Math.max(0, n(s.loanAmount)),
    loanMonths: Math.round(clamp(s.loanMonths, 0, MAX_LOAN_MONTHS)),
    loanInterestPct: clamp(s.loanInterestPct, 0, 200),
  };
}

/** القسط الشهري للقرض (فائدة إجمالية مسطّحة على المبلغ). */
export function loanInstallment(amount, months, interestPct) {
  const a = Math.max(0, n(amount));
  const m = Math.round(n(months));
  if (a <= 0 || m <= 0) return 0;
  return r2((a * (1 + Math.max(0, n(interestPct)) / 100)) / m);
}

export function surplusOf(b) {
  return r2(b.income - b.workshopExpenses - b.commitments - b.house);
}

/**
 * @returns {{before:object, after:object, surplusBefore:number, surplusAfter:number,
 *            monthlyDelta:number, yearlyDelta:number, installment:number, verdict:'better'|'worse'|'same', negativeAfter:boolean}}
 */
export function simulate(baseline, scenario) {
  const b = normalizeBaseline(baseline);
  const s = normalizeScenario(scenario);
  const installment = loanInstallment(s.loanAmount, s.loanMonths, s.loanInterestPct);
  const after = {
    income: r2(b.income * (1 + s.incomePct / 100)),
    workshopExpenses: r2(b.workshopExpenses * (1 + s.expensePct / 100)),
    commitments: r2(b.commitments + s.newCommitment + installment),
    house: r2(b.house * (1 + s.housePct / 100)),
  };
  const surplusBefore = surplusOf(b);
  const surplusAfter = surplusOf(after);
  const monthlyDelta = r2(surplusAfter - surplusBefore);
  return {
    before: b, after, surplusBefore, surplusAfter, monthlyDelta,
    yearlyDelta: r2(monthlyDelta * 12), installment,
    verdict: monthlyDelta > 0 ? 'better' : (monthlyDelta < 0 ? 'worse' : 'same'),
    negativeAfter: surplusAfter < 0,
  };
}
