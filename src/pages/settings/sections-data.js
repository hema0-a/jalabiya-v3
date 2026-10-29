/* ==========================================================================
   sections-data.js — أقسام البيانات (6)
   ==========================================================================
   ⚠️ إصلاح حرج (v3.3.1):
   - لا spread للمفاتيح القديمة (`...inv`, `...dl`, `...gr`, `...pc`).
   - الحفظ بحقل واحد فقط — `settings.update` يدمج مع DB الحيّ.
   - `input` بـ debounce + `blur` — لتغطية الجوال.
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS, WEEKDAYS } from '../../core/config.js';

/* ==========================================================================
   أداة: حقل رقمي بحفظ آمن (debounce + blur)
   ========================================================================== */

/**
 * يُنشئ حقل إدخال رقمي يُحفظ تلقائيًا.
 * @param {Object} opts
 * @param {string} opts.label
 * @param {string} opts.hint
 * @param {number|string} opts.value — القيمة الأولية
 * @param {string} opts.path — المفتاح داخل patch (مثال: 'inventory')
 * @param {string} opts.field — الحقل داخل الكائن (مثال: 'minThreshold')
 * @param {Function} opts.saveFn
 * @param {Object} [opts.attrs] — سمات إضافية (min, max, step)
 * @returns {HTMLElement}
 */
function numberField(opts) {
  const {
    label, hint, value, path, field, saveFn,
    attrs = {},
  } = opts;

  const inp = el('input', {
    className: 'input', type: 'number',
    value: String(value ?? ''),
    min: attrs.min != null ? String(attrs.min) : null,
    max: attrs.max != null ? String(attrs.max) : null,
    step: attrs.step != null ? String(attrs.step) : null,
  });

  let lastSaved = String(value ?? '');
  let timer = null;

  const doSave = () => {
    const newValue = Number(inp.value);
    const strVal = String(newValue);
    if (strVal === lastSaved) return;
    lastSaved = strVal;
    /* ⚠️ حقل واحد فقط */
    saveFn({ [path]: { [field]: newValue } });
  };

  inp.addEventListener('blur', () => {
    if (timer) { clearTimeout(timer); timer = null; }
    doSave();
  });

  inp.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(doSave, 800);
  });

  return el('div', { className: 'settings-field' }, [
    el('label', { className: 'settings-field__label' }, label),
    inp,
    hint ? el('div', { className: 'settings-field__hint' }, hint) : null,
  ]);
}

/* ==========================================================================
   1. حقول المقاسات
   ========================================================================== */

const measurementFieldsSection = {
  id: 'measurements',
  icon: '📏',
  title: 'حقول المقاسات',
  async render(body, currentSettings, saveFn) {
    const fields = currentSettings.measurementFields || [];
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    function rebuild() {
      clear(list);
      if (fields.length === 0) {
        list.appendChild(el('div', {
          style: { fontSize: '13px', color: '#2E8B6F', textAlign: 'center', padding: '12px' },
        }, 'لا توجد حقول — أضف حقلاً جديداً'));
        return;
      }
      fields.forEach((f, idx) => {
        const enabled = f.enabled !== false;
        list.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', background: '#F6F1E6', borderRadius: '8px',
            opacity: enabled ? '1' : '0.5',
          },
        }, [
          el('span', { style: { flex: '1', fontSize: '14px', fontWeight: '500' } }, f.name),
          el('span', { style: { fontSize: '11px', color: '#666' } }, f.unit || 'cm'),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => {
              fields[idx].enabled = !enabled;
              saveFn({ measurementFields: fields });
              rebuild();
            },
          }, enabled ? '✅' : '⬜'),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => openFieldForm(fields, idx, saveFn, rebuild),
          }, '✏️'),
          el('button', {
            className: 'btn btn--sm btn--danger', type: 'button',
            onClick: () => {
              fields.splice(idx, 1);
              saveFn({ measurementFields: fields });
              rebuild();
            },
          }, '🗑️'),
        ]));
      });
    }

    body.appendChild(list);
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: () => openFieldForm(fields, -1, saveFn, rebuild),
    }, '➕ إضافة حقل جديد'));
    rebuild();
  },
};

function openFieldForm(fields, editIdx, saveFn, rebuild) {
  const isEdit = editIdx >= 0;
  const existing = isEdit ? fields[editIdx] : {};

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم الحقل',
    value: existing.name || '',
  });
  const unitInput = el('input', {
    className: 'input', type: 'text', placeholder: 'cm',
    value: existing.unit || 'cm',
  });

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الحقل *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الوحدة'), unitInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل حقل' : 'إضافة حقل',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const unit = unitInput.value.trim() || 'cm';
          if (isEdit) {
            fields[editIdx] = { ...fields[editIdx], name, unit };
          } else {
            fields.push({ id: 'field_' + Date.now(), name, unit, enabled: true });
          }
          saveFn({ measurementFields: fields });
          handle.close();
          rebuild();
        },
      },
    ],
  });
}

/* ==========================================================================
   2. أنواع الجلابيات
   ========================================================================== */

const jalabiyaTypesSection = {
  id: 'jalabiya-types',
  icon: '👔',
  title: 'أنواع الجلابيات',
  async render(body, currentSettings, saveFn) {
    const types = currentSettings.jalabiyaTypes || [];
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    function rebuild() {
      clear(list);
      if (types.length === 0) {
        list.appendChild(el('div', {
          style: { fontSize: '13px', color: '#2E8B6F', textAlign: 'center', padding: '12px' },
        }, 'لا توجد أنواع — أضف نوعاً جديداً'));
        return;
      }
      types.forEach((t, idx) => {
        list.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', background: '#F6F1E6', borderRadius: '8px',
          },
        }, [
          el('div', { style: { flex: '1' } }, [
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, t.name),
            t.price ? el('div', { style: { fontSize: '11px', color: '#B8863B' } }, t.price + ' ج.م') : null,
          ]),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => openTypeForm(types, idx, saveFn, rebuild),
          }, '✏️'),
          el('button', {
            className: 'btn btn--sm btn--danger', type: 'button',
            onClick: () => {
              types.splice(idx, 1);
              saveFn({ jalabiyaTypes: types });
              rebuild();
            },
          }, '🗑️'),
        ]));
      });
    }

    body.appendChild(list);
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: () => openTypeForm(types, -1, saveFn, rebuild),
    }, '➕ إضافة نوع جديد'));
    rebuild();
  },
};

function openTypeForm(types, editIdx, saveFn, rebuild) {
  const isEdit = editIdx >= 0;
  const existing = isEdit ? types[editIdx] : {};

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: جلابية صيفي',
    value: existing.name || '',
  });
  const priceInput = el('input', {
    className: 'input', type: 'number', placeholder: '0', min: '0',
    value: existing.price || '',
  });
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'السعر (ج.م)'), priceInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل نوع' : 'إضافة نوع',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = {
            name,
            price: Number(priceInput.value) || 0,
            notes: notesInput.value.trim(),
          };
          if (isEdit) {
            types[editIdx] = { ...types[editIdx], ...data };
          } else {
            types.push({ id: 'type_' + Date.now(), ...data });
          }
          saveFn({ jalabiyaTypes: types });
          handle.close();
          rebuild();
        },
      },
    ],
  });
}

/* ==========================================================================
   3. المخزون والحدود
   ========================================================================== */

const inventoryLimitsSection = {
  id: 'inventory-limits',
  icon: '📦',
  title: 'المخزون والحدود',
  async render(body, currentSettings, saveFn) {
    const inv = currentSettings.inventory || DEFAULT_SETTINGS.inventory;

    body.appendChild(numberField({
      label: 'الحد الأدنى للتنبيه',
      hint: 'عند نزول الكمية تحت هذا الرقم — يظهر تنبيه',
      value: inv.minThreshold || 5,
      path: 'inventory',
      field: 'minThreshold',
      saveFn,
      attrs: { min: 1 },
    }));

    /* Toggle 1 — حقل واحد فقط */
    const t1 = createToggle({
      label: 'تنبيه عند نقص القماش',
      checked: inv.alertOnFabricLow !== false,
      onChange: (v) => saveFn({ inventory: { alertOnFabricLow: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تنبيه عند نقص القماش'),
      t1,
    ]));

    /* Toggle 2 — حقل واحد فقط */
    const t2 = createToggle({
      label: 'تنبيه عند نقص المخزون',
      checked: inv.alertOnProductLow !== false,
      onChange: (v) => saveFn({ inventory: { alertOnProductLow: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تنبيه عند نقص المخزون'),
      t2,
    ]));
  },
};

/* ==========================================================================
   4. الحد اليومي + يوم الإجازة
   ========================================================================== */

const dailyLimitSection = {
  id: 'daily-limit',
  icon: '📊',
  title: 'الحد اليومي + يوم الإجازة',
  async render(body, currentSettings, saveFn) {
    const dl = currentSettings.dailyLimit || DEFAULT_SETTINGS.dailyLimit;

    body.appendChild(numberField({
      label: 'الحد الأقصى للطلبات اليومية (ج.م)',
      hint: 'تنبيه عند تجاوز هذا الرقم — لا يمنع الإضافة',
      value: dl.dailyOrderLimit || 700,
      path: 'dailyLimit',
      field: 'dailyOrderLimit',
      saveFn,
      attrs: { min: 0 },
    }));

    body.appendChild(numberField({
      label: 'تنبيه استلام القماش قبل (أيام)',
      value: dl.fabricPickupAlertDays || 2,
      path: 'dailyLimit',
      field: 'fabricPickupAlertDays',
      saveFn,
      attrs: { min: 0, max: 30 },
    }));

    /* يوم الإجازة */
    body.appendChild(el('div', {
      style: {
        marginTop: '12px', paddingTop: '12px',
        borderTop: '1px dashed rgba(31,109,87,0.15)',
      },
    }, [
      el('h3', {
        style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', margin: '0 0 8px 0' },
      }, '🏖️ يوم الإجازة الأسبوعي'),
    ]));

    const dayOffSelect = el('select', { className: 'select' });
    WEEKDAYS.forEach((d) => {
      const o = el('option', { value: String(d.id) }, d.name);
      if (Number(dl.dayOffWeekday ?? 0) === d.id) o.selected = true;
      dayOffSelect.appendChild(o);
    });
    dayOffSelect.addEventListener('change', () => {
      /* ⚠️ حقل واحد فقط */
      saveFn({ dailyLimit: { dayOffWeekday: Number(dayOffSelect.value) } });
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'اليوم الأسبوعي للإجازة'),
      dayOffSelect,
      el('div', { className: 'settings-field__hint' }, 'يُبرَز في التقويم بلون مميز — ويُعطَّل في نموذج الطلبات'),
    ]));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6',
        marginTop: '8px',
      },
    }, '💡 الحد اليومي يظهر في صفحة الطلبات (تنبيه). يوم الإجازة يُطبَّق على التقويم + اقتراح مواعيد التسليم.'));
  },
};

/* ==========================================================================
   5. تجميع الطلبات المتشابهة
   ========================================================================== */

const groupingSection = {
  id: 'grouping',
  icon: '🎯',
  title: 'تجميع الطلبات المتشابهة',
  async render(body, currentSettings, saveFn) {
    const gr = currentSettings.grouping || DEFAULT_SETTINGS.grouping;

    const mainToggle = createToggle({
      label: 'تفعيل التجميع',
      checked: gr.enabled === true,
      onChange: (v) => saveFn({ grouping: { enabled: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تفعيل التجميع'),
      mainToggle,
    ]));

    body.appendChild(numberField({
      label: 'نسبة التقارب في القياسات (سم)',
      hint: 'مثال: 2 سم تعني أن القياسات المتقاربة بحدود 2 سم تُجمَّع',
      value: gr.tolerance || 2,
      path: 'grouping',
      field: 'tolerance',
      saveFn,
      attrs: { min: 0, max: 20 },
    }));

    const typeToggle = createToggle({
      label: 'نفس النوع فقط',
      checked: gr.sameTypeOnly !== false,
      onChange: (v) => saveFn({ grouping: { sameTypeOnly: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'التجميع لنفس النوع فقط'),
      typeToggle,
    ]));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6',
        marginTop: '8px',
      },
    }, '💡 يظهر زر "🎯 تجميع" في صفحة الطلبات — يعرض الطلبات القابلة للتجميع في دفعات موحدة.'));
  },
};

/* ==========================================================================
   6. حاسبة التسعير (تخصيص)
   ========================================================================== */

const pricingCalculatorSection = {
  id: 'pricing-calculator',
  icon: '🧮',
  title: 'حاسبة التسعير',
  async render(body, currentSettings, saveFn) {
    const pc = currentSettings.pricingCalculator || DEFAULT_SETTINGS.pricingCalculator;

    function toggleRow(label, key, hint = '') {
      const t = createToggle({
        label,
        checked: pc[key] !== false,
        onChange: (v) => saveFn({ pricingCalculator: { [key]: v } }),
      });
      return el('div', { className: 'settings-row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { className: 'settings-row__label' }, label),
          hint ? el('div', { className: 'settings-row__hint' }, hint) : null,
        ]),
        t,
      ]);
    }

    body.appendChild(el('h4', {
      style: { fontSize: '13px', color: '#123C2F', margin: '0 0 8px 0', fontWeight: '600' },
    }, '📊 أقسام الحساب'));

    body.appendChild(toggleRow('🧵 تفعيل حساب القماش', 'enableFabric', 'الأمتار × سعر المتر'));
    body.appendChild(toggleRow('👷 تفعيل حساب العمال', 'enableLabor', 'الساعات × سعر الساعة'));
    body.appendChild(toggleRow('📦 تفعيل المصاريف الإضافية', 'enableExtras', 'خيوط، أزرار، إكسسوارات'));
    body.appendChild(toggleRow('💸 تفعيل المصاريف غير المباشرة', 'enableOverhead', 'إيجار، كهرباء، إلخ'));

    /* هامش الربح */
    body.appendChild(el('div', {
      style: {
        marginTop: '12px', paddingTop: '12px',
        borderTop: '1px dashed rgba(31,109,87,0.15)',
      },
    }, [
      el('h4', {
        style: { fontSize: '13px', color: '#123C2F', margin: '0 0 8px 0', fontWeight: '600' },
      }, '📈 هامش الربح'),
    ]));

    body.appendChild(numberField({
      label: 'هامش الربح الافتراضي (%)',
      value: pc.defaultMargin || 30,
      path: 'pricingCalculator',
      field: 'defaultMargin',
      saveFn,
      attrs: { min: 0, max: 500 },
    }));

    /* أزرار النسب الجاهزة */
    const presets = Array.isArray(pc.marginPresets) ? [...pc.marginPresets] : [20, 30, 50, 100];
    const presetsList = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    function rebuildPresets() {
      clear(presetsList);
      if (presets.length === 0) {
        presetsList.appendChild(el('div', {
          style: { fontSize: '12px', color: '#999', textAlign: 'center', padding: '8px' },
        }, 'لا توجد نسب — أضف نسبة'));
        return;
      }
      presets.forEach((p, idx) => {
        presetsList.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 10px', background: '#F6F1E6', borderRadius: '8px',
          },
        }, [
          el('span', { style: { flex: '1', fontSize: '14px', fontWeight: '500' } }, p + '%'),
          el('button', {
            className: 'btn btn--sm btn--danger', type: 'button',
            onClick: () => {
              presets.splice(idx, 1);
              saveFn({ pricingCalculator: { marginPresets: [...presets] } });
              rebuildPresets();
            },
          }, '🗑️'),
        ]));
      });
    }

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'أزرار النسب الجاهزة'),
      presetsList,
      el('button', {
        className: 'btn btn--secondary btn--sm', type: 'button',
        style: { marginTop: '6px' },
        onClick: () => {
          const value = window.prompt('أدخل النسبة (رقم):');
          if (value === null) return;
          const num = Number(value);
          if (!isFinite(num) || num < 0 || num > 500) return toast.warning('قيمة غير صالحة');
          if (presets.includes(num)) return toast.warning('النسبة موجودة');
          presets.push(num);
          presets.sort((a, b) => a - b);
          saveFn({ pricingCalculator: { marginPresets: [...presets] } });
          rebuildPresets();
        },
      }, '➕ إضافة نسبة'),
    ]));
    rebuildPresets();

    /* toggles أخيرة */
    body.appendChild(el('div', {
      style: {
        marginTop: '12px', paddingTop: '12px',
        borderTop: '1px dashed rgba(31,109,87,0.15)',
      },
    }, [
      toggleRow('💾 حفظ سجل الحسابات', 'saveHistory', 'يحفظ آخر 50 حساب في المتصفح'),
      toggleRow('📋 تفعيل زر "إنشاء طلب"', 'enableCreateOrder', 'ينشئ طلباً مباشرة من الحساب'),
    ]));
  },
};

/* --- تصدير --- */
export const DATA_SECTIONS = [
  measurementFieldsSection,
  jalabiyaTypesSection,
  inventoryLimitsSection,
  dailyLimitSection,
  groupingSection,
  pricingCalculatorSection,
];
