/* ==========================================================================
   controls.js — عناصر تحكم مخصصة (Toggle + Color Picker + Slider)
   ==========================================================================
   API:
     createToggle({label, checked, onChange}) → HTMLElement
     createColorPicker({value, swatches, onChange}) → HTMLElement
     createSlider({min, max, step, value, label, suffix, onChange}) → HTMLElement

   كل عنصر يُرجع HTMLElement قابلاً للإدراج مباشرة.
   كل عنصر يحمل دوال مساعدة: getValue / setValue (حسب النوع).
   ========================================================================== */

import { el } from '../core/dom.js';

/* --- قائمة ألوان افتراضية للـ Color Picker --- */
const DEFAULT_SWATCHES = [
  '#1F6D57', '#2E8B6F', '#B8863B', '#D4A55C',
  '#1565C0', '#C62828', '#6A1B9A', '#2E7D32',
];

/**
 * إنشاء مفتاح تبديل (Toggle Switch).
 * @param {Object} [options]
 * @param {string} [options.label='']
 * @param {boolean} [options.checked=false]
 * @param {Function} [options.onChange] — يُستدعى بالقيمة الجديدة (boolean)
 * @returns {HTMLElement}
 * @example
 *   const t = createToggle({ label: 'الوضع الليلي', onChange: (v) => console.log(v) });
 *   document.body.appendChild(t);
 */
export function createToggle(options = {}) {
  const { label = '', checked = false, onChange = null } = options;

  const input = el('input', {
    type: 'checkbox',
    className: 'toggle__input',
  });
  input.checked = !!checked;

  const track = el('span', { className: 'toggle__track' }, [
    el('span', { className: 'toggle__thumb' }),
  ]);

  const children = [input, track];
  if (label) {
    children.push(el('span', { className: 'toggle__label', text: label }));
  }

  const wrap = el('label', { className: 'toggle' }, children);

  if (typeof onChange === 'function') {
    input.addEventListener('change', () => onChange(input.checked));
  }

  wrap.setChecked = (v) => { input.checked = !!v; };
  wrap.isChecked = () => input.checked;

  return wrap;
}

/**
 * إنشاء منتقي ألوان (Color Picker).
 * @param {Object} [options]
 * @param {string} [options.value='#1F6D57']
 * @param {string[]} [options.swatches] — قائمة الألوان الجاهزة
 * @param {Function} [options.onChange] — يُستدعى باللون الجديد (string)
 * @returns {HTMLElement}
 * @example
 *   const c = createColorPicker({ value: '#1F6D57', onChange: (hex) => console.log(hex) });
 *   document.body.appendChild(c);
 */
export function createColorPicker(options = {}) {
  const {
    value = '#1F6D57',
    swatches = DEFAULT_SWATCHES,
    onChange = null,
  } = options;

  let currentValue = value;

  const input = el('input', {
    type: 'color',
    className: 'color-picker__input',
    'aria-label': 'اختر لوناً',
  });
  input.value = currentValue;

  /* swatchEls + swatchWrap أولاً — ثم الدالة تستخدمها */
  const swatchEls = swatches.map((color) =>
    el('button', {
      type: 'button',
      className: 'color-picker__swatch' +
        (color === currentValue ? ' color-picker__swatch--active' : ''),
      style: { background: color },
      'data-color': color,
      'aria-label': 'اختر ' + color,
      onClick: () => handleColorChange(color),
    })
  );

  const swatchWrap = el('div', { className: 'color-picker__swatches' }, swatchEls);

  /**
   * يُستدعى عند تغيير اللون (من input أو من swatch).
   * @param {string} newValue
   */
  function handleColorChange(newValue) {
    currentValue = newValue;
    input.value = newValue;
    Array.from(swatchWrap.children).forEach((s) => {
      s.classList.toggle(
        'color-picker__swatch--active',
        s.dataset.color === newValue
      );
    });
    if (typeof onChange === 'function') onChange(newValue);
  }

  input.addEventListener('input', () => handleColorChange(input.value));

  const wrap = el('div', { className: 'color-picker' }, [input, swatchWrap]);

  wrap.getValue = () => currentValue;
  wrap.setValue = (v) => handleColorChange(v);

  return wrap;
}

/**
 * إنشاء شريط تمرير (Slider).
 * @param {Object} [options]
 * @param {number} [options.min=0]
 * @param {number} [options.max=100]
 * @param {number} [options.step=1]
 * @param {number} [options.value=50]
 * @param {string} [options.label='']
 * @param {string} [options.suffix=''] — مثل 'px' أو 'KB'
 * @param {Function} [options.onChange] — يُستدعى بالقيمة الجديدة (number)
 * @returns {HTMLElement}
 * @example
 *   const s = createSlider({ min: 0, max: 100, value: 50, suffix: '%' });
 *   document.body.appendChild(s);
 */
export function createSlider(options = {}) {
  const {
    min = 0,
    max = 100,
    step = 1,
    value = 50,
    label = '',
    suffix = '',
    onChange = null,
  } = options;

  const input = el('input', {
    type: 'range',
    className: 'slider__input',
    min: String(min),
    max: String(max),
    step: String(step),
  });
  input.value = String(value);

  const displayText = (v) => String(v) + (suffix ? ' ' + suffix : '');
  const valueEl = el('div', { className: 'slider__value', text: displayText(value) });

  input.addEventListener('input', () => {
    const v = Number(input.value);
    valueEl.textContent = displayText(v);
    if (typeof onChange === 'function') onChange(v);
  });

  const children = [];
  if (label) children.push(el('div', { className: 'field__label', text: label }));
  children.push(input, valueEl);

  const wrap = el('div', { className: 'slider' }, children);

  wrap.getValue = () => Number(input.value);
  wrap.setValue = (v) => {
    input.value = String(v);
    valueEl.textContent = displayText(v);
  };

  return wrap;
}
