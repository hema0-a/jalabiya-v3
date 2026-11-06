/* ==========================================================================
   silent-budget.js — الميزانية الصامتة (v3.9.1)
   ==========================================================================
   توهّج هادئ أعلى الشاشة (أخضر/أصفر/أحمر) يعكس سرعة سداد التزاماتك هذا الشهر مقابل أيامه،
   بلا أرقام. اختياري (display.silentBudget، مُعطَّل افتراضياً). طبقة ثابتة لا تتلقى نقرات.
   ========================================================================== */

import { el } from '../core/dom.js';
import { getCommitmentsStats } from '../services/commitments-calculator.js';
import { moodLevel } from '../services/wellbeing.js';

const ID = 'silent-budget-glow';
const RGBA = { safe: 'rgba(31,109,87,0.10)', warn: 'rgba(184,134,59,0.13)', danger: 'rgba(190,60,60,0.13)' };
let seq = 0;

function layer() {
  let n = document.getElementById(ID);
  if (!n) {
    n = el('div', { id: ID, 'aria-hidden': 'true', style: { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '0' } });
    document.body.appendChild(n);
  }
  return n;
}

/** @param {boolean} on */
export async function applySilentBudget(on) {
  const mine = ++seq;
  if (!document || !document.body) return null;
  if (!on) {
    const n = document.getElementById(ID);
    if (n) n.remove();
    return null;
  }
  try {
    const s = await getCommitmentsStats();
    if (mine !== seq) return null;                       /* طلب أحدث ألغى هذا */
    const expected = Number(s && s.totalMonthlyExpected) || 0;
    const lvl = moodLevel(expected > 0 ? ((Number(s.totalPaidThisMonth) || 0) / expected) * 100 : 0, new Date(), expected > 0);
    if (!lvl) { const n = document.getElementById(ID); if (n) n.remove(); return null; }
    layer().style.background = 'radial-gradient(1400px 700px at 50% -15%, ' + RGBA[lvl] + ', transparent 60%)';
    layer().setAttribute('data-level', lvl);
    return lvl;
  } catch (e) { console.warn('[silent-budget]', e); return null; }
}
