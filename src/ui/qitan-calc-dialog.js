/* ==========================================================================
   qitan-calc-dialog.js — 🧵 نافذة حاسبة القيطان (v3.19.0)
   ==========================================================================
   الطول النهائي (سم أو م) + عدد القطع + هامش الأمان (افتراضي 5%) ⟵ القيطان الخام المطلوب والموصى بشراؤه.
   المنطق في services/qitan-calc.js (نقي ومُختبَر)؛ هذه الواجهة تعرض فقط. تُفتح من حاسبة القماش.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { calcQitan, MARGIN_PRESETS, DEFAULT_MARGIN_PCT, QITAN_RAW_M, QITAN_FINAL_M, QITAN_RATIO } from '../services/qitan-calc.js';

const fmt = (n) => String(Math.round(n * 1000) / 1000);

export function openQitanCalcDialog() {
  const body = el('div', { 'data-role': 'qitan-dialog' });
  const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);

  const len = el('input', { className: 'input', type: 'number', min: '0', step: '0.5', inputMode: 'decimal', 'data-role': 'qt-length', placeholder: 'مثال: 85' });
  const unit = el('select', { className: 'select', 'data-role': 'qt-unit' }, [el('option', { value: 'cm' }, 'سنتيمتر'), el('option', { value: 'm' }, 'متر')]);
  const qty = el('input', { className: 'input', type: 'number', min: '1', step: '1', value: '1', inputMode: 'numeric', 'data-role': 'qt-qty' });
  const margin = el('input', { className: 'input', type: 'number', min: '0', max: '30', step: '0.5', value: String(DEFAULT_MARGIN_PCT), inputMode: 'decimal', 'data-role': 'qt-margin' });
  const out = el('div', { 'data-role': 'qt-result', style: { marginTop: '8px' } });

  const chips = el('div', { style: { display: 'flex', gap: '6px', margin: '4px 0 8px' } });
  MARGIN_PRESETS.forEach((p) => chips.appendChild(el('button', { type: 'button', className: 'btn btn--sm btn--ghost', 'data-margin': String(p), onClick: () => { margin.value = String(p); recalc(); } }, p + '%')));

  function recalc() {
    clear(out);
    const r = calcQitan({ finalLength: len.value, unit: unit.value, marginPct: margin.value, quantity: qty.value });
    if (!r.ok) { out.appendChild(el('div', { style: { color: '#888', fontSize: '13px' } }, r.error)); return; }
    out.appendChild(el('div', { style: { background: '#F6F1E6', borderRadius: '8px', padding: '10px', lineHeight: '1.9', fontSize: '13px' } }, [
      el('div', { style: { color: '#666' } }, QITAN_RAW_M + ' م خام ⟵ ' + QITAN_FINAL_M + ' م نهائي (× ' + fmt(QITAN_RATIO) + ')'),
      el('div', {}, 'المنتج النهائي: ' + fmt(r.totalFinalM) + ' م' + (r.quantity > 1 ? ' (' + r.quantity + ' قطع × ' + fmt(r.finalM) + ' م)' : '')),
      el('div', {}, 'الخام المطلوب بالضبط: ' + fmt(r.exactRawM) + ' م'),
      el('div', { style: { color: '#666' } }, 'هامش الأمان ' + r.marginPct + '% ⟵ + ' + fmt(r.extraM) + ' م'),
      el('div', { style: { fontWeight: '700', fontSize: '15px', color: '#123C2F' } }, 'اشترِ: ' + fmt(r.recommendedRawM) + ' متر (≈ ' + fmt(r.recommendedCm) + ' سم)'),
    ]));
  }
  [len, unit, qty, margin].forEach((x) => x.addEventListener('input', recalc));
  unit.addEventListener('change', recalc);

  body.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' } }, [field('الطول النهائي المطلوب', len), field('الوحدة', unit)]));
  body.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [field('عدد القطع', qty), field('هامش الأمان %', margin)]));
  body.appendChild(chips);
  body.appendChild(out);
  recalc();

  return modal.open({ title: '🧵 حاسبة القيطان', body, closable: true, actions: [{ text: 'إغلاق', variant: 'primary', action: 'close' }] });
}
