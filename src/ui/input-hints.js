/* ==========================================================================
   input-hints.js — إظهار ملاحظات المدقّق الذكي تحت الحقل (v3.8.1)
   ==========================================================================
   attachHint(input, check) يضيف سطر ملاحظة تحت الحقل ويحدّثه أثناء الكتابة.
   إرشادي فقط: لا يمنع الحفظ ولا يغيّر القيمة. بلا innerHTML.
   ========================================================================== */

import { el } from '../core/dom.js';

const COLORS = {
  danger: { c: '#C62828', i: '🚨' }, warn: { c: '#E65100', i: '⚠️' },
  info: { c: '#1565C0', i: 'ℹ️' }, good: { c: '#2E7D32', i: '✅' },
};

/**
 * @param {HTMLElement} input
 * @param {(value:string)=>({level:string,msg:string}|null)} check
 * @returns {{refresh:()=>void}}
 */
export function attachHint(input, check) {
  let hint = null;
  const refresh = () => {
    let r = null;
    try { r = check(input.value); } catch (e) { r = null; }
    if (!r) { if (hint) hint.style.display = 'none'; input.removeAttribute('data-hint-level'); return; }
    if (!hint) {
      hint = el('div', { className: 'input-hint', role: 'status', 'aria-live': 'polite', 'data-role': 'input-hint', style: { fontSize: '11.5px', marginTop: '3px', lineHeight: '1.5' } });
      if (input.parentNode) input.parentNode.insertBefore(hint, input.nextSibling);
      else return;
    }
    const k = COLORS[r.level] || COLORS.info;
    hint.style.display = '';
    hint.style.color = k.c;
    hint.textContent = k.i + ' ' + r.msg;
    input.setAttribute('data-hint-level', r.level);
  };
  input.addEventListener('input', refresh);
  input.addEventListener('blur', refresh);
  return { refresh };
}
