/* ==========================================================================
   debt-plan-card.js — بطاقة «التحرر من الالتزامات» في المالية الشخصية (v3.9.0)
   ==========================================================================
   عدّاد التحرر + جدول التخفيف + ترتيب السداد (كرة الثلج/الانهيار الجليدي) + محاكاة مبلغ إضافي.
   تحمّل بياناتها بنفسها، وللقراءة فقط (لا تغيّر أي التزام).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { commitments } from '../data/repos/commitments.js';
import { formatEGP } from '../core/utils.js';
import { termedCommitments, payoffOrder, freedomPlan, simulatePayoff } from '../services/debt-plan.js';

const LABELS = {
  snowball: ['⛄ كرة الثلج', 'الأصغر إجمالياً أولاً — تنتهي أقساط أكثر أسرع فتخفّ عليك نفسياً'],
  avalanche: ['🏔️ الانهيار الجليدي', 'الأعلى قسطاً شهرياً أولاً — يحرّر أكبر مبلغ شهري أسرع'],
};

const monthsText = (n) => (n === 1 ? 'شهر واحد' : (n === 2 ? 'شهران' : (n <= 10 ? n + ' شهور' : n + ' شهراً')));

export function buildDebtPlanCard() {
  const card = el('div', { className: 'card', 'data-role': 'debt-plan-card', style: { marginBottom: '12px', display: 'none' } });
  const body = el('div', {});
  card.appendChild(el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '🔓 التحرر من الالتزامات')]));
  card.appendChild(body);
  const st = { strategy: 'snowball', extra: '' };
  let termed = [];

  function draw() {
    clear(body);
    const plan = freedomPlan(termed);
    body.appendChild(el('div', { 'data-role': 'freedom-counter', style: { textAlign: 'center', padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '8px' } }, [
      el('div', { style: { fontSize: '12px', color: '#666' } }, 'تتحرر من كل الأقساط بعد'),
      el('div', { style: { fontSize: '22px', fontWeight: '700', color: '#123C2F' } }, monthsText(plan.monthsToFree)),
      el('div', { style: { fontSize: '12px', color: '#666' } }, 'إجمالي المتبقي ' + formatEGP(plan.totalRemaining) + ' · تدفع الآن ' + formatEGP(plan.monthlyNow) + ' شهرياً'),
    ]));
    plan.timeline.forEach((t) => body.appendChild(el('div', { style: { fontSize: '12.5px', padding: '3px 0', borderBottom: '1px dashed #EEE' } },
      '🎉 بعد ' + monthsText(t.monthsFromNow) + ' (من ' + t.month + '): ينتهي ' + t.names.join('، ') + ' ويخفّ عنك ' + formatEGP(t.freed) + ' — يبقى ' + formatEGP(t.monthlyAfter) + ' شهرياً')));

    const tabs = el('div', { style: { display: 'flex', gap: '6px', margin: '10px 0 4px' } });
    ['snowball', 'avalanche'].forEach((k) => tabs.appendChild(el('button', {
      type: 'button', className: 'btn btn--sm ' + (st.strategy === k ? 'btn--primary' : 'btn--ghost'), style: { flex: '1' }, 'data-action': 'strategy-' + k,
      onClick: () => { st.strategy = k; draw(); },
    }, LABELS[k][0])));
    body.appendChild(tabs);
    body.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '6px' } }, LABELS[st.strategy][1]));
    payoffOrder(termed, st.strategy).forEach((x) => body.appendChild(el('div', { 'data-rank': String(x.rank), style: { fontSize: '13px', padding: '3px 0' } },
      x.rank + '. ' + x.name + ' — ' + formatEGP(x.monthly) + '/شهر · باقي ' + x.remaining + ' (' + formatEGP(x.total) + ')' + (x.rank === 1 ? ' ← ابدأ به' : ''))));

    const extra = el('input', { className: 'input', type: 'number', min: '0', step: 'any', inputMode: 'decimal', placeholder: 'مثال: 500', value: st.extra, 'data-role': 'extra-input' });
    const out = el('div', { 'data-role': 'extra-result', style: { fontSize: '13px', marginTop: '4px' } });
    const show = () => {
      st.extra = extra.value;
      clear(out);
      const r = simulatePayoff(termed, st.strategy, extra.value);
      out.appendChild(el('div', { style: { color: r.savedMonths > 0 ? '#2E7D32' : '#666', fontWeight: r.savedMonths > 0 ? '700' : '400' } },
        r.savedMonths > 0
          ? '✅ تتحرر بعد ' + monthsText(r.months) + ' بدل ' + monthsText(r.baselineMonths) + ' — توفّر ' + monthsText(r.savedMonths)
          : 'بنفس المدة (' + monthsText(r.baselineMonths) + ') — جرّب مبلغاً إضافياً'));
      out.appendChild(el('div', { style: { fontSize: '11px', color: '#888' } }, 'الأقساط المنتهية تُوجَّه تلقائياً للهدف التالي. لا فوائد مسجّلة، فالتوفير في الزمن.'));
    };
    extra.addEventListener('input', show);
    body.appendChild(el('div', { className: 'field', style: { marginTop: '8px' } }, [el('label', { className: 'field__label' }, '💡 لو دفعت مبلغاً إضافياً شهرياً (ج)'), extra]));
    body.appendChild(out);
    show();
  }

  commitments.list().then((list) => {
    termed = termedCommitments(list);
    const any = (list || []).some((c) => c && c.active !== false);
    if (!termed.length) {
      if (!any) return;
      card.style.display = '';
      body.appendChild(el('div', { style: { fontSize: '13px', color: '#666', lineHeight: '1.8' } },
        'لتظهر خطة التحرر: عدّل التزام قسط/قرض واكتب «الأقساط المتبقية» (اختياري).'));
      return;
    }
    card.style.display = '';
    draw();
  }).catch((e) => console.warn('[debt-plan-card]', e));
  return card;
}
