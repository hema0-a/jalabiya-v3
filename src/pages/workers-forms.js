/* ==========================================================================
   workers-forms.js — نموذج العامل ونموذج الدفعة (v3.5.9)
   ==========================================================================
   openWorkerForm(ctx, existing) · openPaymentForm(ctx, worker) — منقولتان حرفياً. التواصل عبر ctx { state, refresh, openForm }.
   ========================================================================== */

import { el } from '../core/dom.js';
import { workers } from '../data/repos/workers.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatEGP, localDateInput, parseDateInput, toNonNegative } from '../core/utils.js';
import { SPECIALTIES, SALARY_TYPES, SALARY_TYPE_MAP } from './workers-logic.js';

/* ==========================================================================
   3. نموذج العامل
   ========================================================================== */

export function openWorkerForm(ctx, existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم العامل',
    value: isEdit ? (existing.name || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  /* التخصص */
  const specSelect = el('select', { className: 'select' });
  specSelect.appendChild(el('option', { value: '' }, '— اختر تخصصاً —'));
  SPECIALTIES.forEach((s) => {
    const o = el('option', { value: s }, s);
    if (isEdit && existing.specialty === s) o.selected = true;
    specSelect.appendChild(o);
  });

  /* نوع الأجر */
  const salaryTypeSelect = el('select', { className: 'select' });
  SALARY_TYPES.forEach((t) => {
    const o = el('option', { value: t.id }, t.icon + ' ' + t.label);
    if (isEdit ? existing.salaryType === t.id : t.id === 'fixed') o.selected = true;
    salaryTypeSelect.appendChild(o);
  });

  /* قيمة الأجر */
  const salaryInput = el('input', {
    className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01',
    value: isEdit ? (existing.salary || '') : '',
  });

  const salaryUnit = el('div', {
    style: { fontSize: '11px', color: '#666', marginTop: '4px' },
  }, 'ج.م / شهر');

  salaryTypeSelect.addEventListener('change', () => {
    const t = SALARY_TYPE_MAP[salaryTypeSelect.value];
    salaryUnit.textContent = t ? t.unit : '';
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const activeCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  activeCheckbox.checked = isEdit ? (existing.active !== false) : true;

  const activeToggle = el('label', { className: 'toggle' }, [
    activeCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'نشط حالياً'),
  ]);

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'التخصص'), specSelect]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'نوع الأجر'),
      salaryTypeSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'قيمة الأجر'),
      salaryInput,
      salaryUnit,
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
    el('div', { className: 'field' }, [activeToggle]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل عامل' : 'إضافة عامل',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');

          const data = {
            name,
            phone: phoneInput.value.trim(),
            specialty: specSelect.value || 'أخرى',
            salaryType: salaryTypeSelect.value,
            salary: toNonNegative(salaryInput.value),
            notes: notesInput.value.trim(),
            active: activeCheckbox.checked,
          };

          try {
            if (isEdit) {
              await workers.update(existing.id, data);
              toast.success('تم التحديث');
            } else {
              await workers.create(data);
              toast.success('تم الإضافة');
            }
            handle.close();
            await ctx.refresh();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. نموذج دفعة
   ========================================================================== */

export function openPaymentForm(ctx, worker) {
  const amountInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01',
    placeholder: '0',
  });

  const dateInput = el('input', { className: 'input', type: 'date' });
  dateInput.value = localDateInput();

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });

  const salaryType = SALARY_TYPE_MAP[worker.salaryType] || SALARY_TYPE_MAP.fixed;

  const body = el('div', {}, [
    el('div', {
      style: {
        padding: '10px', background: '#F6F1E6', borderRadius: '8px',
        marginBottom: '12px', fontSize: '13px',
      },
    }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F' } }, worker.name),
      el('div', { style: { color: '#666', fontSize: '12px', marginTop: '2px' } },
        salaryType.icon + ' ' + salaryType.label + ' — ' + formatEGP(worker.salary || 0)),
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
            await workerPayments.create({
              workerId: worker.id,
              amount,
              date: parseDateInput(dateInput.value),
              notes: notesInput.value.trim(),
            });
            toast.success('تم تسجيل الدفعة');
            handle.close();
            await ctx.refresh();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}
