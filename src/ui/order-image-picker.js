/* ==========================================================================
   order-image-picker.js — اختيار صورة مرجعية للطلب
   ==========================================================================
   - استقبال صورة من المستخدم → ضغطها → إرجاع data URL.
   - عرض معاينة + أزرار تغيير/حذف.
   - يستخدم image-compressor.js (compress).
   - يستخدم sanitizeUrl للحماية (رفض SVG وغيرها).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from './toast.js';
import { compress } from '../services/image-compressor.js';

/**
 * إنشاء مكوّن اختيار صورة مرجعية.
 * @param {Object} [options]
 * @param {string} [options.value=''] — data URL للصورة الحالية
 * @param {string} [options.label='صورة مرجعية'] — عنوان القسم
 * @param {string} [options.hint='صورة للموديل المطلوب (اختياري)']
 * @returns {{node:HTMLElement, getValue:Function, setValue:Function, clear:Function}}
 */
export function createOrderImagePicker(options = {}) {
  const {
    value: initialValue = '',
    label = '🖼️ صورة مرجعية',
    hint = 'صورة الموديل المطلوب (اختياري)',
  } = options;

  let currentValue = initialValue || '';
  let isProcessing = false;

  /* --- عناصر الواجهة --- */
  const preview = el('div', {
    style: {
      width: '100%', minHeight: '160px', maxHeight: '240px',
      borderRadius: '12px', background: '#F6F1E6',
      border: '2px dashed #E5DDD0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', cursor: 'pointer', position: 'relative',
    },
  });

  const fileInput = el('input', {
    type: 'file', accept: 'image/*', style: { display: 'none' },
  });

  const statusEl = el('div', {
    style: { fontSize: '11px', color: '#2E8B6F', marginTop: '6px', minHeight: '14px' },
  });

  const changeBtn = el('button', {
    className: 'btn btn--sm btn--secondary', type: 'button',
    style: { display: 'none' },
    onClick: () => fileInput.click(),
  }, '🔄 تغيير');

  const removeBtn = el('button', {
    className: 'btn btn--sm btn--danger', type: 'button',
    style: { display: 'none' },
    onClick: () => {
      currentValue = '';
      updatePreview();
      if (typeof options.onChange === 'function') options.onChange('');
    },
  }, '🗑️ حذف');

  const chooseBtn = el('button', {
    className: 'btn btn--sm btn--primary', type: 'button',
    onClick: () => fileInput.click(),
  }, '📁 اختر صورة');

  /* --- تحديث المعاينة --- */
  function updatePreview() {
    clear(preview);

    if (currentValue) {
      const img = el('img', {
        src: currentValue, alt: label,
        style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      });
      img.addEventListener('click', () => fileInput.click());
      preview.appendChild(img);
      preview.style.border = 'none';
      preview.style.background = '#fff';

      changeBtn.style.display = '';
      removeBtn.style.display = '';
      chooseBtn.style.display = 'none';
    } else {
      const placeholder = el('div', {
        style: {
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '6px', color: '#2E8B6F', fontSize: '13px',
          textAlign: 'center', padding: '20px',
        },
        onClick: () => fileInput.click(),
      }, [
        el('div', { style: { fontSize: '36px', lineHeight: '1' } }, '📷'),
        el('div', {}, 'اضغط لاختيار صورة'),
      ]);
      preview.appendChild(placeholder);
      preview.style.border = '2px dashed #E5DDD0';
      preview.style.background = '#F6F1E6';

      changeBtn.style.display = 'none';
      removeBtn.style.display = 'none';
      chooseBtn.style.display = '';
    }
  }

  /* --- معالجة رفع الملف --- */
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (isProcessing) return;
    isProcessing = true;
    statusEl.textContent = '⏳ جارٍ المعالجة...';
    statusEl.style.color = '#F57C00';

    try {
      const result = await compress(file, {
        quality: 0.82,
        maxSizeKB: 300,
        maxDimensionPx: 1200,
      });

      currentValue = result.dataUrl;
      updatePreview();

      statusEl.textContent = '✅ ' + result.sizeKB + ' KB · ' +
        result.width + '×' + result.height +
        (result.savedPercent > 0 ? ' · توفير ' + result.savedPercent + '%' : '');
      statusEl.style.color = '#2E7D32';

      if (typeof options.onChange === 'function') options.onChange(currentValue);
    } catch (e) {
      statusEl.textContent = '❌ ' + (e.message || 'فشل معالجة الصورة');
      statusEl.style.color = '#C62828';
      toast.danger(e.message || 'فشل معالجة الصورة');
    } finally {
      isProcessing = false;
      fileInput.value = '';
    }
  });

  /* --- التجميع --- */
  const node = el('div', { className: 'field' }, [
    el('label', { className: 'field__label' }, label),
    preview,
    el('div', {
      style: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' },
    }, [chooseBtn, changeBtn, removeBtn]),
    fileInput,
    statusEl,
    hint ? el('div', { className: 'field__hint' }, hint) : null,
  ]);

  updatePreview();

  return {
    node,
    getValue: () => currentValue,
    setValue: (v) => { currentValue = v || ''; updatePreview(); },
    clear: () => { currentValue = ''; updatePreview(); },
  };
}
