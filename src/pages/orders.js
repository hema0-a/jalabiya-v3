/* ==========================================================================
   orders.js — صفحة الطلبات (CRUD كامل + فلاتر + معاينة + طباعة + رسائل)
   ==========================================================================
   - نموذج متعدد العناصر (items[]) + خصم + رسوم + مقدم + تاريخ القماش.
   - زر 🖨️ طباعة + زر 📱 رسالة (WhatsApp Templates).
   - توافق خلفي مع الطلبات القديمة.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { uid, formatEGP, formatDate } from '../core/utils.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewOrder } from '../ui/quick-preview.js';
import { printOrderInvoice } from '../services/invoice-print.js';
import { getOrderMessageOptions } from '../services/auto-messages.js';

/* --- الحالة --- */
let state = {
  orders: [],
  customers: [],
  customerMap: {},
  activeFilter: 'all',
  container: null,
};

/* --- الحالات --- */
const STATUS_MAP = {
  pending:     { label: 'قيد الانتظار', badge: 'badge--warning' },
  in_progress: { label: 'قيد التنفيذ',  badge: 'badge--info'    },
  ready:       { label: 'جاهز للتسليم', badge: 'badge--accent'  },
  delivered:   { label: 'تم التسليم',   badge: 'badge--success' },
  cancelled:   { label: 'ملغي',         badge: 'badge--danger'  },
};

const STATUS_ORDER = ['pending', 'in_progress', 'ready', 'delivered', 'cancelled'];

const EXTRA_FEE_TYPES = [
  { id: 'urgency',   label: 'استعجال',    value: 20 },
  { id: 'modify',    label: 'تعديلات',    value: 10 },
  { id: 'delivery',  label: 'توصيل',      value: 0  },
  { id: 'packaging', label: 'تغليف مميز', value: 5  },
  { id: 'other',     label: 'أخرى',       value: 0  },
];

/* ==========================================================================
   1. الفلترة
   ========================================================================== */

export function filterOrders(list, filterId) {
  if (filterId === 'all') return list;
  return list.filter((o) => o.status === filterId);
}

/* ==========================================================================
   2. الحسابات
   ========================================================================== */

function computeTotals(items, discountType, discountValue, extraFees) {
  const subtotal = (items || []).reduce(
    (s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0
  );
  const dv = Number(discountValue) || 0;
  let discountAmount = 0;
  if (discountType === 'percent') discountAmount = subtotal * (dv / 100);
  else if (discountType === 'fixed') discountAmount = dv;
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
  const extraFeesTotal = (extraFees || []).reduce((s, f) => {
    const v = Number(f.value) || 0;
    if (f.type === 'percent') return s + subtotal * (v / 100);
    return s + v;
  }, 0);
  const amount = Math.max(0, subtotal - discountAmount + extraFeesTotal);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    extraFeesTotal: Math.round(extraFeesTotal * 100) / 100,
    amount: Math.round(amount * 100) / 100,
  };
}

function itemsFromOrder(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it) => ({
      id: it.id || uid(),
      name: it.name || 'بند',
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
    }));
  }
  return [{
    id: uid(),
    name: order.notes || order.garmentType || 'طلب جلابية',
    price: Number(order.amount) || 0,
    quantity: Number(order.quantity) || 1,
  }];
}

/* ==========================================================================
   3. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [ordersList, customersList] = await Promise.all([
    orders.list(),
    customers.list(),
  ]);
  ordersList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.orders = ordersList;
  state.customers = customersList;
  state.customerMap = {};
  customersList.forEach((c) => { state.customerMap[c.id] = c; });
}

/* ==========================================================================
   4. النموذج
   ========================================================================== */

function buildItemRow(item, onRemove) {
  const nameIn = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم البند',
    value: item.name || '', 'data-field': 'name',
    style: { flex: '2', minWidth: '0' },
  });
  const priceIn = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: 'السعر',
    value: item.price || '', 'data-field': 'price',
    style: { flex: '1', minWidth: '0' },
  });
  const qtyIn = el('input', {
    className: 'input', type: 'number', min: '1', step: '1', placeholder: 'الكمية',
    value: item.quantity || 1, 'data-field': 'quantity',
    style: { width: '70px' },
  });

  const row = el('div', {
    style: { display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' },
  }, [
    nameIn, priceIn, qtyIn,
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      style: { flexShrink: '0' },
      onClick: () => onRemove(row),
    }, '✕'),
  ]);

  row._getValues = () => ({
    id: item.id || uid(),
    name: nameIn.value.trim() || 'بند',
    price: Number(priceIn.value) || 0,
    quantity: Number(qtyIn.value) || 1,
  });

  return row;
}

function buildFeeRow(fee, onRemove) {
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
    value: fee.value || '', 'data-field': 'value',
    style: { width: '90px' },
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
    value: Number(valueIn.value) || 0,
  });

  return row;
}

function openOrderForm(existing = null) {
  const isEdit = existing !== null;

  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— اختر عميلاً —'));
  state.customers.forEach((c) => {
    customerSelect.appendChild(el('option', { value: c.id }, c.name + (c.phone ? ' (' + c.phone + ')' : '')));
  });
  if (isEdit && existing.customerId) customerSelect.value = existing.customerId;

  const statusSelect = el('select', { className: 'select' });
  STATUS_ORDER.forEach((s) => {
    statusSelect.appendChild(el('option', { value: s }, STATUS_MAP[s].label));
  });
  statusSelect.value = isEdit ? existing.status : 'pending';

  const receivedDateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.receivedDate) {
    receivedDateInput.value = new Date(existing.receivedDate).toISOString().slice(0, 10);
  }

  const dueDateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = new Date(existing.dueDate).toISOString().slice(0, 10);
  }

  const itemsContainer = el('div', {});
  const initialItems = isEdit ? itemsFromOrder(existing) : [{
    id: uid(), name: '', price: 0, quantity: 1,
  }];

  function addItemRow(item) {
    const row = buildItemRow(item, (r) => {
      if (itemsContainer.children.length <= 1) {
        toast.warning('يجب بند واحد على الأقل');
        return;
      }
      itemsContainer.removeChild(r);
      recalc();
    });
    itemsContainer.appendChild(row);
  }

  initialItems.forEach((it) => addItemRow(it));

  const addItemBtn = el('button', {
    className: 'btn btn--sm btn--secondary', type: 'button',
    onClick: () => { addItemRow({ id: uid(), name: '', price: 0, quantity: 1 }); recalc(); },
  }, '➕ إضافة بند');

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

  const feesContainer = el('div', {});
  const initialFees = isEdit && Array.isArray(existing.extraFees) ? existing.extraFees : [];

  function addFeeRow(fee) {
    const row = buildFeeRow(fee, (r) => {
      feesContainer.removeChild(r);
      recalc();
    });
    feesContainer.appendChild(row);
  }

  initialFees.forEach((f) => addFeeRow(f));

  const addFeeBtn = el('button', {
    className: 'btn btn--sm btn--secondary', type: 'button',
    onClick: () => {
      addFeeRow({ id: uid(), feeType: 'urgency', type: 'percent', value: 20 });
      recalc();
    },
  }, '➕ إضافة رسم');

  const depositInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.deposit || '') : '',
  });
  depositInput.addEventListener('input', recalc);

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const totalsSummary = el('div', {
    style: {
      padding: '12px', background: '#F6F1E6',
      borderRadius: '8px', fontSize: '13px', lineHeight: '1.8',
    },
  });

  function recalc() {
    const items = Array.from(itemsContainer.children).map((r) => r._getValues());
    const fees = Array.from(feesContainer.children).map((r) => r._getValues());
    const t = computeTotals(items, discountTypeSelect.value, discountValueInput.value, fees);
    const deposit = Number(depositInput.value) || 0;
    const remaining = Math.max(0, t.amount - deposit);

    clear(totalsSummary);
    const row = (lbl, val, color) => el('div', {
      style: { display: 'flex', justifyContent: 'space-between', color: color || '#123C2F' },
    }, [el('span', {}, lbl), el('span', { style: { fontWeight: '600' } }, val)]);

    totalsSummary.appendChild(row('المجموع الفرعي:', formatEGP(t.subtotal)));
    if (t.discountAmount > 0) totalsSummary.appendChild(row('الخصم:', '− ' + formatEGP(t.discountAmount), '#C62828'));
    if (t.extraFeesTotal > 0) totalsSummary.appendChild(row('الرسوم الإضافية:', '+ ' + formatEGP(t.extraFeesTotal), '#F57C00'));
    totalsSummary.appendChild(row('الإجمالي:', formatEGP(t.amount)));
    if (deposit > 0) totalsSummary.appendChild(row('المقدم:', '− ' + formatEGP(deposit), '#2E7D32'));
    totalsSummary.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5DDD0', marginTop: '6px', paddingTop: '6px', fontWeight: '700' },
    }, [
      el('span', {}, 'المتبقي:'),
      el('span', { style: { color: remaining > 0 ? '#F57C00' : '#2E7D32' } }, formatEGP(remaining)),
    ]));
  }

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العميل *'), customerSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الحالة'), statusSelect]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'استلام القماش'), receivedDateInput]),
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'تاريخ التسليم'), dueDateInput]),
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '📦 بنود الطلب'),
      itemsContainer,
      addItemBtn,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '🎁 خصم'),
      discountTypeSelect,
      discountValueInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '➕ رسوم إضافية'),
      feesContainer,
      addFeeBtn,
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, '💰 المقدم'), depositInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, '📝 ملاحظات'), notesInput]),
    totalsSummary,
  ]);

  itemsContainer.addEventListener('input', recalc);
  recalc();

  const handle = modal.open({
    title: isEdit ? 'تعديل طلب' : 'إضافة طلب',
    body,
    closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          if (!customerId) { toast.warning('اختر عميلاً'); return; }

          const items = Array.from(itemsContainer.children)
            .map((r) => r._getValues())
            .filter((it) => it.name && it.name !== 'بند');

          if (items.length === 0) { toast.warning('أضف بنداً واحداً على الأقل'); return; }

          const extraFees = Array.from(feesContainer.children)
            .map((r) => r._getValues())
            .filter((f) => f.value > 0);

          const dt = discountTypeSelect.value;
          const dv = Number(discountValueInput.value) || 0;
          const deposit = Number(depositInput.value) || 0;
          const totals = computeTotals(items, dt, dv, extraFees);

          const data = {
            customerId,
            status: statusSelect.value,
            dueDate: dueDateInput.value ? new Date(dueDateInput.value).getTime() : null,
            receivedDate: receivedDateInput.value ? new Date(receivedDateInput.value).getTime() : null,
            items,
            discountType: dt,
            discountValue: dv,
            discountAmount: totals.discountAmount,
            extraFees,
            extraFeesTotal: totals.extraFeesTotal,
            subtotal: totals.subtotal,
            deposit,
            amount: totals.amount,
            notes: notesInput.value.trim(),
          };

          try {
            if (isEdit) { await orders.update(existing.id, data); toast.success('تم تحديث الطلب'); }
            else { await orders.create(data); toast.success('تم إضافة الطلب'); }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل الحفظ: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   5. حذف + تغيير الحالة + طباعة + رسالة
   ========================================================================== */

async function deleteOrder(order) {
  const c = state.customerMap[order.customerId];
  const label = c ? c.name : 'طلب';
  const ok = await modal.confirm({
    title: 'حذف طلب',
    message: 'هل أنت متأكد من حذف طلب "' + label + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('orders', order);
    await orders.remove(order.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل الحذف: ' + err.message); }
}

async function advanceStatus(order) {
  const idx = STATUS_ORDER.indexOf(order.status);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) {
    toast.info('لا يمكن تغيير الحالة');
    return;
  }
  const next = STATUS_ORDER[idx + 1];
  try {
    await orders.update(order.id, { status: next });
    toast.success('الحالة: ' + STATUS_MAP[next].label);
    await refreshAll();
  } catch (err) { toast.danger('فشل التحديث: ' + err.message); }
}

async function printInvoice(order) {
  const c = state.customerMap[order.customerId] || null;
  try {
    await printOrderInvoice(order, c);
  } catch (err) {
    console.error('[printInvoice]', err);
    toast.danger('فشل فتح نافذة الطباعة');
  }
}

/**
 * فتح نافذة اختيار قالب الرسالة + إرسال WhatsApp.
 * @param {Object} order
 */
async function openMessageMenu(order) {
  const customer = state.customerMap[order.customerId];
  if (!customer || !customer.phone) {
    toast.warning('لا يوجد هاتف مسجَّل للعميل');
    return;
  }

  const options = await getOrderMessageOptions(order, customer);
  if (options.length === 0) {
    toast.warning('لا توجد قوالب مفعَّلة');
    return;
  }

  const body = el('div', {});

  body.appendChild(el('div', {
    style: {
      padding: '10px 12px', background: '#F6F1E6', borderRadius: '8px',
      fontSize: '12px', color: '#666', marginBottom: '12px', lineHeight: '1.5',
    },
  }, 'سيتم فتح WhatsApp مع رسالة جاهزة. يمكنك تعديلها قبل الإرسال.'));

  options.forEach((opt) => {
    const preview = el('div', {
      style: {
        fontSize: '12px', color: '#666', marginTop: '6px',
        lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        maxHeight: '100px', overflowY: 'auto',
      },
    }, opt.text);

    const btn = el('button', {
      type: 'button',
      style: {
        display: 'block', width: '100%', textAlign: 'right',
        padding: '12px', border: '1px solid #E5DDD0',
        borderRadius: '10px', marginBottom: '8px',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
      },
      onClick: () => {
        modal.close();
        opt.send();
      },
    }, [
      el('div', {
        style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' },
      }, opt.icon + ' ' + opt.name),
      preview,
    ]);

    body.appendChild(btn);
  });

  modal.open({
    title: '📱 إرسال رسالة',
    body,
    closable: true,
    variant: 'sheet',
    actions: [_closeAction()],
  });
}

function _closeAction() {
  return { text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() };
}

/* ==========================================================================
   6. بطاقة الطلب
   ========================================================================== */

function buildOrderCard(o) {
  const c = state.customerMap[o.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const phone = c ? c.phone : '';
  const statusInfo = STATUS_MAP[o.status] || { label: o.status, badge: 'badge--info' };
  const itemsCount = Array.isArray(o.items) ? o.items.length : 0;

  const headerChildren = [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, name),
      phone ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, phone) : null,
    ]),
    el('span', { className: 'badge ' + statusInfo.badge }, statusInfo.label),
  ];

  const metaChildren = [];
  if (o.dueDate) metaChildren.push(el('span', {}, '📅 ' + formatDate(o.dueDate)));
  if (o.amount) metaChildren.push(el('span', {}, '💰 ' + formatEGP(o.amount)));
  if (itemsCount > 0) metaChildren.push(el('span', {}, '📦 ' + itemsCount + ' بند'));

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': o.id,
    onClick: () => previewOrder(o, c, () => openOrderForm(o)),
  }, [
    el('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px', marginBottom: '8px',
      },
    }, headerChildren),
    el('div', {
      style: {
        display: 'flex', gap: '12px', flexWrap: 'wrap',
        fontSize: '12px', color: '#666', marginBottom: '8px',
      },
    }, metaChildren),
  ]);

  if (o.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, o.notes));
  }

  const actionChildren = [
    el('button', {
      className: 'btn btn--sm btn--secondary',
      'data-action': 'edit',
      onClick: () => openOrderForm(o),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      'data-action': 'print',
      title: 'طباعة الفاتورة',
      onClick: () => printInvoice(o),
    }, '🖨️'),
    phone ? el('button', {
      className: 'btn btn--sm btn--ghost',
      'data-action': 'message',
      title: 'إرسال رسالة',
      onClick: () => openMessageMenu(o),
    }, '📱') : null,
  ].filter(Boolean);

  if (o.status !== 'delivered' && o.status !== 'cancelled') {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--primary',
      'data-action': 'advance',
      onClick: () => advanceStatus(o),
    }, '▶️'));
  }
  actionChildren.push(el('button', {
    className: 'btn btn--sm btn--danger',
    'data-action': 'delete',
    onClick: () => deleteOrder(o),
  }, '🗑️'));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, actionChildren));

  return card;
}

/* ==========================================================================
   7. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#orders-stats');
  if (!wrap) return;
  clear(wrap);

  const active = state.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const ready = state.orders.filter((o) => o.status === 'ready').length;
  const totalAmount = state.orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📦'),
    el('span', { className: 'stat__value' }, String(state.orders.length)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏳'),
    el('span', { className: 'stat__value' }, String(active)),
    el('span', { className: 'stat__label' }, 'نشط'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value' }, String(ready)),
    el('span', { className: 'stat__label' }, 'جاهز'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value' }, formatEGP(totalAmount)),
    el('span', { className: 'stat__label' }, 'إجمالي المبالغ'),
  ]));
}

function renderFilters() {
  const wrap = state.container?.querySelector('#orders-filters');
  if (!wrap) return;
  clear(wrap);

  const counts = { all: state.orders.length };
  STATUS_ORDER.forEach((s) => { counts[s] = 0; });
  state.orders.forEach((o) => { if (counts[o.status] != null) counts[o.status]++; });

  const items = [
    { id: 'all', label: 'الكل', count: counts.all },
    ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_MAP[s].label, count: counts[s] })),
  ];

  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': it.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters();
        renderList();
      },
    }, it.label + ' (' + it.count + ')'));
  });
}

function renderList() {
  const listContainer = state.container?.querySelector('#orders-list');
  if (!listContainer) return;
  clear(listContainer);

  const filtered = filterOrders(state.orders, state.activeFilter);

  if (filtered.length === 0) {
    listContainer.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '📦'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد طلبات'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة طلب" للبدء'),
    ]));
    return;
  }

  filtered.forEach((o) => listContainer.appendChild(buildOrderCard(o)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderFilters();
  renderList();
}

/* ==========================================================================
   8. API
   ========================================================================== */

export const ordersPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';

    container.appendChild(el('div', {
      id: 'orders-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openOrderForm(),
    }, '➕ إضافة طلب'));

    container.appendChild(el('div', {
      id: 'orders-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'orders-list' }));

    await refreshAll();
  },

  destroy() {
    state = { orders: [], customers: [], customerMap: {}, activeFilter: 'all', container: null };
  },
};
