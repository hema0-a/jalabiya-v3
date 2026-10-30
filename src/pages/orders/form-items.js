/* orders/form-items.js — بنود الطلب والرسوم والخصم وعلامة «عاجل» (v3.5.11) */

import { el } from '../../core/dom.js';
import { uid } from '../../core/utils.js';
import { toast } from '../../ui/toast.js';
import { buildItemCatalog } from '../../services/item-catalog.js';
import { itemsFromOrder } from './logic.js';
import { buildItemRow, buildFeeRow } from './item-rows.js';

export function buildItems(ctx, existing, f) {
  const { state } = ctx;
  const isEdit = existing !== null;
  const { recalc } = f;

  /* --- البنود --- */
  const itemsContainer = el('div', {});
  const initialItems = isEdit ? itemsFromOrder(existing) : [{ id: uid(), name: '', price: 0, quantity: 1 }];

  /* قائمة البنود المنسدلة: أنواع الإعدادات + أسماء الطلبات السابقة (بدون الطلب الجاري تعديله) */
  const itemCatalog = buildItemCatalog(state.jalabiyaTypes, state.orders.filter((o) => !existing || o.id !== existing.id));

  function addItemRow(item) {
    const row = buildItemRow(item, (r) => {
      if (itemsContainer.children.length <= 1) { toast.warning('يجب بند واحد على الأقل'); return; }
      itemsContainer.removeChild(r);
      recalc();
    }, itemCatalog);
    itemsContainer.appendChild(row);
  }

  initialItems.forEach((it) => addItemRow(it));

  const addItemBtn = el('button', {
    className: 'btn btn--sm btn--secondary btn--block', type: 'button', 'data-full': '1',
    onClick: () => {
      addItemRow({ id: uid(), name: '', price: 0, quantity: 1 }); recalc();
      /* جاهز للاختيار فوراً: القائمة المنسدلة إن وُجدت (وتُفتح مباشرة حيث يدعم المتصفح)، وإلا حقل الكتابة */
      const lastRow = itemsContainer.lastElementChild;
      const sel = lastRow?.querySelector('select');
      if (sel) { sel.focus(); try { sel.showPicker && sel.showPicker(); } catch (e) { /* اختياري */ } }
      else lastRow?.querySelector('input')?.focus();
    },
  }, '➕ إضافة بند');


  /* --- الخصم --- */
  const discountTypeSelect = el('select', { className: 'select' });
  [
    { v: 'none',    l: 'بدون خصم' },
    { v: 'percent', l: 'خصم %' },
    { v: 'fixed',   l: 'خصم ثابت (ج.م)' },
  ].forEach((o) => {
    const opt = el('option', { value: o.v }, o.l);
    if (isEdit ? (existing.discountType || 'none') === o.v : o.v === 'none') opt.selected = true;
    discountTypeSelect.appendChild(opt);
  });

  const discountValueInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.discountValue || '') : '',
    style: { marginTop: '6px', display: (isEdit && existing.discountType && existing.discountType !== 'none') ? '' : 'none' },
  });

  discountTypeSelect.addEventListener('change', () => {
    discountValueInput.style.display = discountTypeSelect.value === 'none' ? 'none' : '';
    recalc();
  });
  discountValueInput.addEventListener('input', recalc);


  /* --- الرسوم الإضافية --- */
  const feesContainer = el('div', {});
  const initialFees = isEdit && Array.isArray(existing.extraFees) ? existing.extraFees : [];

  function addFeeRow(fee) {
    const row = buildFeeRow(fee, (r) => { feesContainer.removeChild(r); recalc(); });
    feesContainer.appendChild(row);
  }

  initialFees.forEach((f) => addFeeRow(f));

  const addFeeBtn = el('button', {
    className: 'btn btn--sm btn--secondary', type: 'button',
    onClick: () => { addFeeRow({ id: uid(), feeType: 'urgency', type: 'percent', value: 20 }); recalc(); },
  }, '➕ إضافة رسم');


  /* --- عاجل (v3.3.51): شارة حمراء + يتقدّم القوائم + يقترح رسم استعجال --- */
  const urgentInput = el('input', { type: 'checkbox' });
  urgentInput.checked = !!(isEdit && existing.urgent);
  urgentInput.addEventListener('change', () => {
    if (!urgentInput.checked) return;
    const hasUrgencyFee = Array.from(feesContainer.children).some((r) => {
      try { return r._getValues().feeType === 'urgency'; } catch { return false; }
    });
    if (!hasUrgencyFee) {
      addFeeRow({ id: uid(), feeType: 'urgency', type: 'percent', value: 20 });
      recalc();
      toast.info('⚡ أُضيف رسم استعجال 20% — عدّله أو احذفه من «رسوم إضافية»');
    }
  });
  const urgentField = el('label', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: '#B3261E', padding: '6px 0' },
  }, [urgentInput, el('span', {}, '⚡ طلب عاجل')]);
  Object.assign(f, {
    itemsContainer, addItemRow, addItemBtn, discountTypeSelect, discountValueInput,
    feesContainer, addFeeRow, addFeeBtn, urgentInput, urgentField,
  });
}
