/* ==========================================================================
   orders-item-rows.js — صفّا البند والرسم في نموذج الطلب (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون تغيير منطق. syncTypesDatalist صارت تستلم الأنواع معاملاً (كانت تقرأ state).
   buildItemRow يعيد orders.js تصديره كما كان.
   ========================================================================== */

import { el } from '../core/dom.js';
import { uid, formatEGP, toNonNegative } from '../core/utils.js';
import { findInCatalog } from '../services/item-catalog.js';
import { EXTRA_FEE_TYPES } from './orders-logic.js';

export const TYPES_DL_ID = 'jalabiya-types-dl';

export function syncTypesDatalist(jalabiyaTypes) {
  try {
    let dl = document.getElementById(TYPES_DL_ID);
    if (!dl) { dl = document.createElement('datalist'); dl.id = TYPES_DL_ID; document.body.appendChild(dl); }
    dl.replaceChildren(...jalabiyaTypes.map((t) => {
      const o = document.createElement('option');
      o.value = t.name;
      if (t.price) o.label = t.name + ' — ' + t.price + ' ج.م';
      return o;
    }));
  } catch (e) { /* اختياري */ }
}

const CUSTOM_ITEM = '__custom__';

/**
 * صف بند. اسم البند يُختار من قائمة منسدلة أصلية (تعمل على الجوال بخلاف datalist)
 * تضم أنواع الإعدادات والأسماء المستخدمة سابقاً، مع خيار «اسم آخر» لكتابة اسم جديد.
 * حقل النص nameIn هو مصدر القيمة دائماً (يُخفى فقط حين يُختار عنصر من القائمة).
 */
export function buildItemRow(item, onRemove, catalog = []) {
  const nameIn = el('input', {
    className: 'input', type: 'text', placeholder: 'اكتب اسم البند (مثال: جلابية سادة)',
    'aria-label': 'اسم البند', value: item.name || '',
  });
  const priceIn = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0',
    'aria-label': 'السعر', value: item.price || '',
  });
  const qtyIn = el('input', {
    className: 'input', type: 'number', min: '1', step: '1', inputmode: 'numeric',
    'aria-label': 'الكمية', value: item.quantity || 1,
  });
  const totalEl = el('div', { className: 'order-item__total', 'aria-live': 'polite' });
  const updateTotal = () => {
    const v = toNonNegative(priceIn.value) * (toNonNegative(qtyIn.value) || 1);
    totalEl.textContent = v > 0 ? 'إجمالي البند: ' + formatEGP(v) : '';
  };
  priceIn.addEventListener('input', updateTotal);
  qtyIn.addEventListener('input', updateTotal);
  updateTotal();

  /* اختيار بند يملأ السعر إن كان فارغاً أو كان معبّأً تلقائياً من اختيار سابق (لا يكتب فوق سعر أدخله المستخدم) */
  nameIn.setAttribute('list', TYPES_DL_ID);   /* اقتراحات إضافية عند الكتابة اليدوية */
  let autoPrice = null;
  const applyPrice = (c) => {
    if (!c || !(Number(c.price) > 0)) return;
    const cur = Number(priceIn.value);
    if (!(cur > 0) || (autoPrice !== null && cur === autoPrice)) {
      autoPrice = Number(c.price);
      priceIn.value = String(autoPrice);
      priceIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  nameIn.addEventListener('change', () => applyPrice(findInCatalog(catalog, nameIn.value)));

  let nameSelect = null;
  if (catalog.length > 0) {
    nameSelect = el('select', { className: 'select', 'aria-label': 'اختر البند المطلوب' });
    nameSelect.appendChild(el('option', { value: '' }, '— اختر البند المطلوب —'));
    const optionOf = (c) => el('option', { value: c.name }, c.name + (c.price > 0 ? ' — ' + c.price + ' ج.م' : ''));
    const group = (label, list) => {
      if (list.length === 0) return;
      const g = el('optgroup', { label });
      list.forEach((c) => g.appendChild(optionOf(c)));
      nameSelect.appendChild(g);
    };
    group('أنواع الجلابيب', catalog.filter((c) => c.source === 'type'));
    group('استخدمتها في طلبات سابقة', catalog.filter((c) => c.source === 'history'));
    nameSelect.appendChild(el('option', { value: CUSTOM_ITEM }, '✍️ اسم آخر (اكتبه)…'));

    /* الحالة الابتدائية: اسم معروف → يظهر في القائمة؛ اسم غير معروف → حقل الكتابة؛ فارغ → القائمة فقط */
    const startName = nameIn.value.trim();
    const known = startName ? findInCatalog(catalog, startName) : null;
    if (known) { nameSelect.value = known.name; nameIn.style.display = 'none'; }
    else if (startName) { nameSelect.value = CUSTOM_ITEM; }
    else { nameSelect.value = ''; nameIn.style.display = 'none'; }

    nameSelect.addEventListener('change', () => {
      const v = nameSelect.value;
      if (v === CUSTOM_ITEM) {
        nameIn.style.display = '';
        nameIn.value = '';
        nameIn.dispatchEvent(new Event('input', { bubbles: true }));
        nameIn.focus();
        return;
      }
      nameIn.style.display = 'none';
      nameIn.value = v;
      nameIn.dispatchEvent(new Event('input', { bubbles: true }));   /* للمسودة التلقائية */
      applyPrice(findInCatalog(catalog, v));
    });
  }

  const labeled = (txt, input, cls) => el('label', { className: 'order-item__f ' + (cls || '') }, [
    el('span', { className: 'order-item__lbl' }, txt), input,
  ]);

  const row = el('div', { className: 'order-item' }, [
    el('div', { className: 'order-item__name' }, nameSelect ? [nameSelect, nameIn] : [nameIn]),
    labeled('السعر (ج.م)', priceIn),
    labeled('الكمية', qtyIn, 'order-item__f--qty'),
    el('button', {
      className: 'btn btn--sm btn--danger order-item__remove', type: 'button',
      'aria-label': 'حذف البند', title: 'حذف البند',
      onClick: () => onRemove(row),
    }, '✕'),
    totalEl,
  ]);

  row._getValues = () => ({
    id: item.id || uid(),
    name: nameIn.value.trim() || 'بند',
    price: toNonNegative(priceIn.value),
    quantity: toNonNegative(qtyIn.value) || 1,
  });

  return row;
}

export function buildFeeRow(fee, onRemove) {
  const typeSelect = el('select', { className: 'select', style: { flex: '2' } });
  EXTRA_FEE_TYPES.forEach((t) => {
    const o = el('option', { value: t.id }, t.label);
    if (fee.feeType === t.id) o.selected = true;
    typeSelect.appendChild(o);
  });

  const typeModeSelect = el('select', { className: 'select', style: { width: '80px' } });
  ['percent', 'fixed'].forEach((m) => {
    const o = el('option', { value: m }, m === 'percent' ? '%' : 'ج.م');
    if (fee.type === m) o.selected = true;
    typeModeSelect.appendChild(o);
  });

  const valueIn = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: fee.value || '', style: { width: '90px' },
  });

  const row = el('div', {
    style: { display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' },
  }, [
    typeSelect, typeModeSelect, valueIn,
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      style: { flexShrink: '0' },
      onClick: () => onRemove(row),
    }, '✕'),
  ]);

  row._getValues = () => ({
    id: fee.id || uid(),
    feeType: typeSelect.value,
    type: typeModeSelect.value,
    value: toNonNegative(valueIn.value),
  });

  return row;
}
