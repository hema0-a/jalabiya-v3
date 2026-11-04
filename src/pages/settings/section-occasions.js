/* ==========================================================================
   section-occasions.js — قسم المواسم والأعياد (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: occasionsSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { DEFAULT_OCCASIONS } from '../../core/config.js';
import { occasionDaysUntil, sortOccasionsByDate } from '../../services/alert-rules.js';

/* ==========================================================================
   2. المواسم والأعياد
   ========================================================================== */

export const occasionsSection = {
  id: 'occasions',
  icon: '🎉',
  title: 'المواسم والأعياد',
  async render(body, currentSettings, saveFn) {
    const occasions = currentSettings.occasions || [...DEFAULT_OCCASIONS];
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    function commit() { saveFn({ occasions: [...occasions] }); rebuild(); }
    function move(idx, dir) {
      const j = idx + dir;
      if (j < 0 || j >= occasions.length) return;
      [occasions[idx], occasions[j]] = [occasions[j], occasions[idx]];
      commit();
    }
    function sortByDate() {
      const sorted = sortOccasionsByDate(occasions);
      occasions.splice(0, occasions.length, ...sorted);
      commit();
    }

    function rebuild() {
      clear(list);
      if (occasions.length === 0) {
        list.appendChild(el('div', {
          style: { fontSize: '13px', color: '#2E8B6F', textAlign: 'center', padding: '12px' },
        }, 'لا توجد مناسبات — أضف مناسبة جديدة'));
        return;
      }
      occasions.forEach((o, idx) => {
        const enabled = o.enabled !== false;
        list.appendChild(el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px', background: '#F6F1E6', borderRadius: '8px',
            opacity: enabled ? '1' : '0.5',
          },
        }, [
          el('span', { style: { fontSize: '20px' } }, o.icon || '🎉'),
          el('div', { style: { flex: '1' } }, [
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, o.name),
            el('div', { style: { fontSize: '11px', color: '#666' } },
              'الشهر ' + o.month + ' — اليوم ' + o.day + ' — تنبيه قبل ' + o.alertDays + ' يوم'
              + (occasionDaysUntil(o) === null ? '' : ' — بعد ' + occasionDaysUntil(o) + ' يوم')),
          ]),
          el('span', { style: { display: 'flex', flexDirection: 'column' } }, [
            el('button', {
              className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'move-up', 'aria-label': 'تحريك لأعلى',
              disabled: idx === 0 ? 'disabled' : null, style: { padding: '0 8px', minHeight: '22px', lineHeight: '1' },
              onClick: () => move(idx, -1),
            }, '▲'),
            el('button', {
              className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'move-down', 'aria-label': 'تحريك لأسفل',
              disabled: idx === occasions.length - 1 ? 'disabled' : null, style: { padding: '0 8px', minHeight: '22px', lineHeight: '1' },
              onClick: () => move(idx, 1),
            }, '▼'),
          ]),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => {
              occasions[idx].enabled = !enabled;
              saveFn({ occasions: [...occasions] });
              rebuild();
            },
          }, enabled ? '✅' : '⬜'),
          el('button', {
            className: 'btn btn--sm btn--ghost', type: 'button',
            onClick: () => openOccasionForm(occasions, idx, saveFn, rebuild),
          }, '✏️'),
          el('button', {
            className: 'btn btn--sm btn--danger', type: 'button',
            onClick: () => {
              occasions.splice(idx, 1);
              saveFn({ occasions: [...occasions] });
              rebuild();
            },
          }, '🗑️'),
        ]));
      });
    }

    body.appendChild(el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'sort-date',
      style: { marginBottom: '8px' },
      onClick: sortByDate,
    }, '🗓️ ترتيب حسب الأقرب تاريخاً'));
    body.appendChild(el('div', { className: 'settings-row__hint', style: { marginBottom: '8px' } },
      'التنبيه في مركز الإشعارات يحترم «تنبيه قبل» الخاص بكل مناسبة؛ والمدة العامة في قسم التنبيهات احتياطية.'));
    body.appendChild(list);
    body.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '8px' },
      onClick: () => openOccasionForm(occasions, -1, saveFn, rebuild),
    }, '➕ إضافة مناسبة جديدة'));
    rebuild();
  },
};

function openOccasionForm(occasions, editIdx, saveFn, rebuild) {
  const isEdit = editIdx >= 0;
  const existing = isEdit ? occasions[editIdx] : {
    month: 1, day: 1, alertDays: 14, recurring: true, enabled: true,
  };

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: رمضان',
    value: existing.name || '',
  });
  const iconInput = el('input', {
    className: 'input', type: 'text', placeholder: '🎉', maxLength: 4,
    value: existing.icon || '🎉',
  });
  const monthInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '12',
    value: String(existing.month),
  });
  const dayInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '31',
    value: String(existing.day),
  });
  const alertInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '90',
    value: String(existing.alertDays),
  });

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم المناسبة *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الأيقونة'), iconInput]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الشهر (1-12)'), monthInput]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اليوم (1-31)'), dayInput]),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التنبيه قبل (أيام)'), alertInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل مناسبة' : 'إضافة مناسبة',
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
            icon: iconInput.value.trim() || '🎉',
            month: Math.max(1, Math.min(12, Number(monthInput.value) || 1)),
            day: Math.max(1, Math.min(31, Number(dayInput.value) || 1)),
            alertDays: Math.max(1, Math.min(90, Number(alertInput.value) || 14)),
            recurring: true,
            enabled: isEdit ? (occasions[editIdx].enabled !== false) : true,
          };
          if (isEdit) {
            occasions[editIdx] = { ...occasions[editIdx], ...data };
          } else {
            occasions.push({ id: 'occ_' + Date.now(), ...data });
          }
          saveFn({ occasions: [...occasions] });
          handle.close();
          rebuild();
        },
      },
    ],
  });
}
