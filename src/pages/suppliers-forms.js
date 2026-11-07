/* ==========================================================================
   suppliers-forms.js — نماذج وعمليات الموردين (v3.12.0)
   ==========================================================================
   مورد (إضافة/تعديل) · حركة مشتريات أو دفعة · حذف حركة · حذف مورد.
   المشتريات قد تُسجَّل اختيارياً كمصروف «قماش» (بدون تكرار: الدفعات لا تُسجَّل كمصروف).
   ctx = { refresh(): Promise<void> }
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { suppliers, supplierEntries } from '../data/repos/suppliers.js';
import { expenses } from '../data/repos/expenses.js';
import { formatEGP, localDateInput, parseDateInput } from '../core/utils.js';
import { checkSupplierInput, checkEntryInput, KINDS } from '../services/suppliers.js';

const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);

export function openSupplierForm(ctx, existing = null) {
  const isEdit = existing !== null;
  const nameInput = el('input', { className: 'input', type: 'text', maxlength: '80', placeholder: 'اسم المورد / المحل', value: isEdit ? (existing.name || '') : '' });
  const phoneInput = el('input', { className: 'input', type: 'tel', inputmode: 'tel', placeholder: '01xxxxxxxxx', value: isEdit ? (existing.phone || '') : '' });
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات (نوع القماش، العنوان...)' });
  if (isEdit) notesInput.value = existing.notes || '';
  const body = el('div', {}, [field('الاسم *', nameInput), field('الهاتف', phoneInput), field('ملاحظات', notesInput)]);
  const handle = modal.open({
    title: isEdit ? 'تعديل مورد' : 'إضافة مورد',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة', variant: 'primary', action: 'save',
        onClick: async () => {
          const r = checkSupplierInput({ name: nameInput.value, phone: phoneInput.value, notes: notesInput.value });
          if (!r.ok) return toast.warning(r.error);
          try {
            if (isEdit) { await suppliers.update(existing.id, r.data); toast.success('تم التحديث'); }
            else { await suppliers.create(r.data); toast.success('تمت الإضافة'); }
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

export function openEntryForm(ctx, supplier, kind) {
  const isPurchase = kind !== 'payment';
  const meta = KINDS.find((k) => k.id === (isPurchase ? 'purchase' : 'payment'));
  const amountInput = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0', 'data-role': 'entry-amount' });
  const dateInput = el('input', { className: 'input', type: 'date', value: localDateInput() });
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  const itemInput = isPurchase ? el('input', { className: 'input', type: 'text', maxlength: '80', placeholder: 'مثال: قماش أبيض', 'data-role': 'entry-item' }) : null;
  const metersInput = isPurchase ? el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: 'اختياري', 'data-role': 'entry-meters' }) : null;
  const ppm = isPurchase ? el('div', { 'data-role': 'entry-ppm', style: { fontSize: '12.5px', color: '#666', marginTop: '4px' } }, '') : null;
  const expenseCb = isPurchase ? el('input', { type: 'checkbox', 'data-role': 'entry-as-expense' }) : null;

  const updatePpm = () => {
    if (!ppm) return;
    const a = Number(amountInput.value), m = Number(metersInput.value);
    ppm.textContent = a > 0 && m > 0 ? 'سعر المتر: ' + formatEGP(Math.round((a / m) * 100) / 100) : '';
  };
  if (isPurchase) { amountInput.addEventListener('input', updatePpm); metersInput.addEventListener('input', updatePpm); }

  const parts = [];
  if (isPurchase) { parts.push(field('الصنف', itemInput)); parts.push(field('الأمتار', metersInput)); }
  parts.push(field('المبلغ *', amountInput));
  if (isPurchase) parts.push(ppm);
  parts.push(field('التاريخ *', dateInput));
  parts.push(field('ملاحظات', notesInput));
  if (isPurchase) {
    parts.push(el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginTop: '6px' } }, [expenseCb, 'سجّلها أيضاً كمصروف «قماش» في المصروفات']));
  }

  const handle = modal.open({
    title: meta.icon + ' ' + meta.label + ' — ' + supplier.name,
    body: el('div', {}, parts),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: async () => {
          if (!dateInput.value) return toast.warning('التاريخ مطلوب');
          const r = checkEntryInput({
            kind: isPurchase ? 'purchase' : 'payment', amount: amountInput.value, notes: notesInput.value,
            item: itemInput ? itemInput.value : '', meters: metersInput ? metersInput.value : '',
          });
          if (!r.ok) return toast.warning(r.error);
          const date = parseDateInput(dateInput.value);
          try {
            const entry = await supplierEntries.create({ ...r.data, supplierId: supplier.id, date });
            if (isPurchase && expenseCb.checked) {
              try {
                const ex = await expenses.create({
                  category: 'fabric', amount: r.data.amount, date,
                  notes: 'مشتريات — ' + supplier.name + (r.data.item ? ' · ' + r.data.item : ''),
                });
                await supplierEntries.update(entry.id, { expenseId: ex.id });
              } catch (e) { toast.warning('حُفظت الحركة لكن تعذّر تسجيلها كمصروف'); }
            }
            toast.success('تم الحفظ');
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

export async function deleteEntry(ctx, entry) {
  const ok = await modal.confirm({
    title: 'حذف حركة',
    message: 'حذف هذه الحركة (' + formatEGP(entry.amount) + ')؟' + (entry.expenseId ? ' سيُحذف معها المصروف المسجَّل منها.' : ''),
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await supplierEntries.remove(entry.id);
    if (entry.expenseId) await expenses.remove(entry.expenseId).catch(() => {});
    toast.success('تم الحذف');
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

export async function deleteSupplier(ctx, supplier, entryCount) {
  const ok = await modal.confirm({
    title: 'حذف مورد',
    message: 'حذف "' + supplier.name + '" وكل حركاته (' + entryCount + ')؟ لا يمكن التراجع. المصروفات المسجَّلة من مشترياته تبقى كما هي.',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    const list = await supplierEntries.listBySupplier(supplier.id);
    for (const e of list) await supplierEntries.remove(e.id);
    await suppliers.remove(supplier.id);
    toast.success('تم الحذف');
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}
