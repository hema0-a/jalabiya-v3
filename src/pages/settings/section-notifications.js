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

    /* ===== v3.5.38: خيارات متقدمة (الافتراضي = السلوك السابق تماماً) ===== */
    body.appendChild(el('div', { className: 'settings-row__label', style: { marginTop: '14px' } }, 'خيارات متقدمة'));

    /* حقل رقمي: الفراغ = الافتراضي (يُحفظ null) */
    function numField(label, hint, key, def, min, max, emptyIsNull) {
      const cur = n[key];
      const inp = el('input', {
        className: 'input', type: 'number',
        value: cur == null ? '' : String(cur),
        placeholder: emptyIsNull ? 'الافتراضي: ' + def : null,
        min: String(min), max: max != null ? String(max) : null,
      });
      let last = inp.value;
      const save = () => {
        if (inp.value === last) return;
        last = inp.value;
        const v = inp.value === '' ? (emptyIsNull ? null : def) : Number(inp.value);
        saveFn({ notifications: { [key]: v } });
      };
      inp.addEventListener('blur', save);
      inp.addEventListener('change', save);
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label),
        hint ? el('div', { className: 'settings-row__hint' }, hint) : null,
        inp,
      ]);
    }
    body.appendChild(numField('تنبيه التسليم القريب (أيام)', 'الطلبات التي موعدها خلال هذه المدة. فارغ = حسب «فترة التنبيه المسبق» (3 أيام على الأقل)', 'dueSoonDays', 3, 1, 60, true));
    body.appendChild(numField('تنبيه المناسبات (أيام قبلها)', 'فارغ = 14 يوماً', 'seasonsDays', 14, 1, 60, true));
    body.appendChild(numField('تنبيه الالتزامات (أيام قبل الاستحقاق)', 'فارغ = 5 أيام', 'commitmentsDays', 5, 1, 28, true));
    body.appendChild(numField('تنبيه المواعيد (أيام قادمة)', 'فارغ = مواعيد اليوم فقط', 'appointmentsDays', 0, 0, 14, true));
    body.appendChild(numField('حد المديونية الأدنى (ج.م)', '0 = تنبيه لكل عميل متأخر. مثال: 500 ⇒ لا تنبيه لمن عليه أقل من 500', 'debtMinAmount', 0, 0, null, false));

    body.appendChild(toggleRow('overdue', 'تنبيه الطلبات المتأخرة', 'في مركز التنبيهات وإشعار الجهاز'));
    body.appendChild(numField('مهلة قبل اعتبار الطلب متأخراً (أيام)', '0 = متأخر من اليوم التالي للموعد', 'overdueGraceDays', 0, 0, 30, false));

    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, 'ساعات الهدوء'),
        el('div', { className: 'settings-row__hint' }, 'لا تصل إشعارات الجهاز في هذه الفترة (مركز التنبيهات داخل التطبيق يعمل كالمعتاد)'),
      ]),
      createToggle({
        label: 'ساعات الهدوء', checked: n.quietEnabled === true,
        onChange: (v) => { saveFn({ notifications: { quietEnabled: v } }); },
      }),
    ]));
    function timeField(label, key, def) {
      const inp = el('input', { className: 'input', type: 'time', value: /^\d\d:\d\d$/.test(n[key] || '') ? n[key] : def });
      inp.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(inp.value)) saveFn({ notifications: { [key]: inp.value } }); });
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label), inp,
      ]);
    }
    body.appendChild(timeField('من الساعة', 'quietFrom', '22:00'));
    body.appendChild(timeField('إلى الساعة', 'quietTo', '07:00'));
  },
};
