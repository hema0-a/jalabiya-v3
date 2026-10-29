/* ==========================================================================
   customers-measure.js — قسم المقاسات في نموذج العميل (v3.5.8)
   ==========================================================================
   buildMeasurementsSection(ctx, existing) · openMeasureStepper (أخذ المقاس خطوة بخطوة، v3.3.51).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';

export function buildMeasurementsSection(ctx, existingMeasurements) {
  const { state } = ctx;
  const wrap = el('div', { className: 'field' });
  wrap.appendChild(el('label', { className: 'field__label' }, '📏 المقاسات (اختياري)'));

  const fields = state.measurementFields;
  const values = existingMeasurements || {};

  if (fields.length === 0) {
    wrap.appendChild(el('div', {
      style: { fontSize: '11px', color: '#999', padding: '6px 0' },
    }, 'لا توجد حقول مقاسات مفعَّلة. أضفها من الإعدادات → حقول المقاسات.'));
    return { node: wrap, getValues: () => ({}), setValues: () => {} };
  }

  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  });

  const inputs = {};

  fields.forEach((f) => {
    const inp = el('input', {
      className: 'input', type: 'number', min: '0', step: '0.5', placeholder: '0',
    });
    if (values[f.id] != null && values[f.id] !== '') {
      inp.value = String(values[f.id]);
    }
    inputs[f.id] = inp;

    grid.appendChild(el('div', {}, [
      el('label', {
        style: { fontSize: '11px', color: '#666', marginBottom: '3px', display: 'block' },
      }, f.name + (f.unit ? ' (' + f.unit + ')' : '')),
      inp,
    ]));
  });

  /* وضع أخذ المقاس خطوة بخطوة (v3.3.51): حقل كبير واحد + «التالي»، ويكتب مباشرة في حقول النموذج */
  const stepBtn = el('button', {
    type: 'button', className: 'btn btn--sm btn--secondary',
    style: { marginBottom: '8px' },
    onClick: () => openMeasureStepper(fields, inputs),
  }, '📏 أخذ المقاس خطوة بخطوة');
  wrap.appendChild(stepBtn);

  wrap.appendChild(grid);

  return {
    node: wrap,
    getValues: () => {
      const out = {};
      Object.keys(inputs).forEach((id) => {
        const v = inputs[id].value.trim();
        if (v === '') return;
        const n = Number(v);
        if (isFinite(n) && n > 0) out[id] = n;
      });
      return out;
    },
    setValues: (obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(inputs).forEach((id) => {
        const v = obj[id];
        inputs[id].value = (v != null && v !== '') ? String(v) : '';
      });
    },
  };
}

/**
 * نافذة أخذ المقاس بإيد واحدة: حقل واحد كبير لكل مقاس، «التالي/السابق»، وزر Enter يتقدّم.
 * القيم تُكتب مباشرة في حقول نموذج العميل (الحفظ النهائي من زر الحفظ في النموذج).
 * @param {Array} fields — حقول المقاسات المفعَّلة
 * @param {Object} inputs — حقول الإدخال في النموذج مفتاحها id
 */
function openMeasureStepper(fields, inputs) {
  let idx = 0;
  const progress = el('div', { style: { fontSize: '12px', color: '#666', textAlign: 'center', marginBottom: '6px' } });
  const bar = el('div', { style: { height: '6px', background: '#E5DDD0', borderRadius: '3px', marginBottom: '14px', overflow: 'hidden' } }, [
    el('div', { style: { height: '100%', width: '0%', background: '#1F6D57', transition: 'width .2s' } }),
  ]);
  const label = el('div', { style: { fontSize: '22px', fontWeight: '700', color: '#123C2F', textAlign: 'center', marginBottom: '10px' } });
  const input = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.5', placeholder: '0',
    inputmode: 'decimal',
    style: { fontSize: '34px', textAlign: 'center', padding: '14px 8px', height: 'auto' },
  });
  const unit = el('div', { style: { textAlign: 'center', fontSize: '13px', color: '#666', marginTop: '6px' } });
  const prevVal = el('div', { style: { textAlign: 'center', fontSize: '12px', color: '#999', marginTop: '10px' } });

  const body = el('div', {}, [progress, bar, label, input, unit, prevVal]);

  function show() {
    const f = fields[idx];
    progress.textContent = 'المقاس ' + (idx + 1) + ' من ' + fields.length;
    bar.firstChild.style.width = Math.round(((idx + 1) / fields.length) * 100) + '%';
    label.textContent = f.name;
    unit.textContent = f.unit ? (f.unit === 'cm' ? 'سم' : f.unit) : '';
    input.value = inputs[f.id].value || '';
    const next = fields[idx + 1];
    prevVal.textContent = next ? 'التالي: ' + next.name : 'آخر مقاس';
    setTimeout(() => { try { input.focus(); input.select(); } catch { /* ignore */ } }, 50);
  }
  function commit() {
    const f = fields[idx];
    inputs[f.id].value = input.value.trim();
    inputs[f.id].dispatchEvent(new Event('input', { bubbles: true }));
  }
  function go(delta) {
    commit();
    const n = idx + delta;
    if (n < 0) return;
    if (n >= fields.length) { handle.close(); return; }
    idx = n; show();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); go(1); }
  });

  const handle = modal.open({
    title: '📏 أخذ المقاس',
    body, closable: true,
    actions: [
      { text: '◀ السابق', variant: 'ghost', onClick: () => go(-1) },
      { text: 'التالي ▶', variant: 'primary', onClick: () => go(1) },
      { text: '✔ تم', variant: 'secondary', onClick: () => { commit(); handle.close(); } },
    ],
  });
  show();
}
