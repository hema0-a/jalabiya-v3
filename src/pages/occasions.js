/* ==========================================================================
   occasions.js — صفحة المواسم والأعياد
   ==========================================================================
   - 3 بطاقات إحصائية (إجمالي / مفعّل / قادم قريباً).
   - بطاقة "المناسبة القادمة".
   - قائمة كاملة + ترتيب حسب الشهر/اليوم.
   - CRUD كامل.
   - البيانات تُقرأ/تُكتب من settings.occasions (لا مخزن منفصل).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { settings } from '../data/repos/settings.js';
import { MONTH_NAMES } from '../core/config.js';

/* --- الحالة --- */
let state = {
  container: null,
  occasions: [],
};

/* ==========================================================================
   1. أدوات الحساب
   ========================================================================== */

/**
 * حساب الأيام المتبقية للمناسبة القادمة.
 * @param {{month:number, day:number}} occ — الشهر (1-12) واليوم (1-31)
 * @returns {{daysLeft:number, date:Date}}
 */
function daysUntil(occ) {
  const now = new Date();
  const y = now.getFullYear();
  const m = Number(occ.month) - 1;
  const d = Number(occ.day);
  let target = new Date(y, m, d, 0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (target < today) {
    target = new Date(y + 1, m, d, 0, 0, 0, 0);
  }
  const diffMs = target - today;
  const daysLeft = Math.round(diffMs / 86400000);
  return { daysLeft, date: target };
}

/**
 * إيجاد المناسبة القادمة (الأقرب).
 * @param {Array} list
 * @returns {{occ:Object, daysLeft:number, date:Date}|null}
 */
function findNext(list) {
  const enabled = list.filter((o) => o.enabled !== false);
  if (enabled.length === 0) return null;
  const withDays = enabled.map((o) => ({ occ: o, ...daysUntil(o) }));
  withDays.sort((a, b) => a.daysLeft - b.daysLeft);
  return withDays[0];
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const s = await settings.get();
  state.occasions = Array.isArray(s.occasions) ? [...s.occasions] : [];
}

/**
 * حفظ القائمة (يُستبدل المصفوفة بالكامل).
 * @returns {Promise<void>}
 */
async function saveOccasions() {
  try {
    await settings.update({ occasions: state.occasions });
  } catch (e) {
    toast.danger('فشل الحفظ: ' + e.message);
  }
}

/* ==========================================================================
   3. نموذج إضافة/تعديل
   ========================================================================== */

function openOccasionForm(existing = null) {
  const isEdit = existing !== null;
  const now = new Date();

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: رمضان، عيد الفطر',
    value: isEdit ? (existing.name || '') : '',
  });

  const iconInput = el('input', {
    className: 'input', type: 'text', placeholder: '🎉', maxLength: 4,
    value: isEdit ? (existing.icon || '🎉') : '🎉',
  });

  const monthSelect = el('select', { className: 'select' });
  MONTH_NAMES.forEach((m, idx) => {
    const o = el('option', { value: String(idx + 1) }, m);
    if (isEdit ? Number(existing.month) === idx + 1 : (now.getMonth() === idx)) {
      o.selected = true;
    }
    monthSelect.appendChild(o);
  });

  const dayInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '31',
    value: isEdit ? String(existing.day || 1) : '1',
  });

  const alertInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '90',
    value: isEdit ? String(existing.alertDays || 14) : '14',
  });

  const enabledCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  enabledCheckbox.checked = isEdit ? (existing.enabled !== false) : true;

  const enabledToggle = el('label', { className: 'toggle' }, [
    enabledCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'مفعّلة'),
  ]);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم المناسبة *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الأيقونة'), iconInput]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الشهر'), monthSelect]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اليوم'), dayInput]),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التنبيه قبل (أيام)'), alertInput]),
    el('div', { className: 'field' }, [enabledToggle]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل مناسبة' : 'إضافة مناسبة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const day = Math.max(1, Math.min(31, Number(dayInput.value) || 1));
          const alertDays = Math.max(1, Math.min(90, Number(alertInput.value) || 14));

          const data = {
            name,
            icon: iconInput.value.trim() || '🎉',
            month: Number(monthSelect.value),
            day,
            alertDays,
            recurring: true,
            enabled: enabledCheckbox.checked,
          };

          if (isEdit) {
            const idx = state.occasions.findIndex((o) => o.id === existing.id);
            if (idx >= 0) state.occasions[idx] = { ...state.occasions[idx], ...data };
          } else {
            state.occasions.push({ id: 'occ_' + Date.now(), ...data });
          }

          await saveOccasions();
          handle.close();
          await refreshAll();
          toast.success(isEdit ? 'تم التحديث' : 'تم الإضافة');
        },
      },
    ],
  });
}

/* ==========================================================================
   4. عمليات
   ========================================================================== */

async function toggleEnabled(occ) {
  const idx = state.occasions.findIndex((o) => o.id === occ.id);
  if (idx < 0) return;
  state.occasions[idx].enabled = !(state.occasions[idx].enabled !== false);
  await saveOccasions();
  await refreshAll();
  toast.info(state.occasions[idx].enabled ? 'تم التفعيل' : 'تم التعطيل');
}

async function deleteOccasion(occ) {
  const ok = await modal.confirm({
    title: 'حذف مناسبة',
    message: 'حذف "' + occ.name + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  state.occasions = state.occasions.filter((o) => o.id !== occ.id);
  await saveOccasions();
  await refreshAll();
  toast.success('تم الحذف');
}

/* ==========================================================================
   5. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#occ-stats');
  if (!wrap) return;
  clear(wrap);

  const total = state.occasions.length;
  const enabled = state.occasions.filter((o) => o.enabled !== false).length;
  const next = findNext(state.occasions);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🎉'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#2E7D32' } }, String(enabled)),
    el('span', { className: 'stat__label' }, 'مفعّلة'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏰'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: next ? '#F57C00' : '#666' } },
      next ? String(next.daysLeft) + ' يوم' : '—'),
    el('span', { className: 'stat__label' }, next ? next.occ.name : 'لا يوجد'),
  ]));
}

function renderNextOccasionCard() {
  const next = findNext(state.occasions);
  if (!next) return null;

  const days = next.daysLeft;
  const isSoon = days <= (next.occ.alertDays || 14);
  const bg = isSoon ? 'linear-gradient(135deg, #FFF3E0, #FFE0B2)' : 'linear-gradient(135deg, #E8F5E9, #C8E6C9)';
  const color = isSoon ? '#E65100' : '#2E7D32';

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '12px', background: bg },
  });

  card.appendChild(el('div', {
    style: { display: 'flex', alignItems: 'center', gap: '12px' },
  }, [
    el('span', { style: { fontSize: '40px', lineHeight: '1' } }, next.occ.icon || '🎉'),
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontSize: '11px', color, fontWeight: '600', marginBottom: '2px' } },
        isSoon ? '⚠️ قادم قريباً' : '📅 المناسبة القادمة'),
      el('div', { style: { fontSize: '18px', fontWeight: '700', color: '#123C2F' } },
        next.occ.name),
      el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } },
        next.occ.day + ' ' + MONTH_NAMES[Number(next.occ.month) - 1] +
        ' — بعد ' + days + ' يوم'),
    ]),
  ]));

  return card;
}

function buildOccasionCard(occ) {
  const { daysLeft } = daysUntil(occ);
  const enabled = occ.enabled !== false;
  const isSoon = daysLeft <= (occ.alertDays || 14);

  const card = el('div', {
    className: 'card',
    style: {
      marginBottom: '8px',
      opacity: enabled ? '1' : '0.55',
      borderRight: '4px solid ' + (enabled ? (isSoon ? '#F57C00' : '#1F6D57') : '#CCC'),
      padding: '10px 12px',
    },
    'data-id': occ.id,
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        (occ.icon || '🎉') + ' ' + occ.name),
      el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
        occ.day + ' ' + MONTH_NAMES[Number(occ.month) - 1] +
        ' · تنبيه قبل ' + (occ.alertDays || 14) + ' يوم'),
    ]),
    el('div', { style: { textAlign: 'left', fontSize: '11px' } }, [
      el('span', {
        style: {
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: '600',
          color: isSoon ? '#F57C00' : '#2E7D32',
          background: isSoon ? '#FFF3E0' : '#E8F5E9',
          padding: '2px 8px',
          borderRadius: '10px',
        },
      }, 'بعد ' + daysLeft + ' يوم'),
    ]),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  }, [
    el('button', {
      className: 'btn btn--sm ' + (enabled ? 'btn--ghost' : 'btn--secondary'), type: 'button',
      onClick: () => toggleEnabled(occ),
    }, enabled ? '⏸️ تعطيل' : '▶️ تفعيل'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openOccasionForm(occ),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deleteOccasion(occ),
    }, '🗑️'),
  ]));

  return card;
}

function renderList() {
  const wrap = state.container?.querySelector('#occ-list');
  if (!wrap) return;
  clear(wrap);

  if (state.occasions.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🎉'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مناسبات'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة مناسبة" للبدء'),
    ]));
    return;
  }

  /* ترتيب حسب الشهر ثم اليوم */
  const sorted = [...state.occasions].sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });

  sorted.forEach((o) => wrap.appendChild(buildOccasionCard(o)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  const nextCard = renderNextOccasionCard();
  const listWrap = state.container?.querySelector('#occ-list');
  if (nextCard && listWrap) {
    /* استبدال بطاقة القادم إن وُجدت */
    const existing = state.container.querySelector('#occ-next-card');
    if (existing) existing.remove();
    nextCard.id = 'occ-next-card';
    listWrap.parentNode.insertBefore(nextCard, listWrap);
  }
  renderList();
}

/* ==========================================================================
   6. API
   ========================================================================== */

export const occasionsPage = {
  async render(container) {
    clear(container);
    state.container = container;

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '🎉 المواسم والأعياد'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'تتبّع المواسم والمناسبات'),
    ]));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'occ-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر إضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openOccasionForm(),
    }, '➕ إضافة مناسبة'));

    /* قائمة */
    container.appendChild(el('div', { id: 'occ-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      container: null,
      occasions: [],
    };
  },
};
