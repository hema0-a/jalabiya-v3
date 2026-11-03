/* ==========================================================================
   sections-data.js — أقسام البيانات (7)
   ==========================================================================
   ⚠️ إصلاح حرج (v3.3.1):
   - لا spread للمفاتيح القديمة (`...inv`, `...dl`, `...gr`, `...pc`).
   - الحفظ بحقل واحد فقط — `settings.update` يدمج مع DB الحيّ.
   - `input` بـ debounce + `blur` — لتغطية الجوال.
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { shareCatalog } from '../../ui/quick-preview.js';
import { portfolio as portfolioRepo } from '../../data/repos/portfolio.js';
import { createToggle } from '../../ui/controls.js';
import { resolveDayOffSettings, normalizeHolidays, expandDateRange, MAX_HOLIDAYS } from '../../core/day-off.js';
import { dayKey } from '../../core/day-math.js';
import { stockAlertOptions, STOCK_ALERT_MODES, STOCK_REPEAT_MODES } from '../../services/alert-rules.js';
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

    /* v3.5.31: ترتيب الحقول (يظهر بنفس الترتيب في نموذج العميل) */
    function moveField(idx, dir) {
      const to = idx + dir;
      if (to < 0 || to >= fields.length) return;
      const tmp = fields[idx]; fields[idx] = fields[to]; fields[to] = tmp;
      saveFn({ measurementFields: fields });
      rebuild();
    }

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
          el('span', { style: { flex: '1', fontSize: '14px', fontWeight: '500' } }, (f.required === true ? '⭐ ' : '') + f.name),
          el('span', { style: { fontSize: '11px', color: '#666' } }, f.unit || 'cm'),
          el('span', { style: { display: 'flex', flexDirection: 'column' } }, [
            el('button', {
              className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'move-up', 'aria-label': 'تحريك لأعلى',
              disabled: idx === 0 ? 'disabled' : null, style: { padding: '0 8px', minHeight: '22px', lineHeight: '1' },
              onClick: () => moveField(idx, -1),
            }, '▲'),
            el('button', {
              className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'move-down', 'aria-label': 'تحريك لأسفل',
              disabled: idx === fields.length - 1 ? 'disabled' : null, style: { padding: '0 8px', minHeight: '22px', lineHeight: '1' },
              onClick: () => moveField(idx, 1),
            }, '▼'),
          ]),
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

  const reqInput = el('input', { type: 'checkbox', 'data-role': 'field-required' });
  reqInput.checked = existing.required === true;

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الحقل *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الوحدة'), unitInput]),
    el('label', { className: 'field', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      reqInput, el('span', { style: { fontSize: '13px' } }, '⭐ مقاس مطلوب (لا يُحفظ العميل بدونه)'),
    ]),
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
          const required = reqInput.checked;
          if (isEdit) {
            fields[editIdx] = { ...fields[editIdx], name, unit, required };
          } else {
            fields.push({ id: 'field_' + Date.now(), name, unit, enabled: true, required });
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

    /* v3.5.31+: ترتيب الأنواع (يظهر الترتيب نفسه في اقتراحات الطلب والكتالوج) */
    function moveType(idx, dir) {
      const to = idx + dir;
      if (to < 0 || to >= types.length) return;
      const tmp = types[idx]; types[idx] = types[to]; types[to] = tmp;
      saveFn({ jalabiyaTypes: types });
      rebuild();
    }

    function rebuild() {
      clear(list);
      if (types.length === 0) {
        list.appendChild(el('div', {
          style: { fontSize: '13px', color: '#2E8B6F', textAlign: 'center', padding: '12px' },
        }, 'لا توجد أنواع — أضف نوعاً جديداً'));
        return;
      }
      types.forEach((t, idx) => {
        const isHidden = t.hidden === true;
        list.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', background: '#F6F1E6', borderRadius: '8px',
            opacity: isHidden ? '0.5' : '1',
          },
        }, [
          el('div', { style: { flex: '1' } }, [
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, t.name + (isHidden ? ' (مخفي)' : '')),
            t.price ? el('div', { style: { fontSize: '11px', color: '#B8863B' } }, t.price + ' ج.م' + (t.portfolioId ? ' · 🖼️' : '')) : null,
          ]),
          el('span', { style: { display: 'flex', flexDirection: 'column' } }, [
            el('button', {
              className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'move-up', 'aria-label': 'تحريك لأعلى',
              disabled: idx === 0 ? 'disabled' : null, style: { padding: '0 8px', minHeight: '22px', lineHeight: '1' },
              onClick: () => moveType(idx, -1),
            }, '▲'),
            el('button', {
              className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'move-down', 'aria-label': 'تحريك لأسفل',
              disabled: idx === types.length - 1 ? 'disabled' : null, style: { padding: '0 8px', minHeight: '22px', lineHeight: '1' },
              onClick: () => moveType(idx, 1),
            }, '▼'),
          ]),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'toggle-hidden',
            'aria-label': isHidden ? 'إظهار النوع' : 'إخفاء النوع',
            onClick: () => {
              types[idx] = { ...types[idx], hidden: !isHidden };
              saveFn({ jalabiyaTypes: types });
              rebuild();
            },
          }, isHidden ? '🙈' : '👁️'),
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
    body.appendChild(el('button', {
      className: 'btn btn--secondary btn--block', type: 'button',
      style: { marginTop: '6px' },
      onClick: () => shareCatalog({ types }),
    }, '📤 مشاركة كتالوج الأسعار'));
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

  /* --- صورة من معرض الأعمال (v3.3.51): تُربط بالنوع وتظهر في كتالوج الأسعار --- */
  let portfolioId = existing.portfolioId || null;
  const picPreview = el('div', {
    style: { width: '96px', height: '96px', borderRadius: '10px', background: '#F6F1E6',
      border: '2px dashed #E5DDD0', overflow: 'hidden', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#999' },
  }, 'بدون صورة');
  async function refreshPic() {
    clear(picPreview);
    let item = null;
    if (portfolioId) { try { item = await portfolioRepo.find(portfolioId); } catch { item = null; } }
    if (item && (item.thumbnail || item.image)) {
      picPreview.appendChild(el('img', { src: item.thumbnail || item.image, alt: item.title || '',
        style: { width: '100%', height: '100%', objectFit: 'cover' } }));
    } else {
      if (portfolioId) portfolioId = null;   /* الصورة اتحذفت من المعرض */
      picPreview.textContent = 'بدون صورة';
    }
  }
  async function openPicker() {
    let items = [];
    try { items = await portfolioRepo.list(); } catch { items = []; }
    items = items.filter((x) => x && (x.thumbnail || x.image));
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' } });
    if (items.length === 0) {
      grid.appendChild(el('div', { style: { gridColumn: '1 / -1', fontSize: '13px', color: '#666', textAlign: 'center', padding: '12px' } },
        'معرض الأعمال فاضي. أضف صوراً من صفحة معرض الأعمال أولاً.'));
    }
    items.forEach((it) => {
      grid.appendChild(el('button', {
        type: 'button',
        style: { border: it.id === portfolioId ? '3px solid #1F6D57' : '1px solid #E5DDD0',
          borderRadius: '10px', padding: '0', overflow: 'hidden', background: '#fff', cursor: 'pointer' },
        onClick: () => { portfolioId = it.id; pickerHandle.close(); refreshPic(); },
      }, [
        el('img', { src: it.thumbnail || it.image, alt: it.title || '', decoding: 'async',
          style: { width: '100%', height: '90px', objectFit: 'cover', display: 'block' } }),
        el('div', { style: { fontSize: '11px', padding: '3px 4px', color: '#123C2F' } }, it.title || ''),
      ]));
    });
    const pickerHandle = modal.open({
      title: '🖼️ اختر صورة من المعرض', body: grid, closable: true, variant: 'sheet',
      actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => pickerHandle.close() }],
    });
  }
  const picField = el('div', { className: 'field' }, [
    el('label', { className: 'field__label' }, '🖼️ صورة النوع (من معرض الأعمال)'),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      picPreview,
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
        el('button', { type: 'button', className: 'btn btn--sm btn--secondary', onClick: openPicker }, 'اختيار من المعرض'),
        el('button', { type: 'button', className: 'btn btn--sm btn--ghost',
          onClick: () => { portfolioId = null; refreshPic(); } }, 'إزالة الصورة'),
      ]),
    ]),
  ]);
  refreshPic();

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'السعر (ج.م)'), priceInput]),
    picField,
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
            portfolioId: portfolioId || null,
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

    /* --- v3.5.33: تنبيه «نفد» منفصل --- */
    const t3 = createToggle({
      label: 'تنبيه «نفد» منفصل',
      checked: inv.separateOutOfStock === true,
      onChange: (v) => saveFn({ inventory: { separateOutOfStock: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'تنبيه «نفد» منفصل (للأصناف التي وصلت للصفر)'),
      t3,
    ]));

    /* --- v3.5.33: وضع التنبيه + تكرار التذكير (بطاقات اختيار) --- */
    const opts = stockAlertOptions(currentSettings);
    function choiceField(label, hint, items, key, active, field) {
      const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(' + items.length + ', 1fr)', gap: '6px' } });
      items.forEach((it) => {
        grid.appendChild(el('button', {
          type: 'button',
          className: 'settings-theme-card' + (active === it.id ? ' settings-theme-card--active' : ''),
          ['data-' + key]: it.id,
          onClick: () => {
            saveFn({ inventory: { [field]: it.id } });
            grid.querySelectorAll('button[data-' + key + ']').forEach((b) => {
              b.classList.toggle('settings-theme-card--active', b.getAttribute('data-' + key) === it.id);
            });
          },
        }, [el('span', { className: 'settings-theme-card__name', style: { fontSize: '12px' } }, it.name)]));
      });
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label),
        grid,
        hint ? el('div', { className: 'settings-field__hint' }, hint) : null,
      ]);
    }
    body.appendChild(choiceField('وضع التنبيه', 'مركز التنبيهات داخل التطبيق يعرض النقص دائماً؛ الإشعار يصلك على الجهاز نفسه.',
      STOCK_ALERT_MODES, 'stock-mode', opts.mode, 'alertMode'));
    body.appendChild(choiceField('تكرار تذكير الإشعار', 'يخص إشعار الجهاز فقط (وليس مركز التنبيهات).',
      STOCK_REPEAT_MODES, 'stock-repeat', opts.repeat, 'repeat'));
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

    /* v3.5.34: أيام الإجازة الأسبوعية (أكثر من يوم) + إجازات بتاريخ محدد */
    body.appendChild(el('div', {
      style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed rgba(31,109,87,0.15)' },
    }, [
      el('h3', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', margin: '0 0 8px 0' } }, '🏖️ أيام الإجازة الأسبوعية'),
    ]));

    const wkSel = new Set(resolveDayOffSettings(dl).weekdays);
    const wkGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' } });
    const wkNote = el('div', { className: 'settings-field__hint', 'data-role': 'dayoff-note' });
    function wkRefresh() {
      wkGrid.querySelectorAll('button[data-wd]').forEach((b) => {
        b.classList.toggle('settings-theme-card--active', wkSel.has(Number(b.dataset.wd)));
      });
      wkNote.textContent = wkSel.size === 0
        ? 'لا توجد إجازة أسبوعية: تُعامل كل الأيام أيام عمل.'
        : 'إجازة كل: ' + WEEKDAYS.filter((d) => wkSel.has(d.id)).map((d) => d.name).join('، ') + ' — تُبرَز في التقويم وتُتخطّى في جدولة التسليم.';
    }
    WEEKDAYS.forEach((d) => {
      wkGrid.appendChild(el('button', {
        type: 'button', className: 'settings-theme-card', 'data-wd': String(d.id),
        onClick: () => {
          const next = new Set(wkSel);
          if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
          if (next.size >= 7) { toast.warning('لا يمكن أن تكون كل أيام الأسبوع إجازة'); return; }
          wkSel.clear(); next.forEach((x) => wkSel.add(x));
          const arr = Array.from(wkSel).sort((x, y) => x - y);
          /* ⚠️ حقول الإجازة فقط (dayOffWeekday القديم يُحدَّث للتوافق مع الإصدارات الأقدم؛ -1 = بلا إجازة) */
          saveFn({ dailyLimit: { dayOffWeekdays: arr, dayOffWeekday: arr.length ? arr[0] : -1 } });
          wkRefresh();
        },
      }, [el('span', { className: 'settings-theme-card__name', style: { fontSize: '12px' } }, d.name)]));
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'اختر يوماً أو أكثر (اضغط مرة أخرى لإلغائه)'),
      wkGrid, wkNote,
    ]));
    wkRefresh();

    /* --- إجازات بتاريخ محدد (عيد، مناسبة...) --- */
    body.appendChild(el('div', {
      style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed rgba(31,109,87,0.15)' },
    }, [
      el('h3', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', margin: '0 0 8px 0' } }, '📅 إجازات بتاريخ محدد'),
    ]));
    let holidays = normalizeHolidays(dl.holidays);
    const hList = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' } });
    const todayKey = dayKey(Date.now());
    function saveHolidays() { saveFn({ dailyLimit: { holidays } }); }
    function hRebuild() {
      clear(hList);
      if (holidays.length === 0) {
        hList.appendChild(el('div', { style: { fontSize: '13px', color: '#2E8B6F', textAlign: 'center', padding: '8px' } }, 'لا توجد إجازات بتاريخ محدد'));
        return;
      }
      holidays.forEach((h) => {
        const [y, m, d] = h.date.split('-').map(Number);
        const past = h.date < todayKey;
        hList.appendChild(el('div', {
          'data-holiday': h.date,
          style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#F6F1E6', borderRadius: '8px', opacity: past ? '0.5' : '1' },
        }, [
          el('div', { style: { flex: '1' } }, [
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, h.date + ' — ' + (WEEKDAYS.find((w) => w.id === new Date(y, m - 1, d).getDay()) || {}).name),
            h.name || past ? el('div', { style: { fontSize: '11px', color: '#666' } }, (h.name || '') + (past ? (h.name ? ' · ' : '') + 'منتهية' : '')) : null,
          ]),
          el('button', {
            className: 'btn btn--sm btn--danger', type: 'button', 'data-action': 'remove-holiday', 'aria-label': 'حذف الإجازة',
            onClick: () => { holidays = holidays.filter((x) => x.date !== h.date); saveHolidays(); hRebuild(); },
          }, '🗑️'),
        ]));
      });
      if (holidays.some((h) => h.date < todayKey)) {
        hList.appendChild(el('button', {
          className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'clean-holidays',
          onClick: () => { holidays = holidays.filter((x) => x.date >= todayKey); saveHolidays(); hRebuild(); },
        }, '🧹 حذف الإجازات المنتهية'));
      }
    }
    body.appendChild(hList);
    const hFrom = el('input', { className: 'input', type: 'date', 'data-role': 'holiday-from' });
    const hTo = el('input', { className: 'input', type: 'date', 'data-role': 'holiday-to' });
    const hName = el('input', { className: 'input', type: 'text', placeholder: 'الاسم (اختياري) مثل: عيد الفطر', maxlength: '30', 'data-role': 'holiday-name' });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'من تاريخ'), hFrom,
      el('label', { className: 'settings-field__label', style: { marginTop: '6px' } }, 'إلى تاريخ (اتركه فارغاً ليوم واحد)'), hTo,
      el('div', { style: { height: '6px' } }), hName,
      el('button', {
        className: 'btn btn--primary btn--block', type: 'button', style: { marginTop: '8px' }, 'data-action': 'add-holiday',
        onClick: () => {
          if (hTo.value && hFrom.value && hTo.value < hFrom.value) { toast.warning('تاريخ النهاية قبل البداية'); return; }
          const days = expandDateRange(hFrom.value, hTo.value);
          if (days.length === 0) { toast.warning('اختر تاريخ بداية صالحاً'); return; }
          const name = hName.value;
          const have = new Set(holidays.map((x) => x.date));
          const fresh = days.filter((k) => !have.has(k));
          if (fresh.length === 0) { toast.info('هذه الأيام مضافة بالفعل'); return; }
          if (holidays.length + fresh.length > MAX_HOLIDAYS) { toast.warning('الحد الأقصى ' + MAX_HOLIDAYS + ' يوم إجازة'); return; }
          holidays = normalizeHolidays(holidays.concat(fresh.map((k) => ({ date: k, name }))));
          saveHolidays(); hRebuild();
          hFrom.value = ''; hTo.value = ''; hName.value = '';
          toast.success('أُضيف ' + fresh.length + ' يوم إجازة');
        },
      }, '➕ إضافة إجازة'),
      el('div', { className: 'settings-field__hint' }, 'تُتخطّى هذه الأيام في جدولة التسليم وتظهر في التقويم وشريط السعة كإجازة. الإضافة حتى 31 يوماً في المرة.'),
    ]));
    hRebuild();

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6',
        marginTop: '8px',
      },
    }, '💡 الحد اليومي يظهر في صفحة الطلبات (تنبيه). أيام الإجازة تُطبَّق على التقويم + اقتراح مواعيد التسليم.'));
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

    /* --- v3.5.35: خيارات أدق للتجميع --- */
    const sc = createToggle({
      label: 'طلبات نفس العميل',
      checked: gr.sameCustomer !== false,
      onChange: (v) => saveFn({ grouping: { sameCustomer: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'عرض مجموعات «طلبات نفس العميل»'),
      sc,
    ]));
    const sm = createToggle({
      label: 'مقاسات متقاربة',
      checked: gr.sizeMatch !== false,
      onChange: (v) => saveFn({ grouping: { sizeMatch: v } }),
    });
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { className: 'settings-row__label' }, 'عرض مجموعات «عملاء بمقاسات متقاربة»'),
      sm,
    ]));

    body.appendChild(numberField({
      label: 'أقل عدد من المقاسات المشتركة (1 إلى 5)',
      hint: 'لا يُعدّ عميلان متقاربين إلا إذا اشتركا في هذا العدد على الأقل من المقاسات المسجَّلة. الأقل = تجميع أوسع بأدلة أضعف.',
      value: gr.minShared || 2,
      path: 'grouping',
      field: 'minShared',
      saveFn,
      attrs: { min: 1, max: 5 },
    }));

    const fieldOpts = (Array.isArray(currentSettings.measurementFields) ? currentSettings.measurementFields : []).filter((f) => f && f.id && f.enabled !== false);
    if (fieldOpts.length > 0) {
      const sel = new Set(Array.isArray(gr.fields) ? gr.fields : []);
      const fGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' } });
      const fNote = el('div', { className: 'settings-field__hint', 'data-role': 'grouping-fields-note' });
      const refresh = () => {
        fGrid.querySelectorAll('button[data-gf]').forEach((b) => b.classList.toggle('settings-theme-card--active', sel.has(b.dataset.gf)));
        fNote.textContent = sel.size === 0 ? 'لم تختر شيئاً: تُقارن كل المقاسات.' : 'تُقارن هذه المقاسات فقط (' + sel.size + ').';
      };
      fieldOpts.forEach((f) => {
        fGrid.appendChild(el('button', {
          type: 'button', className: 'settings-theme-card', 'data-gf': f.id,
          onClick: () => {
            if (sel.has(f.id)) sel.delete(f.id); else sel.add(f.id);
            saveFn({ grouping: { fields: Array.from(sel) } });
            refresh();
          },
        }, [el('span', { className: 'settings-theme-card__name', style: { fontSize: '12px' } }, f.name)]));
      });
      body.appendChild(el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, 'المقاسات التي تُقارَن'),
        fGrid, fNote,
      ]));
      refresh();
    }

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

    /* --- v3.5.36: قيم افتراضية للحقول --- */
    body.appendChild(el('div', {
      style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed rgba(31,109,87,0.15)' },
    }, [
      el('h4', { style: { fontSize: '13px', color: '#123C2F', margin: '0 0 8px 0', fontWeight: '600' } }, '✍️ قيم تُملأ تلقائياً في الحاسبة'),
    ]));
    [
      ['عدد الأمتار الافتراضي', 'defaultMeters', 3, 0.5],
      ['سعر المتر الافتراضي (ج.م)', 'defaultMeterPrice', 0, 1],
      ['سعر الساعة الافتراضي (ج.م)', 'defaultHourlyRate', 0, 1],
      ['مصاريف غير مباشرة افتراضية (ج.م)', 'defaultOverhead', 0, 1],
    ].forEach(([label, field, dflt, step]) => {
      body.appendChild(numberField({
        label, value: pc[field] != null ? pc[field] : dflt, path: 'pricingCalculator', field, saveFn,
        attrs: { min: 0, step },
      }));
    });

    /* --- تقريب السعر النهائي --- */
    const roundGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' } });
    [[0, 'بدون'], [5, '5 ج'], [10, '10 ج'], [50, '50 ج']].forEach(([v, name]) => {
      roundGrid.appendChild(el('button', {
        type: 'button',
        className: 'settings-theme-card' + (Number(pc.roundTo || 0) === v ? ' settings-theme-card--active' : ''),
        'data-round': String(v),
        onClick: () => {
          saveFn({ pricingCalculator: { roundTo: v } });
          roundGrid.querySelectorAll('button[data-round]').forEach((b) => b.classList.toggle('settings-theme-card--active', Number(b.dataset.round) === v));
        },
      }, [el('span', { className: 'settings-theme-card__name' }, name)]));
    });
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'تقريب سعر البيع لأقرب'),
      roundGrid,
      el('div', { className: 'settings-field__hint' }, 'مثال: 1243 ج يصبح 1245 عند «5 ج». الربح يُعدَّل ليبقى السعر = التكلفة + الربح.'),
    ]));

    body.appendChild(numberField({
      label: 'عدد الحسابات المحفوظة في السجل (10 إلى 200)',
      hint: 'يُحذف الأقدم عند تجاوز العدد',
      value: pc.maxHistoryItems || 50, path: 'pricingCalculator', field: 'maxHistoryItems', saveFn,
      attrs: { min: 10, max: 200 },
    }));

    /* toggles أخيرة */
    body.appendChild(el('div', {
      style: {
        marginTop: '12px', paddingTop: '12px',
        borderTop: '1px dashed rgba(31,109,87,0.15)',
      },
    }, [
      toggleRow('💾 حفظ سجل الحسابات', 'saveHistory', 'يحفظ آخر حساباتك في المتصفح (العدد من الإعداد أدناه)'),
      toggleRow('📋 تفعيل زر "إنشاء طلب"', 'enableCreateOrder', 'ينشئ طلباً مباشرة من الحساب'),
    ]));
  },
};

/* ==========================================================================
   4ب. سياسة العربون (v3.3.45)
   ========================================================================== */

const depositPolicySection = {
  id: 'deposit-policy',
  icon: '💵',
  title: 'سياسة العربون',
  async render(body, currentSettings, saveFn) {
    const dp = currentSettings.depositPolicy || DEFAULT_SETTINGS.depositPolicy;

    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, 'تحذير العربون قبل بدء التنفيذ'),
        el('div', { className: 'settings-row__hint' },
          'عند تحويل طلب إلى «قيد التنفيذ» والمدفوع (مقدم + دفعات) أقل من النسبة: تظهر نافذة تحذير. لا تمنع شيئاً — «ابدأ على أي حال» متاحة'),
      ]),
      createToggle({
        label: '', checked: dp.enabled !== false,
        onChange: (v) => { saveFn({ depositPolicy: { enabled: v } }); },
      }),
    ]));

    body.appendChild(numberField({
      label: 'الحد الأدنى للعربون (% من إجمالي الطلب)',
      hint: 'مثال: 30 ⇒ طلب بـ 1000 ج.م يحتاج 300 ج.م على الأقل',
      value: dp.minPercent || 30,
      path: 'depositPolicy',
      field: 'minPercent',
      saveFn,
      attrs: { min: 1, max: 100 },
    }));

    /* v3.5.37: خيارات متقدمة (كلها معطَّلة افتراضياً) */
    body.appendChild(el('div', { className: 'settings-row__label', style: { marginTop: '14px' } }, 'خيارات متقدمة'));
    body.appendChild(numberField({
      label: 'حد أدنى بمبلغ ثابت (ج.م)',
      hint: '0 = معطّل. يُطبَّق الأكبر بين النسبة والمبلغ (ولا يتجاوز إجمالي الطلب)',
      value: dp.minAmount || 0, path: 'depositPolicy', field: 'minAmount', saveFn, attrs: { min: 0 },
    }));
    body.appendChild(numberField({
      label: 'الطلبات الكبيرة: ابتداءً من مبلغ (ج.م)',
      hint: '0 = معطّل. الطلب بهذا المبلغ فأكثر يستخدم النسبة الأعلى أدناه',
      value: dp.bigOrderThreshold || 0, path: 'depositPolicy', field: 'bigOrderThreshold', saveFn, attrs: { min: 0 },
    }));
    body.appendChild(numberField({
      label: 'نسبة العربون للطلبات الكبيرة (%)',
      hint: 'تُستخدم فقط إذا حُدِّد مبلغ للطلبات الكبيرة',
      value: dp.bigOrderPercent || 50, path: 'depositPolicy', field: 'bigOrderPercent', saveFn, attrs: { min: 1, max: 100 },
    }));
    body.appendChild(numberField({
      label: 'إعفاء الطلبات الأقل من (ج.م)',
      hint: '0 = معطّل. الطلبات الأصغر من هذا المبلغ لا يظهر لها تحذير',
      value: dp.skipBelowAmount || 0, path: 'depositPolicy', field: 'skipBelowAmount', saveFn, attrs: { min: 0 },
    }));
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, 'إعفاء عملاء VIP'),
        el('div', { className: 'settings-row__hint' }, 'لا يظهر تحذير العربون لطلبات العملاء المميّزين ⭐'),
      ]),
      createToggle({
        label: '', checked: dp.exemptVip === true,
        onChange: (v) => { saveFn({ depositPolicy: { exemptVip: v } }); },
      }),
    ]));

    body.appendChild(el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F', padding: '10px',
        background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.6', marginTop: '8px',
      },
    }, '💡 النافذة تعرض زر «📱 اطلب العربون» برسالة جاهزة (قالب «طلب عربون» في الرسائل التلقائية). قيمة خارج 1–100 تُعاد تلقائياً إلى 30.'));
  },
};

/* --- تصدير --- */
export const DATA_SECTIONS = [
  measurementFieldsSection,
  jalabiyaTypesSection,
  inventoryLimitsSection,
  dailyLimitSection,
  depositPolicySection,
  groupingSection,
  pricingCalculatorSection,
];
