/* orders/form-inputs.js — حقول نموذج الطلب: العميل والحالة والتواريخ والمقدم والتكلفة والملاحظات والصورة المرجعية (v3.5.11) */

import { el } from '../../core/dom.js';
import { localDateInput } from '../../core/utils.js';
import { orders } from '../../data/repos/orders.js';
import { createOrderImagePicker } from '../../ui/order-image-picker.js';
import { getOrderMedia } from '../../data/repos/order-media.js';
import { hasReferenceImage } from '../../services/order-media.js';
import { createCustomerPicker } from '../../ui/customer-picker.js';
import { STATUS_MAP, STATUS_ORDER } from './logic.js';

export function buildInputs(ctx, existing, f, flags) {
  const { state } = ctx;
  const isEdit = existing !== null;
  const { recalc } = f;

  /* اختيار بالبحث (اسم/هاتف) بدل قائمة طويلة — بنفس واجهة .value */
  const customerSelect = createCustomerPicker({ customers: state.customers, value: isEdit ? existing.customerId : '' });

  const statusSelect = el('select', { className: 'select' });
  STATUS_ORDER.forEach((s) => {
    statusSelect.appendChild(el('option', { value: s }, STATUS_MAP[s].label));
  });
  statusSelect.value = isEdit ? existing.status : 'pending';

  const receivedDateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.receivedDate) {
    receivedDateInput.value = localDateInput(existing.receivedDate);
  }

  const dueDateInput = el('input', { className: 'input', type: 'date', 'aria-label': 'تاريخ التسليم' });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = localDateInput(existing.dueDate);
  }

  /* --- الصورة المرجعية --- */
  /* الصورة المضمَّنة القديمة تظهر فوراً؛ المفصولة (orderMedia) تُحمَّل بعد فتح النموذج بلا تعطيله (v3.3.87).
     loadedRef = ما حُمِّل (للمقارنة عند الحفظ فلا تُعاد كتابة صورة لم تتغيّر)، وrefReady = اكتمل التحميل
     (قبله لا نكتب الصورة أبداً، فلا يُحذف وسيط بسبب حفظ سريع قبل وصوله). */
  const inlineRef = isEdit ? (existing.referenceImage || '') : '';
  const imagePicker = createOrderImagePicker({
    value: inlineRef,
    label: '🖼️ صورة مرجعية',
    hint: 'صورة الموديل المطلوب (اختياري)',
  });
  flags.loadedRef = inlineRef;
  flags.refReady = !isEdit || !!inlineRef || !hasReferenceImage(existing);
  if (!flags.refReady) {
    getOrderMedia(existing, 'ref').then((v) => {
      flags.loadedRef = v || '';
      if (flags.loadedRef && !imagePicker.getValue()) imagePicker.setValue(flags.loadedRef);
    }).catch((e) => console.warn('[orders] تعذّر تحميل الصورة المرجعية', e)).finally(() => { flags.refReady = true; });
  }

  /* --- المقدم --- */
  const depositInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.deposit || '') : '',
  });
  depositInput.addEventListener('input', recalc);

  /* --- تكلفة الطلب (اختياري — لحساب الربح التقديري) --- */
  const costInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: 'قماش + خيط + أجر (اختياري)',
    value: isEdit ? (existing.cost || '') : '',
  });
  costInput.addEventListener('input', recalc);

  /* --- الملاحظات --- */
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  Object.assign(f, {
    customerSelect, statusSelect, receivedDateInput, dueDateInput, imagePicker, depositInput, costInput, notesInput,
  });
}
