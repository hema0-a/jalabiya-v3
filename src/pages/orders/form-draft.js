/* orders/form-draft.js — وضع الإدخال السريع والمسودة التلقائية لنموذج الطلب (v3.5.11) */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import * as draft from '../../services/draft-manager.js';

/* --- مفاتيح المسودات --- */
export const DRAFT_KEY = 'order-form';

/* --- وضع الإدخال السريع (v3.3.42) --- */
const FORM_MODE_KEY = 'jalabiya_v3_order_form_mode';
export function readFormMode() {
  try { return localStorage.getItem(FORM_MODE_KEY) === 'quick' ? 'quick' : 'full'; } catch { return 'full'; }
}
export function writeFormMode(m) {
  try { localStorage.setItem(FORM_MODE_KEY, m); } catch { /* ignore */ }
}

export function buildModeBar(setMode) {
  /* مبدّل الوضع: «سريع» = العميل + البند + التاريخ فقط (للزحام)، «كامل» = كل الحقول. للطلب الجديد فقط */
  const modeBtn = (key, label) => el('button', {
    type: 'button', className: 'btn btn--sm order-mode__btn', 'data-mode': key,
    onClick: () => setMode(key),
  }, label);
  const quickBtn = modeBtn('quick', '⚡ سريع');
  const fullBtn = modeBtn('full', '📋 كامل');
  const modeBar = el('div', { className: 'order-mode', role: 'group', 'aria-label': 'وضع النموذج' }, [quickBtn, fullBtn]);
  return { quickBtn, fullBtn, modeBar };
}

export function attachDraft(ctx, existing, f, flags) {
  const isEdit = existing !== null;
  const {
    customerSelect, statusSelect, receivedDateInput, dueDateInput, discountTypeSelect, discountValueInput,
    depositInput, costInput, notesInput, imagePicker, itemsContainer, feesContainer, addItemRow, addFeeRow,
    extras, body, handle, setMode, recalc,
  } = f;

  /* --- 📝 Autosave: حفظ + استرجاع المسودة (فقط للنماذج الجديدة) --- */
  if (!isEdit) {
    /* 1. استرجاع المسودة إن وُجدت */
    const savedDraft = draft.get(DRAFT_KEY);
    if (savedDraft && typeof savedDraft === 'object') {
      try {
        if (savedDraft.customerId) customerSelect.value = savedDraft.customerId;
        if (savedDraft.status) statusSelect.value = savedDraft.status;
        if (savedDraft.receivedDate) receivedDateInput.value = savedDraft.receivedDate;
        if (savedDraft.dueDate) dueDateInput.value = savedDraft.dueDate;
        if (typeof savedDraft.discountType === 'string') {
          discountTypeSelect.value = savedDraft.discountType;
          discountValueInput.style.display = savedDraft.discountType === 'none' ? 'none' : '';
        }
        if (savedDraft.discountValue != null) discountValueInput.value = String(savedDraft.discountValue);
        if (savedDraft.deposit != null) depositInput.value = String(savedDraft.deposit);
        if (savedDraft.cost != null && savedDraft.cost !== 0) costInput.value = String(savedDraft.cost);
        if (typeof savedDraft.notes === 'string') notesInput.value = savedDraft.notes;
        if (savedDraft.image && typeof imagePicker.setValue === 'function') {
          imagePicker.setValue(savedDraft.image);
        }

        /* استرجاع البنود */
        if (Array.isArray(savedDraft.items) && savedDraft.items.length > 0) {
          clear(itemsContainer);
          savedDraft.items.forEach((it) => addItemRow(it));
        }

        /* استرجاع الرسوم */
        if (Array.isArray(savedDraft.fees) && savedDraft.fees.length > 0) {
          clear(feesContainer);
          savedDraft.fees.forEach((f) => addFeeRow(f));
        }

        if (savedDraft.receivedDate || (savedDraft.discountType && savedDraft.discountType !== 'none') ||
            (savedDraft.fees && savedDraft.fees.length) || savedDraft.cost || savedDraft.notes || savedDraft.image) {
          extras.open = true;
        }
        recalc();
        if (extras.open || itemsContainer.children.length > 1 || Number(savedDraft.deposit) > 0) setMode('full', false);
        toast.info('📝 تم استرجاع مسودة سابقة');
      } catch (e) {
        console.warn('[OrderForm] draft restore failed:', e);
      }
    }

    /* 2. حفظ تلقائي أثناء الكتابة (debounced 500ms) */
    let _saveTimer = null;
    const scheduleSave = () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        if (flags.draftDone) return;
        try {
          const itemsData = Array.from(itemsContainer.children).map((r) => r._getValues());
          const feesData = Array.from(feesContainer.children).map((r) => r._getValues());
          const payload = {
            customerId: customerSelect.value,
            status: statusSelect.value,
            receivedDate: receivedDateInput.value,
            dueDate: dueDateInput.value,
            discountType: discountTypeSelect.value,
            discountValue: Number(discountValueInput.value) || 0,
            deposit: Number(depositInput.value) || 0,
            cost: Number(costInput.value) || 0,
            notes: notesInput.value,
            image: imagePicker.getValue() || '',
            items: itemsData,
            fees: feesData,
          };
          draft.save(DRAFT_KEY, payload);
        } catch (e) {
          console.warn('[OrderForm] draft save failed:', e);
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
      try { if (!flags.draftDone) scheduleSave(); } catch { /* ignore */ }
      return origHandleClose.apply(this, arguments);
    };
  }
}
