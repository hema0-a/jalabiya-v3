/* ==========================================================================
   sections-data.js — أقسام: حقول المقاسات، أنواع الجلابيات، المخزون
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { DEFAULT_SETTINGS, LIMITS } from '../../core/config.js';

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
            className: 'btn btn--sm btn--ghost',
            type: 'button',
            onClick: () => {
              fields[idx].enabled = !enabled;
              saveFn({ measurementFields: fields });
              rebuild();
            },
          }, enabled ? '✅' : '⬜'),
          el('button', {
            className: 'btn btn--sm btn--ghost',
            type: 'button',
            onClick: () => openFieldForm(fields, idx, saveFn, rebuild),
          }, '✏️'),
          el('button', {
            className: 'btn btn--sm btn--danger',
            type: 'button',
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
      className: 'btn btn--primary btn--block',
      type: 'button',
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
        variant: 'primary',
        action: 'save',
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

    /* Toggle: تنبيه نقص القماش */
    const { createToggle } = await import('../../ui/controls.js');
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

/* --- تصدير --- */
export const DATA_SECTIONS = [
  measurementFieldsSection,
  jalabiyaTypesSection,
  inventoryLimitsSection,
];
