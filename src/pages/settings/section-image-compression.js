/* ==========================================================================
   section-image-compression.js — قسم ضغط الصور (v3.5.26: مفصول عن sections-system.js)
   ==========================================================================
   v3.6.1: كانت القيم تُحفظ ولا يقرؤها أي كود! الآن مفتاح «تطبيق إعدادات الضغط»
   (معطّل افتراضياً = الصور كما كانت) يجعلها تسري على صور الطلبات والمعرض.
   يصدّر: imageCompressionSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../../core/dom.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';

/* ==========================================================================
   6. ضغط الصور
   ========================================================================== */

export const imageCompressionSection = {
  id: 'image-compression',
  icon: '🖼️',
  title: 'ضغط الصور',
  async render(body, currentSettings, saveFn) {
    const ic = { ...DEFAULT_SETTINGS.imageCompression, ...(currentSettings.imageCompression || {}) };

    let enabledNow = ic.enabled === true;
    const fields = el('div', {});
    /* حالة التفعيل تُدار هنا بوضوح */
    function applyActive() {
      fields.style.opacity = enabledNow ? '1' : '0.5';
      fields.style.pointerEvents = enabledNow ? '' : 'none';
    }

    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, 'تطبيق إعدادات الضغط على الصور الجديدة'),
        el('div', { className: 'settings-row__hint' },
          'متوقف = يبقى الضغط المعتاد (طلبات: 300KB/1200px، المعرض: 500KB/1600px). عند التشغيل تُستخدم القيم أدناه. لا يمسّ الصور المحفوظة سابقاً ولا صورة العميل'),
      ]),
      createToggle({
        label: 'تطبيق إعدادات الضغط', checked: enabledNow,
        onChange: (v) => { enabledNow = v; applyActive(); saveFn({ imageCompression: { enabled: v } }); },
      }),
    ]));

    function selectField(label, key, options, currentValue) {
      const list = options.slice();
      if (!list.some(([v]) => String(v) === String(currentValue))) list.push([currentValue, String(currentValue)]);
      const sel = el('select', { className: 'select', 'data-role': key });
      list.forEach(([v, l]) => {
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

    fields.appendChild(selectField('الجودة', 'quality', [
      ['0.5', '50%'], ['0.60', '60%'], ['0.75', '75%'], ['0.85', '85%'], ['0.95', '95%'],
    ], ic.quality));
    fields.appendChild(selectField('الحجم الأقصى', 'maxSizeKB', [
      [100, '100 KB'], [200, '200 KB'], [500, '500 KB'], [800, '800 KB'], [1500, '1.5 MB'], [3000, '3 MB'],
    ], ic.maxSizeKB));
    fields.appendChild(selectField('الأبعاد القصوى', 'maxDimensionPx', [
      [600, '600 px'], [800, '800 px'], [1200, '1200 px'], [1600, '1600 px'], [2000, '2000 px'], [3000, '3000 px'],
    ], ic.maxDimensionPx));

    fields.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label', style: { flex: '1' } }, 'صور الطلبات المرجعية'),
      createToggle({ label: 'صور الطلبات', checked: ic.applyOrders !== false, onChange: (v) => { saveFn({ imageCompression: { applyOrders: v } }); } }),
    ]));
    fields.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label', style: { flex: '1' } }, 'صور معرض الأعمال'),
      createToggle({ label: 'صور المعرض', checked: ic.applyPortfolio !== false, onChange: (v) => { saveFn({ imageCompression: { applyPortfolio: v } }); } }),
    ]));
    body.appendChild(fields);
    applyActive();

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6', marginTop: '8px',
      },
    }, '💡 الجودة والحجم والأبعاد حدود قصوى: يُنقص التطبيق الجودة والأبعاد تلقائياً حتى يدخل الناتج في الحجم الأقصى. جودة وأبعاد أعلى = صور أوضح وسجلات ونسخ احتياطية أكبر.'));
  },
};
