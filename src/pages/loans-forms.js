/* ==========================================================================
   loans-forms.js — نموذج القرض ونموذج الدفعة (v3.5.11)
   ==========================================================================
   openLoanForm(ctx, existing) · openPaymentForm(ctx, loan) — منقولتان حرفياً. التواصل عبر ctx { state, refresh, openForm }.
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { personalLoans } from '../data/repos/personal-loans.js';
import { loanPayments } from '../data/repos/loan-payments.js';
import { LOAN_TYPES } from '../core/config.js';
import { formatEGP, localDateInput, parseDateInput } from '../core/utils.js';
import { validateLoanPayment, defaultPaymentValue, getLoanRemaining } from '../services/loans-calculator.js';

/* ==========================================================================
   3. نموذج إضافة/تعديل
   ========================================================================== */

export function openLoanForm(ctx, existing = null) {
  const isEdit = existing !== null;

  const typeSelect = el('select', { className: 'select' });
  LOAN_TYPES.forEach((t) => {
    const o = el('option', { value: t.id }, t.icon + ' ' + t.label);
    if (isEdit ? existing.type === t.id : t.id === 'given') o.selected = true;
    typeSelect.appendChild(o);
  });

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم الشخص',
    value: isEdit ? (existing.personName || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.amount || '') : '',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = isEdit && existing.date
    ? localDateInput(existing.date)
    : localDateInput();

  const dueDateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = localDateInput(existing.dueDate);
  }

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) noteInput.value = existing.note || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'النوع *'), typeSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'اسم الشخص *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'تاريخ القرض'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'تاريخ الاستحقاق'), dueDateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل قرض' : 'إضافة قرض',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const personName = nameInput.value.trim();
          const amount = Number(amountInput.value);
          if (!personName) return toast.warning('اسم الشخص مطلوب');
          if (!amount || !Number.isFinite(amount) || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');

          const data = {
            type: typeSelect.value,
            personName,
            phone: phoneInput.value.trim(),
            amount,
            date: (dateInput.value ? parseDateInput(dateInput.value) : Date.now()),
            dueDate: (dueDateInput.value ? parseDateInput(dueDateInput.value) : null),
            note: noteInput.value.trim(),
          };

          try {
            if (isEdit) { await personalLoans.update(existing.id, data); toast.success('تم التحديث'); }
            else { await personalLoans.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. نموذج دفعة
   ========================================================================== */

export function openPaymentForm(ctx, loan) {
  /* الافتراضي = المتبقي بمليمين (كان يُقرَّب لأقرب جنيه فيتجاوز المتبقي، ويرجع لمبلغ القرض إن سُدِّد) */
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    max: String(Math.max(0, Number(loan.remaining) || 0)),
    value: defaultPaymentValue(loan),
  });
  let saving = false;   /* يمنع حفظ الدفعة مرتين بضغطتين متتاليتين */

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = localDateInput();

  const noteInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const body = el('div', {}, [
    el('div', {
      style: { padding: '10px', background: '#F6F1E6', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, loan.personName),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        'المتبقي: ' + formatEGP(loan.remaining) + ' من ' + formatEGP(loan.amount)),
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'المبلغ *'), amountInput,
      el('div', { style: { fontSize: '11px', color: '#888', marginTop: '4px' } },
        'الحد الأقصى: ' + formatEGP(loan.remaining)),
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التاريخ *'), dateInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), noteInput]),
  ]);

  const handle = modal.open({
    title: '💵 دفعة جديدة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ الدفعة', variant: 'primary', action: 'save',
        onClick: async () => {
          if (saving) return;
          const amount = Number(amountInput.value);
          if (!amount || !Number.isFinite(amount) || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          if (!dateInput.value) return toast.warning('التاريخ مطلوب');
          saving = true;
          try {
            /* المتبقي يُقرأ من القاعدة الآن (قد تكون دفعة سُجّلت من جهاز آخر بعد فتح النافذة) */
            const check = validateLoanPayment(amount, await getLoanRemaining(loan));
            if (!check.ok) {
              toast.warning(check.code === 'settled'
                ? 'القرض مسدَّد بالكامل — لا حاجة لدفعة جديدة'
                : 'المبلغ أكبر من المتبقي (' + formatEGP(check.remaining) + ')');
              return;
            }
            await loanPayments.create({
              loanId: loan.id,
              amount,
              date: parseDateInput(dateInput.value),
              note: noteInput.value.trim(),
            });
            toast.success('تم تسجيل الدفعة');
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
          finally { saving = false; }
        },
      },
    ],
  });
}
