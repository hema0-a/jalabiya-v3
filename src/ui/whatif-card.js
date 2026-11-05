/* ==========================================================================
   whatif-card.js — بطاقة «ماذا لو؟» في المركز المالي (v3.7.0)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { getFinancialData } from '../services/financial-calculator.js';
import { getCommitmentsStats } from '../services/commitments-calculator.js';
import { houseExpenses } from '../data/repos/house-expenses.js';
import { formatEGP } from '../core/utils.js';
import { simulate, normalizeBaseline } from '../services/whatif.js';

const DAY = 86400000;

/** خط الأساس: متوسط شهري لآخر 3 شهور (دخل/مصروف ورشة/بيت) + الالتزامات الشهرية. */
export async function loadWhatIfBaseline() {
  const [fin, com] = await Promise.all([getFinancialData('3months'), getCommitmentsStats()]);
  const now = Date.now();
  let house = 0;
  try {
    const list = await houseExpenses.listByPeriod(now - 90 * DAY, now + DAY);
    house = list.reduce((s, e) => s + (Number(e.amount) || 0), 0) / 3;
  } catch (e) { house = 0; }
  return normalizeBaseline({
    income: (fin.summary.totalRevenue || 0) / 3,
    workshopExpenses: (fin.summary.totalExpenses || 0) / 3,
    commitments: (com && com.totalMonthlyExpected) || 0,
    house,
  });
}

export function buildWhatIfCard() {
  const card = el('div', { className: 'card', 'data-role': 'whatif-card', style: { marginBottom: '12px' } });
  card.appendChild(el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '🔮 ماذا لو؟')]));
  const form = el('div', { 'data-role': 'whatif-form' });
  const out = el('div', { 'data-role': 'whatif-out', style: { marginTop: '8px' } });
  card.appendChild(form);
  card.appendChild(out);

  const inputs = {};
  const defs = [
    ['incomePct', 'تغيّر الدخل %', '10'], ['expensePct', 'تغيّر مصروف الورشة %', '5'],
    ['housePct', 'تغيّر مصروف البيت %', '-10'], ['newCommitment', 'التزام شهري جديد (ج)', '500'],
    ['loanAmount', 'مبلغ قرض (ج)', '20000'], ['loanMonths', 'مدة القرض (شهر)', '12'],
    ['loanInterestPct', 'فائدة القرض الإجمالية %', '0'],
  ];
  let baseline = null;

  function render() {
    clear(out);
    if (!baseline) return;
    const sc = {};
    defs.forEach(([k]) => { sc[k] = inputs[k].value; });
    const r = simulate(baseline, sc);
    const row = (label, a, b) => el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' } },
      [el('span', {}, label), el('span', {}, formatEGP(a) + ' ← ' + formatEGP(b))]);
    const color = r.verdict === 'worse' ? '#C62828' : (r.verdict === 'better' ? '#2E7D32' : '#666');
    out.appendChild(row('الدخل الشهري', r.before.income, r.after.income));
    out.appendChild(row('مصروف الورشة', r.before.workshopExpenses, r.after.workshopExpenses));
    out.appendChild(row('الالتزامات والأقساط', r.before.commitments, r.after.commitments));
    out.appendChild(row('مصروف البيت', r.before.house, r.after.house));
    out.appendChild(el('div', { 'data-role': 'whatif-surplus', style: { marginTop: '6px', padding: '8px', borderRadius: '8px', background: '#F6F1E6', fontWeight: '700', color } },
      'الفائض الشهري: ' + formatEGP(r.surplusBefore) + ' ← ' + formatEGP(r.surplusAfter)
      + ' (' + (r.monthlyDelta >= 0 ? '+' : '−') + formatEGP(Math.abs(r.monthlyDelta)) + ' شهرياً · ' + formatEGP(Math.abs(r.yearlyDelta)) + ' سنوياً)'));
    if (r.installment > 0) out.appendChild(el('div', { style: { fontSize: '12px', color: '#666' } }, 'قسط القرض الشهري: ' + formatEGP(r.installment)));
    if (r.negativeAfter) out.appendChild(el('div', { style: { fontSize: '12px', color: '#C62828', marginTop: '4px' } }, '⚠️ بعد هذا السيناريو يصبح الشهر بعجز.'));
    out.appendChild(el('div', { style: { fontSize: '11px', color: '#888', marginTop: '4px' } }, 'الأساس: متوسط آخر 3 شهور. الأرقام تقديرية.'));
  }

  defs.forEach(([k, label, ph]) => {
    const inp = el('input', { className: 'input', type: 'number', step: 'any', inputMode: 'decimal', placeholder: 'مثال: ' + ph, 'data-role': 'wi-' + k });
    inp.addEventListener('input', render);
    inputs[k] = inp;
    form.appendChild(el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), inp]));
  });

  loadWhatIfBaseline().then((b) => { baseline = b; render(); }).catch(() => {
    clear(out); out.appendChild(el('div', { style: { color: '#888', fontSize: '13px' } }, 'تعذّر تحميل بيانات الأساس'));
  });
  return card;
}
