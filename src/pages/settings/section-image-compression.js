/* ==========================================================================
   section-image-compression.js — قسم ضغط الصور (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: imageCompressionSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../../core/dom.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';

/* ==========================================================================
   6. ضغط الصور
   ========================================================================== */

export const imageCompressionSection = {
  id: 'image-compression',
  icon: '🖼️',
  title: 'ضغط الصور',
  async render(body, currentSettings, saveFn) {
    const ic = currentSettings.imageCompression || DEFAULT_SETTINGS.imageCompression;

    function selectField(label, key, options, currentValue) {
      const sel = el('select', { className: 'select' });
      options.forEach(([v, l]) => {
        const o = el('option', { value: String(v) }, l);
        if (String(currentValue) === String(v)) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        const val = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
        saveFn({ imageCompression: { [key]: val } });
      });
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label),
        sel,
      ]);
    }

    body.appendChild(selectField('الجودة', 'quality', [
      ['0.60', '60%'], ['0.75', '75%'], ['0.85', '85%'], ['0.95', '95%'],
    ], ic.quality));

    body.appendChild(selectField('الحجم الأقصى', 'maxSizeKB', [
      [200, '200 KB'], [500, '500 KB'], [800, '800 KB'], [1500, '1.5 MB'],
    ], ic.maxSizeKB));

    body.appendChild(selectField('الأبعاد القصوى', 'maxDimensionPx', [
      [800, '800 px'], [1200, '1200 px'], [1600, '1600 px'], [2000, '2000 px'],
    ], ic.maxDimensionPx));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6',
      },
    }, '📊 التوفير المتوقع: ~' + Math.round((1 - (ic.quality || 0.85)) * 100) + '%'));
  },
};
