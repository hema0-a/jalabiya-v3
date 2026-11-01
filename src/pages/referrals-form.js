/* ==========================================================================
   referrals-form.js — نماذج الإحالات (v3.5.25: مفصول عن referrals.js)
   ==========================================================================
   - openReferralForm(ctx, existing?) — إضافة/تعديل إحالة.
   - openRewardPercentForm(ctx)       — نسبة المكافأة الافتراضية (v3.5.22).
   - currentPercent(state)            — النسبة الفعّالة من إعدادات الحالة.
   ctx = { state, refresh, renderList }. لا يستورد referrals.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { referrals } from '../data/repos/referrals.js';
import { settings } from '../data/repos/settings.js';
import { rewardPercentOf, parseRewardPercent } from '../services/referral-rewards.js';
import { localDateInput, parseDateInput, toNonNegative } from '../core/utils.js';

/** النسبة الافتراضية الحالية للمكافأة. */
export const currentPercent = (state) => rewardPercentOf(state.settings);

/** نافذة تعديل نسبة المكافأة الافتراضية (تُحفظ في الإعدادات وتُرسم الصفحة من جديد). */
export function openRewardPercentForm(ctx) {
  const input = el('input', {
    className: 'input', type: 'number', min: '0', max: '100', step: '0.5',
    value: String(currentPercent(ctx.state)),
  });
  const body = el('div', {}, [
    el('p', { style: { fontSize: '13px', color: '#666', margin: '0 0 12px', lineHeight: '1.6' } },
      'تُقترح مكافأة المُرشِّح كنسبة من أول طلب مُسلَّم للعميل المُحال. تعتمد الاقتراح بنفسك بزر واحد.'),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'النسبة (%) *'), input]),
  ]);
  const handle = modal.open({
    title: '📊 نسبة المكافأة الافتراضية',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: async () => {
          const pct = parseRewardPercent(input.value);
          if (pct === null) return toast.warning('أدخل نسبة صحيحة بين 0 و100');
          try {
            await settings.update({ referrals: { rewardPercent: pct } });
            toast.success('تم حفظ النسبة');
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

export function openReferralForm(ctx, existing = null) {
  const isEdit = existing !== null;

  const referrerInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم من أرشد',
    value: isEdit ? (existing.referrerName || '') : '',
  });

  const referredInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم العميل الجديد',
    value: isEdit ? (existing.referredName || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.referredPhone || '') : '',
  });

  const rewardInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.reward || '') : '',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = isEdit && existing.date
    ? localDateInput(existing.date)
    : localDateInput();

  const paidCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  paidCheckbox.checked = isEdit ? (existing.status === 'paid') : false;

  const paidToggle = el('label', { className: 'toggle' }, [
    paidCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'تم دفع المكافأة'),
  ]);

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) noteInput.value = existing.note || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المُرشِّح *'), referrerInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المُرشَّح *'), referredInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'هاتف المُرشَّح (يربط الإحالة بالعميل تلقائياً)'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المكافأة (ج.م)'), rewardInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ'), dateInput]),
    el('div', { className: 'field' }, [paidToggle]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل إحالة' : 'إضافة إحالة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const referrerName = referrerInput.value.trim();
          const referredName = referredInput.value.trim();
          if (!referrerName) return toast.warning('اسم المُرشِّح مطلوب');
          if (!referredName) return toast.warning('اسم المُرشَّح مطلوب');

          const data = {
            referrerName,
            referredName,
            referredPhone: phoneInput.value.trim(),
            reward: toNonNegative(rewardInput.value),
            date: (dateInput.value ? parseDateInput(dateInput.value) : Date.now()),
            status: paidCheckbox.checked ? 'paid' : 'pending',
            note: noteInput.value.trim(),
          };

          try {
            if (isEdit) { await referrals.update(existing.id, data); toast.success('تم التحديث'); }
            else { await referrals.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}
