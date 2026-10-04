/* ==========================================================================
   form-builder.js — بناء نماذج ديناميكية
   ==========================================================================
   API:
     const form = createForm({fields, values, onSubmit});
     form.node            → HTMLElement
     form.getValues()     → Object
     form.setValues(obj)  → void
     form.validate()      → {valid, errors}
     form.reset()         → void
   ========================================================================== */

import { el } from '../core/dom.js';

/**
 * استخراج قيمة من عنصر إدخال.
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} input
 * @returns {*}
 */
function readInputValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') {
    if (input.value === '') return '';
    const n = Number(input.value);
    return isNaN(n) ? '' : n;
  }
  return input.value;
}

/**
 * كتابة قيمة في عنصر إدخال.
 */
function writeInputValue(input, value) {
  if (input.type === 'checkbox') {
    input.checked = Boolean(value);
  } else if (value === null || value === undefined) {
    input.value = '';
  } else {
    input.value = String(value);
  }
}

/**
 * بناء عنصر حقل واحد.
 * @param {Object} field — {name, label, type, placeholder, required, options, hint}
 * @returns {HTMLElement}
 */
function buildField(field) {
  const {
    name,
    label = '',
    type = 'text',
    placeholder = '',
    required = false,
    options = [],
    hint = '',
  } = field;

  let input;

  if (type === 'textarea') {
    input = el('textarea', {
      className: 'textarea',
      name,
      placeholder,
    });
  } else if (type === 'select') {
    input = el('select', { className: 'select', name });
    options.forEach((opt) => {
      const optValue = (typeof opt === 'object') ? opt.value : opt;
      const optLabel = (typeof opt === 'object') ? opt.label : opt;
      const optEl = el('option', { value: String(optValue) }, String(optLabel));
      input.appendChild(optEl);
    });
  } else if (type === 'checkbox') {
    const checkboxInput = el('input', {
      type: 'checkbox',
      className: 'toggle__input',
      name,
    });
    const track = el('span', { className: 'toggle__track' }, [
      el('span', { className: 'toggle__thumb' }),
    ]);
    const wrap = el('label', { className: 'toggle' }, [
      checkboxInput,
      track,
      el('span', { className: 'toggle__label', text: label }),
    ]);
    wrap.__input = checkboxInput;
    wrap.__fieldName = name;
    return wrap;
  } else {
    input = el('input', {
      className: 'input',
      type,
      name,
      placeholder,
    });
  }

  const children = [];
  if (label) {
    children.push(el('label', { className: 'field__label', text: label + (required ? ' *' : '') }));
  }
  children.push(input);
  if (hint) {
    children.push(el('div', { className: 'field__hint', text: hint }));
  }

  const wrap = el('div', { className: 'field' }, children);
  wrap.__input = input;
  wrap.__fieldName = name;
  return wrap;
}

/**
 * إنشاء نموذج كامل.
 * @param {Object} options
 * @param {Array} options.fields
 * @param {Object} [options.values]
 * @param {Function} [options.onSubmit]
 * @returns {{node:HTMLElement, getValues:Function, setValues:Function, validate:Function, reset:Function}}
 */
export function createForm(options = {}) {
  const { fields = [], values = {}, onSubmit = null } = options;
  const wraps = [];
  const inputsByName = {};

  const formNode = el('form', { className: 'form' });

  fields.forEach((f) => {
    const wrap = buildField(f);
    wraps.push(wrap);
    if (wrap.__input) {
      inputsByName[wrap.__fieldName] = wrap.__input;
      if (Object.prototype.hasOwnProperty.call(values, wrap.__fieldName)) {
        writeInputValue(wrap.__input, values[wrap.__fieldName]);
      }
    }
    formNode.appendChild(wrap);
  });

  function getValues() {
    const out = {};
    Object.keys(inputsByName).forEach((name) => {
      out[name] = readInputValue(inputsByName[name]);
    });
    return out;
  }

  function setValues(obj) {
    if (!obj) return;
    Object.keys(obj).forEach((name) => {
      if (inputsByName[name]) {
        writeInputValue(inputsByName[name], obj[name]);
      }
    });
  }

  function validate() {
    const errors = {};
    fields.forEach((f) => {
      if (!f.required) return;
      const inp = inputsByName[f.name];
      if (!inp) return;
      const v = readInputValue(inp);
      const isEmpty =
        v === '' ||
        v === null ||
        v === undefined ||
        (f.type === 'checkbox' && v === false);
      if (isEmpty) {
        errors[f.name] = 'هذا الحقل مطلوب';
        if (inp.classList) inp.classList.add('input--error');
      } else if (inp.classList) {
        inp.classList.remove('input--error');
      }
    });
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function reset() {
    Object.keys(inputsByName).forEach((name) => {
      const inp = inputsByName[name];
      if (inp.type === 'checkbox') inp.checked = false;
      else inp.value = '';
      if (inp.classList) inp.classList.remove('input--error');
    });
  }

  if (typeof onSubmit === 'function') {
    formNode.addEventListener('submit', (e) => {
      e.preventDefault();
      const { valid, errors } = validate();
      onSubmit({ values: getValues(), valid, errors });
    });
  }

  formNode.addEventListener('submit', (e) => e.preventDefault());

  return {
    node: formNode,
    getValues,
    setValues,
    validate,
    reset,
  };
}
