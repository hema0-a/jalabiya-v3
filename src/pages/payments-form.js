/* ==========================================================================
   payments-form.js — نموذج إضافة/تعديل دفعة (v3.5.24: مفصول عن payments.js)
   ==========================================================================
   - ربط العميل والطلب، علامة «هذه الدفعة هي المقدم»، فحص المبلغ والفائض.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة) للدفعات الجديدة فقط.
   API: openPaymentForm(ctx, existing?)   ctx = { state, refresh }
   لا يستورد payments.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { payments } from '../data/repos/payments.js';
import { orders } from '../data/repos/orders.js';
import { checkAmount } from '../services/amount-guard.js';
import { modal, confirmIfStale } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { createCustomerPicker } from '../ui/customer-picker.js';
import { formatEGP } from '../core/utils.js';
import * as draft from '../services/draft-manager.js';
import { overpaidBy } from '../services/payments-view.js';

/* --- مفتاح المسودة --- */
const DRAFT_KEY = 'payment-form';

/**
 * @param {{state:Object, refresh:Function}} ctx
 * @param {Object|null} [existing] دفعة للتعديل، أو null للإضافة
 */
export function openPaymentForm(ctx, existing = null) {
  const { state } = ctx;
  const isEdit = existing !== null;

  /* العميل */
  const customerSelect = createCustomerPicker({ customers: state.customers, value: isEdit ? existing.customerId : '' });

  /* الطلب (يعتمد على العميل المختار) */
  const orderSelect = el('select', { className: 'select' });
  orderSelect.appendChild(el('option', { value: '' }, '— بدون طلب —'));

  function refreshOrderOptions() {
    /* الاحتفاظ بالقيمة الحالية */
    const currentValue = orderSelect.value;

    /* مسح الخيارات القديمة */
    while (orderSelect.firstChild) orderSelect.removeChild(orderSelect.firstChild);
    orderSelect.appendChild(el('option', { value: '' }, '— بدون طلب —'));

    const cid = customerSelect.value;
    if (!cid) {
      orderSelect.disabled = true;
      return;
    }

    orderSelect.disabled = false;
    const customerOrders = state.orders
      .filter((o) => o.customerId === cid && (o.status !== 'cancelled' || (isEdit && o.id === existing.orderId)))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    customerOrders.forEach((o) => {
      const label = '#' + String(o.id).slice(-6) + ' — ' +
        formatEGP(o.amount) + ' (' + (o.status === 'delivered' ? 'تم التسليم' : o.status === 'cancelled' ? 'ملغي' : 'نشط') + ')';
      orderSelect.appendChild(el('option', { value: o.id }, label));
    });

    /* استرجاع القيمة إن وُجدت */
    if (currentValue && Array.from(orderSelect.options).some((opt) => opt.value === currentValue)) {
      orderSelect.value = currentValue;
    } else if (isEdit && existing.orderId) {
      orderSelect.value = existing.orderId;
    }
  }

  customerSelect.addEventListener('change', refreshOrderOptions);
  refreshOrderOptions();

  /* إن كان تعديلاً ولديه طلب مُختار */
  if (isEdit && existing.orderId) {
    setTimeout(() => { orderSelect.value = existing.orderId; }, 0);
  }

  /* علامة «هذه الدفعة هي المقدم»: تظهر فقط إن كان للطلب المختار مقدم */
  const depositCheck = el('input', { type: 'checkbox' });
  const depositField = el('div', { className: 'field', style: { display: 'none' } }, [
    el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' } }, [
      depositCheck,
      el('span', {}, 'هذه الدفعة هي مقدّم الطلب نفسه'),
    ]),
    el('div', { className: 'field__hint' },
      'مقدّم الطلب يُحتسب تلقائياً. علّم هذا الخيار فقط إن كنت تسجّل المقدم نفسه كدفعة، حتى لا يُحسب مرتين.'),
  ]);
  function refreshDepositField() {
    const o = state.orders.find((x) => x.id === orderSelect.value);
    const dep = o ? Number(o.deposit) || 0 : 0;
    depositField.style.display = dep > 0 ? '' : 'none';
    if (dep <= 0) depositCheck.checked = false;
  }
  orderSelect.addEventListener('change', refreshDepositField);
  customerSelect.addEventListener('change', () => setTimeout(refreshDepositField, 0));
  setTimeout(() => {
    refreshDepositField();
    if (isEdit && existing.orderId) {
      const o = state.orders.find((x) => x.id === existing.orderId);
      const dep = o ? Number(o.deposit) || 0 : 0;
      /* دفعة قديمة بلا علامة وبمبلغ المقدم نفسه كانت تُعدّ مقدّماً: نحافظ على هذا الحساب */
      depositCheck.checked = existing.isDeposit === true ||
        (existing.isDeposit == null && dep > 0 && Math.abs((Number(existing.amount) || 0) - dep) <= 0.009);
    }
  }, 0);

  /* المبلغ */
  const amountInput = el('input', {
    className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01',
  });
  if (isEdit && existing.amount != null) amountInput.value = String(existing.amount);
  /* دفعة «من رصيد العميل»: المبلغ مرتبط بحركة في المحفظة، فتعديله يفصل الاثنين → يُقفل (احذفها لإعادة الرصيد) */
  if (isEdit && existing.fromCredit) amountInput.disabled = true;

  /* طريقة الدفع */
  const methodSelect = el('select', { className: 'select' });
  [['cash', 'نقدي'], ['instapay', 'InstaPay'], ['vodafone', 'Vodafone Cash'], ['other', 'أخرى']]
    .forEach(([v, l]) => {
      methodSelect.appendChild(el('option', { value: v }, l));
    });
  if (isEdit) methodSelect.value = existing.method || 'cash';

  /* ملاحظات */
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'العميل *'),
      customerSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'الطلب (اختياري)'),
      orderSelect,
      el('div', { className: 'field__hint' },
        'اختر الطلب لربط الدفعة به — يساعد في تتبع المدفوع/المتبقي'),
    ]),
    depositField,
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'المبلغ (ج.م) *'),
      amountInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'طريقة الدفع'),
      methodSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'ملاحظات'),
      notesInput,
    ]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل دفعة' : 'إضافة دفعة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          const orderId = orderSelect.value || null;
          if (!customerId) return toast.warning('اختر عميلاً');
          const chk = checkAmount(amountInput.value);
          if (chk.level === 'invalid') return toast.warning('أدخل مبلغاً صحيحاً');
          if (chk.level === 'huge') return toast.warning('المبلغ كبير جداً — تأكد من عدد الأصفار');
          if (chk.level === 'confirm' && !(await modal.confirm({
            title: 'مبلغ كبير', message: 'المبلغ ' + formatEGP(chk.amount) + ' كبير جداً. هل الرقم صحيح؟',
            confirmText: 'نعم، احفظ', cancelText: 'تعديل',
          }))) return;
          const amount = chk.amount;

          const data = {
            customerId,
            orderId,
            amount,
            method: methodSelect.value,
            notes: notesInput.value.trim(),
            isDeposit: !!orderId && depositCheck.checked,
          };
          /* فائض: هل سيتجاوز مجموع المدفوع إجمالي الطلب؟ (كان يُحفظ بصمت ويُخفى بأن المتبقي لا يقل عن صفر) */
          if (orderId) {
            try {
              const ord = await orders.find(orderId);
              if (ord && ord.status !== 'cancelled') {
                const others = (await payments.findByOrder(orderId)).filter((p) => !(isEdit && p.id === existing.id));
                const over = overpaidBy(ord, others.concat([{ ...data, id: isEdit ? existing.id : 'new' }]));
                if (over > 0 && !(await modal.confirm({
                  title: 'دفعة أكبر من المتبقي',
                  message: 'بهذه الدفعة يصير المدفوع أكبر من إجمالي الطلب (' + formatEGP(ord.amount) + ') بمقدار ' +
                    formatEGP(over) + '.\nهل الرقم صحيح؟',
                  confirmText: 'نعم، احفظ', cancelText: 'تعديل المبلغ',
                }))) return;
              }
            } catch (e) { /* فشل الفحص لا يمنع الحفظ */ }
          }
          if (isEdit && !(await confirmIfStale((id) => payments.find(id), existing, 'هذه الدفعة'))) return;
          try {
            if (isEdit) {
              const res = await payments.update(existing.id, data);
              if (!res) { toast.danger('الدفعة لم تعد موجودة (حُذفت من جهاز آخر؟)'); return; }
              toast.success('تم التحديث');
            } else { await payments.create(data); toast.success('تم الإضافة'); }
            draft.clear(DRAFT_KEY);
            handle.close();
            await ctx.refresh();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });

  /* --- 📝 Autosave: حفظ + استرجاع المسودة (فقط للنماذج الجديدة) --- */
  if (!isEdit) {
    /* 1. استرجاع المسودة إن وُجدت */
    const savedDraft = draft.get(DRAFT_KEY);
    if (savedDraft && typeof savedDraft === 'object') {
      try {
        /* العميل أولاً — لأن قائمة الطلبات تعتمد عليه */
        if (savedDraft.customerId) {
          customerSelect.value = savedDraft.customerId;
          refreshOrderOptions();
        }
        /* ثم الطلب (بعد تعبئة القائمة) */
        if (savedDraft.orderId) {
          orderSelect.value = savedDraft.orderId;
        }
        if (savedDraft.amount != null) amountInput.value = String(savedDraft.amount);
        if (savedDraft.method) methodSelect.value = savedDraft.method;
        if (typeof savedDraft.notes === 'string') notesInput.value = savedDraft.notes;

        toast.info('📝 تم استرجاع مسودة سابقة');
      } catch (e) {
        console.warn('[PaymentForm] draft restore failed:', e);
      }
    }

    /* 2. حفظ تلقائي أثناء الكتابة (debounce 500ms) */
    let _saveTimer = null;
    const scheduleSave = () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        try {
          const payload = {
            customerId: customerSelect.value,
            orderId: orderSelect.value,
            amount: Number(amountInput.value) || 0,
            method: methodSelect.value,
            notes: notesInput.value,
          };
          draft.save(DRAFT_KEY, payload);
        } catch (e) {
          console.warn('[PaymentForm] draft save failed:', e);
        }
      }, 500);
    };

    /* ربط المراقبة بمحتوى النموذج */
    body.addEventListener('input', scheduleSave);
    body.addEventListener('change', scheduleSave);

    /* حفظ أولي بعد فتح النموذج بلحظة */
    setTimeout(scheduleSave, 100);

    /* حفظ عند إغلاق النافذة */
    const origHandleClose = handle.close;
    handle.close = function () {
      try { scheduleSave(); } catch { /* ignore */ }
      return origHandleClose.apply(this, arguments);
    };
  }
}
