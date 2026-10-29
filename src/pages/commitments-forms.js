/* ==========================================================================
   commitments-forms.js — نماذج المالية الشخصية (v3.5.10)
   ==========================================================================
   openCommitmentForm · openPaymentForm · openGoalForm · openGoalDeposit
   كلها تستلم ctx وتستدعي ctx.refresh() بعد الحفظ. لا تستورد المدخل.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { commitments } from '../data/repos/commitments.js';
import { commitmentPayments } from '../data/repos/commitment-payments.js';
import { savingsGoals } from '../data/repos/savings-goals.js';
import { invalidateCache } from '../services/commitments-calculator.js';
import { COMMITMENT_CATEGORIES, COMMITMENT_FREQUENCIES } from '../core/config.js';
import { formatEGP, localDateInput, parseDateInput, toNonNegative } from '../core/utils.js';

/* ==========================================================================
   1. نموذج الالتزام
   ========================================================================== */

export function openCommitmentForm(ctx, existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: إيجار الشقة',
    value: isEdit ? (existing.name || '') : '',
  });

  const catSelect = el('select', { className: 'select' });
  COMMITMENT_CATEGORIES.forEach((c) => {
    const o = el('option', { value: c.id }, c.icon + ' ' + c.label);
    if (isEdit && existing.category === c.id) o.selected = true;
    catSelect.appendChild(o);
  });

  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.amount || '') : '',
  });

  const freqSelect = el('select', { className: 'select' });
  COMMITMENT_FREQUENCIES.forEach((f) => {
    const o = el('option', { value: f.id }, f.icon + ' ' + f.label);
    if (isEdit ? existing.frequency === f.id : f.id === 'monthly') o.selected = true;
    freqSelect.appendChild(o);
  });

  const dueInput = el('input', {
    className: 'input', type: 'number', min: '1', max: '31', placeholder: '1-31 (اختياري)',
    value: isEdit && existing.dueDay ? String(existing.dueDay) : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const activeCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  activeCheckbox.checked = isEdit ? existing.active !== false : true;
  const activeToggle = el('label', { className: 'toggle' }, [
    activeCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'نشط حالياً'),
  ]);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الالتزام *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التصنيف *'), catSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الدورية'), freqSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'يوم الاستحقاق'), dueInput]),
    el('div', { className: 'field' }, [activeToggle]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل التزام' : 'إضافة التزام',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          const amount = Number(amountInput.value);
          if (!name) return toast.warning('الاسم مطلوب');
          if (!amount || !Number.isFinite(amount) || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          const dueVal = dueInput.value.trim();
          const data = {
            name,
            category: catSelect.value,
            amount,
            frequency: freqSelect.value,
            dueDay: dueVal ? Math.max(1, Math.min(31, Number(dueVal))) : null,
            notes: notesInput.value.trim(),
            active: activeCheckbox.checked,
          };
          try {
            if (isEdit) { await commitments.update(existing.id, data); toast.success('تم التحديث'); }
            else { await commitments.create(data); toast.success('تمت الإضافة'); }
            invalidateCache();
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   2. نموذج الدفعة
   ========================================================================== */

export function openPaymentForm(ctx, commitment) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01',
    value: String(Math.round(commitment.monthlyEquivalent || commitment.amount || 0)),
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = localDateInput();

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const body = el('div', {}, [
    el('div', {
      style: { padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, commitment.name),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        'المتوقع شهرياً: ' + formatEGP(commitment.monthlyEquivalent)),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ *'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: '💵 دفعة جديدة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ الدفعة', variant: 'primary', action: 'save',
        onClick: async () => {
          const amount = Number(amountInput.value);
          if (!amount || !Number.isFinite(amount) || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          if (!dateInput.value) return toast.warning('التاريخ مطلوب');
          try {
            await commitmentPayments.create({
              commitmentId: commitment.id,
              amount,
              date: parseDateInput(dateInput.value),
              notes: notesInput.value.trim(),
            });
            toast.success('تم تسجيل الدفعة');
            invalidateCache();
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   3. نموذج الهدف + الإيداع
   ========================================================================== */

export function openGoalForm(ctx, existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'مثال: شراء ماكينة خياطة',
    value: isEdit ? (existing.name || '') : '',
  });

  const targetInput = el('input', {
    className: 'input', type: 'number', min: '1', step: '0.01', placeholder: '5000',
    value: isEdit ? (existing.targetAmount || '') : '',
  });

  const currentInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.currentAmount || '') : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الهدف *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ المستهدف *'), targetInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ الحالي'), currentInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل هدف' : 'إضافة هدف ادخار',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          const target = Number(targetInput.value);
          const current = toNonNegative(currentInput.value);
          if (!name) return toast.warning('الاسم مطلوب');
          if (!target || target <= 0) return toast.warning('أدخل مبلغاً مستهدفاً صحيحاً');
          const data = {
            name,
            targetAmount: target,
            currentAmount: Math.max(0, current),
            notes: notesInput.value.trim(),
          };
          try {
            if (isEdit) { await savingsGoals.update(existing.id, data); toast.success('تم التحديث'); }
            else { await savingsGoals.create(data); toast.success('تمت الإضافة'); }
            invalidateCache();
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

export function openGoalDeposit(ctx, goal) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01',
    placeholder: '0',
  });

  const body = el('div', {}, [
    el('div', {
      style: { padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, goal.name),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        'متبقي: ' + formatEGP(goal.remaining) + ' من ' + formatEGP(goal.targetAmount)),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
  ]);

  const handle = modal.open({
    title: '💰 إيداع في الهدف',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'إيداع', variant: 'primary', action: 'save',
        onClick: async () => {
          const amount = Number(amountInput.value);
          if (!amount || !Number.isFinite(amount) || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          try {
            await savingsGoals.deposit(goal.id, amount);
            toast.success('تم الإيداع');
            invalidateCache();
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}
