/* ==========================================================================
   aftercare-forms.js — نماذج وعمليات التعديلات والمرتجعات (v3.14.0)
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { aftercare } from '../data/repos/aftercare.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { KINDS, REASONS, checkCaseInput, normalizeKind, normalizeReason } from '../services/aftercare.js';

const field = (label, input) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), input]);
const MAX_ORDER_CHOICES = 80;

/** قائمة اختيار الطلب: المُسلَّمة حديثاً أولاً (ولو كانت الحالة قديمة يبقى طلبها ظاهراً). */
function orderChoices(ctx, existing) {
  const cust = new Map(ctx.customers.map((c) => [c.id, c]));
  const t = (o) => Number(o.deliveredAt) || Number(o.updatedAt) || Number(o.createdAt) || 0;
  const delivered = ctx.orders.filter((o) => o && o.status === 'delivered').sort((a, b) => t(b) - t(a)).slice(0, MAX_ORDER_CHOICES);
  if (existing && !delivered.some((o) => o.id === existing.orderId)) {
    const o = ctx.orders.find((x) => x.id === existing.orderId);
    if (o) delivered.push(o);
  }
  return delivered.map((o) => ({ id: o.id, customerId: o.customerId || null, label: (cust.get(o.customerId) ? cust.get(o.customerId).name : 'عميل غير معروف') + ' · ' + formatDate(t(o)) + ' · ' + formatEGP(o.amount || 0) }));
}

export function openCaseForm(ctx, existing = null) {
  const isEdit = existing !== null;
  const choices = orderChoices(ctx, existing);
  if (!choices.length) { toast.warning('لا توجد طلبات مُسلَّمة لتسجيل حالة عليها'); return; }
  const orderSel = el('select', { className: 'select', 'data-role': 'case-order' });
  choices.forEach((c) => { const o = el('option', { value: c.id }, c.label); if (isEdit && existing.orderId === c.id) o.selected = true; orderSel.appendChild(o); });
  const kindSel = el('select', { className: 'select', 'data-role': 'case-kind' });
  KINDS.forEach((k) => { const o = el('option', { value: k.id }, k.icon + ' ' + k.label); if (isEdit && normalizeKind(existing.kind) === k.id) o.selected = true; kindSel.appendChild(o); });
  const reasonSel = el('select', { className: 'select', 'data-role': 'case-reason' });
  REASONS.forEach((r) => { const o = el('option', { value: r.id }, r.label); if (isEdit && normalizeReason(existing.reason) === r.id) o.selected = true; reasonSel.appendChild(o); });
  const costIn = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0', value: isEdit && existing.cost ? String(existing.cost) : '' });
  const refundIn = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0', value: isEdit && existing.refund ? String(existing.refund) : '' });
  const notesIn = el('textarea', { className: 'textarea', placeholder: 'ماذا حدث؟ وما المطلوب؟' });
  if (isEdit) notesIn.value = existing.notes || '';

  const handle = modal.open({
    title: isEdit ? 'تعديل حالة' : 'حالة جديدة بعد التسليم',
    body: el('div', {}, [
      field('الطلب *', orderSel), field('النوع', kindSel), field('السبب', reasonSel),
      field('تكلفة العلاج على الورشة', costIn), field('مبلغ رُدَّ للعميل', refundIn), field('ملاحظات', notesIn),
    ]),
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'تسجيل', variant: 'primary', action: 'save',
        onClick: async () => {
          const r = checkCaseInput({ orderId: orderSel.value, kind: kindSel.value, reason: reasonSel.value, cost: costIn.value, refund: refundIn.value, notes: notesIn.value });
          if (!r.ok) return toast.warning(r.error);
          const customerId = (choices.find((c) => c.id === r.data.orderId) || {}).customerId || null;
          try {
            if (isEdit) { await aftercare.update(existing.id, { ...r.data, customerId }); toast.success('تم التحديث'); }
            else { await aftercare.create({ ...r.data, customerId, status: 'open' }); toast.success('تم التسجيل'); }
            handle.close();
            await ctx.refresh();
          } catch (e) { toast.danger('فشل: ' + e.message); }
        },
      },
    ],
  });
}

export async function setCaseStatus(ctx, item, status) {
  try {
    await aftercare.update(item.id, status === 'done' ? { status: 'done', closedAt: Date.now() } : { status: 'open', closedAt: null });
    toast.success(status === 'done' ? 'تم إغلاق الحالة ✅' : 'أُعيد فتح الحالة');
    await ctx.refresh();
  } catch (e) { toast.danger('فشل: ' + e.message); }
}

export async function deleteCase(ctx, item) {
  const ok = await modal.confirm({ title: 'حذف حالة', message: 'حذف هذه الحالة نهائياً؟', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
  if (!ok) return;
  try { await aftercare.remove(item.id); toast.success('تم الحذف'); await ctx.refresh(); } catch (e) { toast.danger('فشل: ' + e.message); }
}
