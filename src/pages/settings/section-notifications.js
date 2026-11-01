/* ==========================================================================
   section-notifications.js — قسم التنبيهات (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: notificationsSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../../core/dom.js';
import { createToggle } from '../../ui/controls.js';
import { DEFAULT_SETTINGS } from '../../core/config.js';

/* ==========================================================================
   1. التنبيهات
   ========================================================================== */

export const notificationsSection = {
  id: 'notifications',
  icon: '🔔',
  title: 'التنبيهات',
  async render(body, currentSettings, saveFn) {
    const n = currentSettings.notifications || DEFAULT_SETTINGS.notifications;

    function toggleRow(key, label, hint = '') {
      const t = createToggle({
        label,
        checked: n[key] !== false,
        onChange: (v) => {
          saveFn({ notifications: { [key]: v } });
        },
      });
      return el('div', { className: 'settings-row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { className: 'settings-row__label' }, label),
          hint ? el('div', { className: 'settings-row__hint' }, hint) : null,
        ]),
        t,
      ]);
    }

    body.appendChild(toggleRow('seasons', 'تنبيهات المواسم والأعياد', 'مع اقتراب المناسبات'));
    body.appendChild(toggleRow('appointments', 'تنبيهات المواعيد', 'قبل الموعد بـ N يوم'));
    body.appendChild(toggleRow('inventory', 'تنبيهات المخزون', 'عند نقص الكمية'));
    body.appendChild(toggleRow('debts', 'تنبيهات المديونيات', 'العملاء بأرصدة معلقة'));

    const periodSelect = el('select', { className: 'select' });
    [['1', 'يوم'], ['2', 'يومان'], ['7', 'أسبوع']].forEach(([v, l]) => {
      const o = el('option', { value: v }, l);
      if (String(n.leadDays || 2) === v) o.selected = true;
      periodSelect.appendChild(o);
    });
    periodSelect.addEventListener('change', () => {
      saveFn({ notifications: { leadDays: Number(periodSelect.value) } });
    });

    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'فترة التنبيه المسبق'),
      periodSelect,
    ]));
  },
};
