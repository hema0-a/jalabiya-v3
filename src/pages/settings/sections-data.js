/* ==========================================================================
   sections-data.js — أقسام البيانات (5)
   ==========================================================================
   حقول المقاسات، أنواع الجلابيات، المخزون، الحد اليومي، تجميع الطلبات
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';

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
            padding: '8px 10px', background: '#F6F1E6',
            borderRadius: '8px', opacity: enabled ? '1' : '0.5',
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

  const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'اسم الحقل', value: existing.name || '' });
  const unitInput = el('input', { className: 'input', type: 'text', placeholder: 'cm', value: existing.unit || 'cm' });

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
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = { id: 'field_' + Date.now(), name, unit: unitInput.value.trim() || 'cm', enabled: true };
          if (isEdit) fields[editIdx] = { ...fields[editIdx], name: data.name, unit: data.unit };
          else fields.push(data);
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

  const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'مثال: جلابية صيفي', value: existing.name || '' });
  const priceInput = el('input', { className: 'input', type: 'number', placeholder: '0', min: '0', value: existing.price || '' });
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
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const data = { name, price: Number(priceInput.value) || 0, notes: notesInput.value.trim() };
          if (isEdit) types[editIdx] = { ...types[editIdx], ...data };
          else types.push({ id: 'type_' + Date.now(), ...data });
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

    const thresholdInput = el('input', {
      className: 'input', type: 'number', min: '1',
      value: String(inv.minThreshold || 5),
    });
    thresholdInput.addEventListener('blur', () => {
      saveFn({ inventory: { ...inv, minThreshold: Number(thresholdInput.value) || 5 } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'الحد الأدنى للتنبيه'),
      thresholdInput,
      el('div', { className: 'settings-field__hint' }, 'عند نزول الكمية تحت هذا الرقم — يظهر تنبيه'),
    ]));

    const t1 = createToggle({
      label: 'تنبيه عند نقص القماش',
      checked: inv.alertOnFabricLow !== false,
      onChange: (v) => saveFn({ inventory: { ...inv, alertOnFabricLow: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تنبيه عند نقص القماش'),
      t1,
    ]));

    const t2 = createToggle({
      label: 'تنبيه عند نقص المخزون',
      checked: inv.alertOnProductLow !== false,
      onChange: (v) => saveFn({ inventory: { ...inv, alertOnProductLow: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تنبيه عند نقص المخزون'),
      t2,
    ]));
  },
};

/* ==========================================================================
   4. الحد اليومي
   ========================================================================== */
const dailyLimitSection = {
  id: 'daily-limit',
  icon: '📊',
  title: 'الحد اليومي',
  async render(body, currentSettings, saveFn) {
    const dl = currentSettings.dailyLimit || DEFAULT_SETTINGS.dailyLimit;

    const limitInput = el('input', {
      className: 'input', type: 'number', min: '0',
      value: String(dl.dailyOrderLimit || 700),
    });
    limitInput.addEventListener('blur', () => {
      saveFn({ dailyLimit: { ...dl, dailyOrderLimit: Number(limitInput.value) || 0 } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'الحد الأقصى للطلبات اليومية (ج.م)'),
      limitInput,
      el('div', { className: 'settings-field__hint' }, 'تنبيه عند تجاوز هذا الرقم — لا يمنع الإضافة'),
    ]));

    const pickupInput = el('input', {
      className: 'input', type: 'number', min: '0', max: '30',
      value: String(dl.fabricPickupAlertDays || 2),
    });
    pickupInput.addEventListener('blur', () => {
      saveFn({ dailyLimit: { ...dl, fabricPickupAlertDays: Number(pickupInput.value) || 2 } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'تنبيه استلام القماش قبل (أيام)'),
      pickupInput,
    ]));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6', marginTop: '8px',
      },
    }, '💡 التنبيه يظهر في صفحة الطلبات — يمكنك المتابعة دائماً (لا يمنع الحفظ).'));
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
      onChange: (v) => saveFn({ grouping: { ...gr, enabled: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تفعيل التجميع'),
      mainToggle,
    ]));

    const toleranceInput = el('input', {
      className: 'input', type: 'number', min: '0', max: '20',
      value: String(gr.tolerance || 2),
    });
    toleranceInput.addEventListener('blur', () => {
      saveFn({ grouping: { ...gr, tolerance: Number(toleranceInput.value) || 2 } });
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'نسبة التقارب في القياسات (سم)'),
      toleranceInput,
      el('div', { className: 'settings-field__hint' }, 'مثال: 2 سم تعني أن القياسات المتقاربة بحدود 2 سم تُجمَّع'),
    ]));

    const typeToggle = createToggle({
      label: 'نفس النوع فقط',
      checked: gr.sameTypeOnly !== false,
      onChange: (v) => saveFn({ grouping: { ...gr, sameTypeOnly: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'التجميع لنفس النوع فقط'),
      typeToggle,
    ]));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6', marginTop: '8px',
      },
    }, '💡 يظهر زر "🎯 تجميع" في صفحة الطلبات — يعرض الطلبات القابلة للتجميع في دفعات موحدة.'));
  },
};

/* --- تصدير --- */
export const DATA_SECTIONS = [
  measurementFieldsSection,
  jalabiyaTypesSection,
  inventoryLimitsSection,
  dailyLimitSection,
  groupingSection,
];
