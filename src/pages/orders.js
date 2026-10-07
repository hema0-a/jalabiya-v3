/* ==========================================================================
   orders.js — صفحة الطلبات (كل الميزات + صورة مرجعية)
   ==========================================================================
   - 3 طرق عرض: قائمة / كانبان / تجميع.
   - نموذج كامل + اقتراح موعد + صورة مرجعية + معاينة + طباعة + رسائل.
   - مؤقت العمل + توقيع التسليم + شريط الحد + تنبيهات عاجلة.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { uid, formatEGP, formatDate } from '../core/utils.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { trash } from '../data/repos/trash.js';
import { settings } from '../data/repos/settings.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewOrder } from '../ui/quick-preview.js';
import { openSignaturePad } from '../ui/signature-pad.js';
import { createOrderImagePicker } from '../ui/order-image-picker.js';
import { printOrderInvoice } from '../services/invoice-print.js';
import { getOrderMessageOptions } from '../services/auto-messages.js';
import { suggestDueDate } from '../services/order-scheduler.js';
import {
  getDeadlineInfo, getPickupInfo, formatDuration,
  getTotalWorkTime, getActiveSession, startSession, stopSession,
} from '../services/order-timing.js';

/* --- الحالة --- */
let state = {
  orders: [],
  customers: [],
  customerMap: {},
  activeFilter: 'all',
  activeView: 'list',
  scheduleConfig: { dayOffWeekday: 0, dailyOrderLimit: 0 },
  container: null,
  _timerInterval: null,
};

/* --- الحالات --- */
const STATUS_MAP = {
  pending:     { label: 'قيد الانتظار', badge: 'badge--warning', color: '#F57C00' },
  in_progress: { label: 'قيد التنفيذ',  badge: 'badge--info',    color: '#1565C0' },
  ready:       { label: 'جاهز للتسليم', badge: 'badge--accent',  color: '#6A1B9A' },
  delivered:   { label: 'تم التسليم',   badge: 'badge--success', color: '#2E7D32' },
  cancelled:   { label: 'ملغي',         badge: 'badge--danger',  color: '#C62828' },
};

const STATUS_ORDER = ['pending', 'in_progress', 'ready', 'delivered', 'cancelled'];

const EXTRA_FEE_TYPES = [
  { id: 'urgency',   label: 'استعجال',    value: 20 },
  { id: 'modify',    label: 'تعديلات',    value: 10 },
  { id: 'delivery',  label: 'توصيل',      value: 0  },
  { id: 'packaging', label: 'تغليف مميز', value: 5  },
  { id: 'other',     label: 'أخرى',       value: 0  },
];

const DAY_MS = 86400000;

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

function orderType(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return String(order.items[0].name || '').trim() || 'بدون نوع';
  }
  return String(order.garmentType || order.notes || 'بدون نوع').trim();
}

export function groupOrders(list) {
  const groups = new Map();
  list.forEach((o) => {
    const cid = o.customerId || 'unknown';
    const type = orderType(o).toLowerCase();
    const key = cid + '::' + type;
    if (!groups.has(key)) {
      groups.set(key, { key, customerId: cid, type: orderType(o), orders: [], totalAmount: 0 });
    }
    const g = groups.get(key);
    g.orders.push(o);
    g.totalAmount += Number(o.amount) || 0;
  });
  return Array.from(groups.values())
    .filter((g) => g.orders.length > 1)
    .sort((a, b) => b.orders.length - a.orders.length);
}

/* ==========================================================================
   3. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [ordersList, customersList, s] = await Promise.all([
    orders.list(),
    customers.list(),
    settings.get().catch(() => ({})),
  ]);
  ordersList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.orders = ordersList;
  state.customers = customersList;
  state.customerMap = {};
  customersList.forEach((c) => { state.customerMap[c.id] = c; });

  if (s && s.dailyLimit) {
    state.scheduleConfig = {
      dayOffWeekday: Number(s.dailyLimit.dayOffWeekday ?? 0),
      dailyOrderLimit: Number(s.dailyLimit.dailyOrderLimit) || 0,
    };
  }
}

/* ==========================================================================
   4. النموذج
   ========================================================================== */

function buildItemRow(item, onRemove) {
  const nameIn = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم البند',
    value: item.name || '', style: { flex: '2', minWidth: '0' },
  });
  const priceIn = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: 'السعر',
    value: item.price || '', style: { flex: '1', minWidth: '0' },
  });
  const qtyIn = el('input', {
    className: 'input', type: 'number', min: '1', step: '1', placeholder: 'الكمية',
    value: item.quantity || 1, style: { width: '70px' },
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

  const dueDateInput = el('input', { className: 'input', type: 'date', style: { flex: '1' } });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = new Date(existing.dueDate).toISOString().slice(0, 10);
  }

  const suggestBtn = el('button', {
    className: 'btn btn--sm btn--secondary', type: 'button',
    title: 'اقتراح موعد تلقائي',
    style: { flexShrink: '0' },
    onClick: async () => {
      try {
        const suggestion = suggestDueDate(state.orders, {
          dayOffWeekday: state.scheduleConfig.dayOffWeekday,
          dailyOrderLimit: state.scheduleConfig.dailyOrderLimit,
          minDays: 3, maxLookaheadDays: 30,
          excludeOrderId: existing ? existing.id : null,
        });
        dueDateInput.value = new Date(suggestion.timestamp).toISOString().slice(0, 10);
        toast.success('💡 ' + suggestion.reason + ': ' + formatDate(suggestion.timestamp));
      } catch (e) { toast.danger('فشل الاقتراح'); }
    },
  }, '✨');

  /* --- الصورة المرجعية --- */
  const imagePicker = createOrderImagePicker({
    value: isEdit ? (existing.referenceImage || '') : '',
    label: '🖼️ صورة مرجعية',
    hint: 'صورة الموديل المطلوب (اختياري)',
  });

  /* --- البنود --- */
  const itemsContainer = el('div', {});
  const initialItems = isEdit ? itemsFromOrder(existing) : [{ id: uid(), name: '', price: 0, quantity: 1 }];

  function addItemRow(item) {
    const row = buildItemRow(item, (r) => {
      if (itemsContainer.children.length <= 1) { toast.warning('يجب بند واحد على الأقل'); return; }
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

  /* --- المقدم --- */
  const depositInput = el('input', {
    className: 'input', type: 'number', min: '0', step: '0.01', placeholder: '0',
    value: isEdit ? (existing.deposit || '') : '',
  });
  depositInput.addEventListener('input', recalc);

  /* --- الملاحظات --- */
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  /* --- ملخص الحساب --- */
  const totalsSummary = el('div', {
    style: { padding: '12px', background: '#F6F1E6', borderRadius: '8px', fontSize: '13px', lineHeight: '1.8' },
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

  /* --- body --- */
  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العميل *'), customerSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الحالة'), statusSelect]),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
      el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'استلام القماش'), receivedDateInput]),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label' }, 'تاريخ التسليم'),
        el('div', { style: { display: 'flex', gap: '6px' } }, [dueDateInput, suggestBtn]),
      ]),
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '📦 بنود الطلب'),
      itemsContainer, addItemBtn,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '🎁 خصم'),
      discountTypeSelect, discountValueInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '➕ رسوم إضافية'),
      feesContainer, addFeeBtn,
    ]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, '💰 المقدم'), depositInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, '📝 ملاحظات'), notesInput]),
    imagePicker.node,
    totalsSummary,
  ]);

  itemsContainer.addEventListener('input', recalc);
  recalc();

  const handle = modal.open({
    title: isEdit ? 'تعديل طلب' : 'إضافة طلب',
    body, closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          if (!customerId) { toast.warning('اختر عميلاً'); return; }
          const items = Array.from(itemsContainer.children)
            .map((r) => r._getValues()).filter((it) => it.name && it.name !== 'بند');
          if (items.length === 0) { toast.warning('أضف بنداً واحداً على الأقل'); return; }

          const extraFees = Array.from(feesContainer.children)
            .map((r) => r._getValues()).filter((f) => f.value > 0);

          const dt = discountTypeSelect.value;
          const dv = Number(discountValueInput.value) || 0;
          const deposit = Number(depositInput.value) || 0;
          const totals = computeTotals(items, dt, dv, extraFees);

          const data = {
            customerId, status: statusSelect.value,
            dueDate: dueDateInput.value ? new Date(dueDateInput.value).getTime() : null,
            receivedDate: receivedDateInput.value ? new Date(receivedDateInput.value).getTime() : null,
            items, discountType: dt, discountValue: dv, discountAmount: totals.discountAmount,
            extraFees, extraFeesTotal: totals.extraFeesTotal,
            subtotal: totals.subtotal, deposit, amount: totals.amount,
            notes: notesInput.value.trim(),
            referenceImage: imagePicker.getValue() || '',
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
   5. عمليات
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
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) { toast.info('لا يمكن تغيير الحالة'); return; }
  const next = STATUS_ORDER[idx + 1];
  try {
    await orders.update(order.id, { status: next });
    toast.success('الحالة: ' + STATUS_MAP[next].label);
    await refreshAll();
  } catch (err) { toast.danger('فشل التحديث: ' + err.message); }
}

async function printInvoice(order) {
  const c = state.customerMap[order.customerId] || null;
  try { await printOrderInvoice(order, c); }
  catch (err) { toast.danger('فشل فتح نافذة الطباعة'); }
}

async function deliverWithSignature(order) {
  const confirmed = await modal.confirm({
    title: 'تأكيد التسليم',
    message: 'سيتم تعليم الطلب كمُسلَّم. هل العميل في انتظار التسليم الآن؟',
    confirmText: 'نعم، ابدأ التوقيع', cancelText: 'إلغاء',
  });
  if (!confirmed) return;
  const signature = await openSignaturePad({
    title: '✍️ توقيع استلام الطلب',
    hint: 'وقّع هنا لاستلام الطلب — سيُحفظ التوقيع مع الطلب',
  });
  if (!signature) { toast.info('تم إلغاء التسليم'); return; }
  try {
    await orders.update(order.id, { status: 'delivered', signature, deliveredAt: Date.now() });
    toast.success('تم التسليم مع التوقيع ✅');
    await refreshAll();
  } catch (err) { toast.danger('فشل التسليم: ' + err.message); }
}

function showSignature(dataUrl) {
  if (!dataUrl) return;
  const body = el('div', {}, [
    el('img', {
      src: dataUrl, alt: 'التوقيع',
      style: { width: '100%', borderRadius: '12px', border: '1px solid #E5DDD0', background: '#fff' },
    }),
  ]);
  modal.open({
    title: '✍️ التوقيع المحفوظ', body, closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

/**
 * عرض الصورة المرجعية بملء الشاشة (lightbox).
 * @param {string} dataUrl
 * @param {string} [title='الصورة المرجعية']
 */
function showReferenceImage(dataUrl, title = 'الصورة المرجعية') {
  if (!dataUrl) return;
  const body = el('div', {}, [
    el('img', {
      src: dataUrl, alt: title,
      style: { width: '100%', maxHeight: '75vh', objectFit: 'contain',
        borderRadius: '12px', background: '#fff' },
    }),
  ]);
  modal.open({
    title: '🖼️ ' + title, body, closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

async function openMessageMenu(order) {
  const customer = state.customerMap[order.customerId];
  if (!customer || !customer.phone) { toast.warning('لا يوجد هاتف مسجَّل للعميل'); return; }
  const options = await getOrderMessageOptions(order, customer);
  if (options.length === 0) { toast.warning('لا توجد قوالب مفعَّلة'); return; }

  const body = el('div', {});
  options.forEach((opt) => {
    body.appendChild(el('button', {
      type: 'button',
      style: {
        display: 'block', width: '100%', textAlign: 'right',
        padding: '12px', border: '1px solid #E5DDD0',
        borderRadius: '10px', marginBottom: '8px',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
      },
      onClick: () => { modal.close(); opt.send(); },
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } },
        opt.icon + ' ' + opt.name),
      el('div', {
        style: { fontSize: '12px', color: '#666', marginTop: '6px', whiteSpace: 'pre-wrap' },
      }, opt.text),
    ]));
  });

  modal.open({
    title: '📱 إرسال رسالة', body, closable: true, variant: 'sheet',
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

async function toggleTimer(order) {
  const sessions = Array.isArray(order.workSessions) ? order.workSessions : [];
  const isActive = getActiveSession(sessions);
  try {
    const newSessions = isActive ? stopSession(sessions) : startSession(sessions);
    await orders.update(order.id, { workSessions: newSessions });
    toast.info(isActive ? 'تم إيقاف المؤقت' : 'بدأ المؤقت ⏱️');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

/* ==========================================================================
   6. شريط الحد اليومي
   ========================================================================== */

function buildDailyLimitBar() {
  const limit = state.scheduleConfig.dailyOrderLimit || 0;
  if (limit <= 0) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startMs = startOfToday.getTime();
  const endMs = startMs + DAY_MS;

  const todayTotal = state.orders
    .filter((o) => o.createdAt && o.createdAt >= startMs && o.createdAt < endMs)
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);

  const percent = Math.min(100, Math.round((todayTotal / limit) * 100));
  const exceeded = todayTotal > limit;
  const near = !exceeded && percent >= 80;
  const barColor = exceeded ? '#C62828' : (near ? '#F57C00' : '#2E7D32');
  const bgColor = exceeded ? '#FFEBEE' : (near ? '#FFF3E0' : '#E8F5E9');

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '16px', padding: '12px', background: bgColor, border: '1px solid ' + barColor + '33' },
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  }, [
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: barColor } },
      exceeded ? '🚨 تجاوزت الحد اليومي' : (near ? '⚠️ اقتربت من الحد اليومي' : '📊 الحد اليومي')),
    el('div', { style: { fontSize: '13px', fontWeight: '700', color: barColor } },
      formatEGP(todayTotal) + ' / ' + formatEGP(limit)),
  ]));

  card.appendChild(el('div', {
    style: { background: 'rgba(0,0,0,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden' },
  }, [
    el('div', { style: { width: percent + '%', height: '100%', background: barColor, transition: 'width 0.4s' } }),
  ]));

  card.appendChild(el('div', {
    style: { fontSize: '11px', color: '#666', marginTop: '4px', textAlign: 'left' },
  }, percent + '%'));

  return card;
}

/* ==========================================================================
   7. بطاقة التنبيهات العاجلة
   ========================================================================== */

function buildUrgentAlerts() {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const overdue = state.orders.filter((o) =>
    o.dueDate && o.dueDate < now &&
    o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const needPickup = state.orders.filter((o) =>
    !o.receivedDate && o.dueDate &&
    o.dueDate >= todayMs && o.dueDate <= todayMs + 3 * DAY_MS &&
    o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const ready = state.orders.filter((o) => o.status === 'ready');

  if (overdue.length === 0 && needPickup.length === 0 && ready.length === 0) return null;

  const card = el('div', { className: 'card', style: { marginBottom: '16px', padding: '12px' } });
  card.appendChild(el('div', {
    style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', marginBottom: '10px' },
  }, '🔔 تنبيهات عاجلة'));

  const items = [];

  if (overdue.length > 0) {
    items.push({
      icon: '🚨', color: '#C62828', bg: '#FFEBEE',
      label: overdue.length + ' طلب متأخر',
      sub: overdue.slice(0, 2).map((o) => {
        const c = state.customerMap[o.customerId];
        return (c ? c.name : 'عميل') + ' · ' + formatDate(o.dueDate);
      }).join(' — '),
    });
  }

  if (needPickup.length > 0) {
    items.push({
      icon: '🧵', color: '#F57C00', bg: '#FFF3E0',
      label: needPickup.length + ' طلب يحتاج استلام قماش',
      sub: 'التسليم خلال 3 أيام',
    });
  }

  if (ready.length > 0) {
    items.push({
      icon: '✅', color: '#2E7D32', bg: '#E8F5E9',
      label: ready.length + ' طلب جاهز للتسليم',
      sub: 'في انتظار العميل',
    });
  }

  items.forEach((it) => {
    card.appendChild(el('div', {
      style: { padding: '8px 10px', background: it.bg, borderRadius: '8px',
        marginBottom: '6px', borderRight: '3px solid ' + it.color },
    }, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' } }, [
        el('span', { style: { fontSize: '16px' } }, it.icon),
        el('span', { style: { fontSize: '13px', fontWeight: '600', color: it.color } }, it.label),
      ]),
      it.sub ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } }, it.sub) : null,
    ]));
  });

  return card;
}

/* ==========================================================================
   8. بطاقة الطلب
   ========================================================================== */

function buildOrderCard(o) {
  const c = state.customerMap[o.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const phone = c ? c.phone : '';
  const statusInfo = STATUS_MAP[o.status] || { label: o.status, badge: 'badge--info' };
  const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
  const hasImage = !!o.referenceImage;

  const isDelivered = o.status === 'delivered' || o.status === 'cancelled';
  const canDeliver = o.status === 'ready' || o.status === 'in_progress';
  const deadline = getDeadlineInfo(o.dueDate);
  const pickup = getPickupInfo(o.receivedDate);
  const sessions = Array.isArray(o.workSessions) ? o.workSessions : [];
  const isRunning = getActiveSession(sessions);
  const totalMs = getTotalWorkTime(sessions);

  /* --- الصورة المصغّرة (إن وُجدت) --- */
  const thumb = hasImage ? el('img', {
    src: o.referenceImage, alt: 'مرجع',
    style: {
      width: '56px', height: '56px', borderRadius: '8px',
      objectFit: 'cover', flexShrink: '0', cursor: 'pointer',
      border: '1px solid #E5DDD0',
    },
    onClick: (e) => {
      e.stopPropagation();
      showReferenceImage(o.referenceImage, 'صورة مرجعية — ' + name);
    },
  }) : null;

  const headerChildren = [
    thumb,
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, name),
      phone ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, phone) : null,
    ]),
    el('span', { className: 'badge ' + statusInfo.badge }, statusInfo.label),
  ].filter(Boolean);

  const badgesRow = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  });

  if (!isDelivered) {
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: deadline.color, background: deadline.bg },
    }, deadline.icon + ' ' + deadline.label));
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: pickup.color, background: pickup.bg },
    }, pickup.icon + ' ' + pickup.label));
  }

  if (totalMs > 0 || isRunning) {
    badgesRow.appendChild(el('span', {
      'data-timer-id': o.id,
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: isRunning ? '#2E7D32' : '#1565C0',
        background: isRunning ? '#E8F5E9' : '#E3F2FD' },
    }, (isRunning ? '⏱️ يعمل · ' : '⏱️ ') + formatDuration(totalMs)));
  }

  if (o.signature) {
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: '#2E7D32', background: '#E8F5E9', cursor: 'pointer' },
      onClick: (e) => { e.stopPropagation(); showSignature(o.signature); },
    }, '✍️ موقّع'));
  }

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
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px', marginBottom: '8px' },
    }, headerChildren),
    badgesRow.children.length > 0 ? badgesRow : null,
    el('div', {
      style: { display: 'flex', gap: '12px', flexWrap: 'wrap',
        fontSize: '12px', color: '#666', marginBottom: '8px' },
    }, metaChildren),
  ]);

  if (o.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, o.notes));
  }

  const actionChildren = [
    el('button', { className: 'btn btn--sm btn--secondary',
      onClick: () => openOrderForm(o) }, '✏️'),
    el('button', { className: 'btn btn--sm btn--ghost',
      title: 'طباعة', onClick: () => printInvoice(o) }, '🖨️'),
    phone ? el('button', { className: 'btn btn--sm btn--ghost',
      title: 'رسالة', onClick: () => openMessageMenu(o) }, '📱') : null,
  ].filter(Boolean);

  if (!isDelivered) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm ' + (isRunning ? 'btn--danger' : 'btn--ghost'),
      title: isRunning ? 'إيقاف المؤقت' : 'بدء المؤقت',
      onClick: () => toggleTimer(o),
    }, isRunning ? '⏸️' : '⏱️'));
  }

  if (canDeliver) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--primary',
      onClick: () => deliverWithSignature(o),
    }, '✅ تسليم'));
  }

  if (!isDelivered) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--primary',
      onClick: () => advanceStatus(o),
    }, '▶️'));
  }

  actionChildren.push(el('button', {
    className: 'btn btn--sm btn--danger',
    onClick: () => deleteOrder(o),
  }, '🗑️'));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, actionChildren));

  return card;
}

/* ==========================================================================
   9. بطاقة مصغّرة (كانبان/تجميع)
   ========================================================================== */

function buildMiniCard(o, opts = {}) {
  const c = state.customerMap[o.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
  const isRunning = getActiveSession(o.workSessions);

  const card = el('div', {
    className: 'card',
    style: {
      marginBottom: '6px', cursor: 'pointer', padding: '8px 10px',
      borderRight: '3px solid ' + (opts.color || '#1F6D57'),
      display: 'flex', gap: '8px', alignItems: 'center',
    },
    onClick: () => previewOrder(o, c, () => openOrderForm(o)),
  });

  /* صورة مصغّرة */
  if (o.referenceImage) {
    card.appendChild(el('img', {
      src: o.referenceImage, alt: 'مرجع',
      style: {
        width: '36px', height: '36px', borderRadius: '6px',
        objectFit: 'cover', flexShrink: '0',
      },
    }));
  }

  const content = el('div', { style: { flex: '1', minWidth: '0' } });
  content.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: '6px', marginBottom: '4px' },
  }, [
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#123C2F',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' } },
      name),
    isRunning ? el('span', { style: { fontSize: '11px', color: '#2E7D32' } }, '⏱️') : null,
  ]));

  content.appendChild(el('div', {
    style: { fontSize: '11px', color: '#666', display: 'flex', gap: '8px', flexWrap: 'wrap' },
  }, [
    o.amount ? el('span', {}, formatEGP(o.amount)) : null,
    o.dueDate ? el('span', {}, '📅 ' + formatDate(o.dueDate)) : null,
    itemsCount > 0 ? el('span', {}, '📦 ' + itemsCount) : null,
  ].filter(Boolean)));

  card.appendChild(content);
  return card;
}

/* ==========================================================================
   10. كانبان + تجميع
   ========================================================================== */

function renderKanban() {
  const wrap = state.container?.querySelector('#orders-list');
  if (!wrap) return;
  clear(wrap);

  const board = el('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))',
      gap: '8px', overflowX: 'auto', paddingBottom: '12px',
    },
  });

  STATUS_ORDER.forEach((status) => {
    const sInfo = STATUS_MAP[status];
    const items = state.orders.filter((o) => o.status === status);

    const column = el('div', {
      style: { background: '#F6F1E6', borderRadius: '12px', padding: '10px', minHeight: '200px' },
    });

    column.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px', paddingBottom: '6px',
        borderBottom: '2px solid ' + sInfo.color },
    }, [
      el('span', { style: { fontSize: '13px', fontWeight: '700', color: sInfo.color } }, sInfo.label),
      el('span', {
        style: { fontSize: '11px', fontWeight: '600', color: '#fff',
          background: sInfo.color, padding: '2px 8px', borderRadius: '10px' },
      }, String(items.length)),
    ]));

    if (items.length === 0) {
      column.appendChild(el('div', {
        style: { fontSize: '11px', color: '#999', textAlign: 'center', padding: '20px 0' },
      }, 'لا يوجد'));
    } else {
      items.slice(0, 30).forEach((o) => column.appendChild(buildMiniCard(o, { color: sInfo.color })));
    }
    board.appendChild(column);
  });

  wrap.appendChild(board);
}

function renderGrouping() {
  const wrap = state.container?.querySelector('#orders-list');
  if (!wrap) return;
  clear(wrap);

  const active = state.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const groups = groupOrders(active);

  if (groups.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🎯'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مجموعات'),
      el('p', { className: 'empty-state__text' }, 'لم يتم العثور على طلبات متشابهة.'),
    ]));
    return;
  }

  groups.forEach((g) => {
    const c = state.customerMap[g.customerId];
    const customerName = c ? c.name : 'عميل محذوف';

    const card = el('div', {
      className: 'card', style: { marginBottom: '12px', borderRight: '4px solid #1F6D57' },
    });

    card.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '8px', marginBottom: '10px', paddingBottom: '8px',
        borderBottom: '1px solid #E5DDD0' },
    }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, '👤 ' + customerName),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } },
          '📦 ' + g.type + ' — ' + g.orders.length + ' طلب'),
      ]),
      el('div', { style: { textAlign: 'left' } }, [
        el('div', { style: { fontSize: '14px', fontWeight: '700', color: '#2E7D32' } }, formatEGP(g.totalAmount)),
      ]),
    ]));

    g.orders.forEach((o) => {
      const sInfo = STATUS_MAP[o.status] || STATUS_MAP.pending;
      card.appendChild(el('div', {
        style: { padding: '8px 10px', background: '#F9F6EF',
          borderRadius: '8px', marginBottom: '6px', cursor: 'pointer' },
        onClick: () => previewOrder(o, c, () => openOrderForm(o)),
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between',
          gap: '8px', marginBottom: '4px' } }, [
          el('span', { style: { fontSize: '12px', fontWeight: '500', color: '#123C2F' } },
            '#' + String(o.id).slice(-6)),
          el('span', { className: 'badge ' + sInfo.badge }, sInfo.label),
        ]),
        el('div', { style: { fontSize: '11px', color: '#666', display: 'flex',
          gap: '8px', flexWrap: 'wrap' } }, [
          o.amount ? el('span', {}, formatEGP(o.amount)) : null,
          o.dueDate ? el('span', {}, '📅 ' + formatDate(o.dueDate)) : null,
        ].filter(Boolean)),
      ]));
    });

    wrap.appendChild(card);
  });
}

/* ==========================================================================
   11. الرسم الرئيسي
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

function renderTopBanners() {
  const dailyWrap = state.container?.querySelector('#orders-daily-limit');
  if (dailyWrap) {
    clear(dailyWrap);
    const bar = buildDailyLimitBar();
    if (bar) dailyWrap.appendChild(bar);
  }

  const alertsWrap = state.container?.querySelector('#orders-alerts');
  if (alertsWrap) {
    clear(alertsWrap);
    const alerts = buildUrgentAlerts();
    if (alerts) alertsWrap.appendChild(alerts);
  }
}

function buildViewToggle() {
  const wrap = el('div', {
    style: {
      display: 'flex', gap: '4px', marginBottom: '12px',
      background: '#F6F1E6', padding: '4px', borderRadius: '10px',
    },
  });

  const views = [
    { id: 'list',     icon: '📋', label: 'قائمة' },
    { id: 'kanban',   icon: '🗂️', label: 'كانبان' },
    { id: 'grouping', icon: '🎯', label: 'تجميع' },
  ];

  views.forEach((v) => {
    const isActive = state.activeView === v.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => { state.activeView = v.id; renderView(); },
    }, v.icon + ' ' + v.label));
  });

  return wrap;
}

function renderFilters() {
  const wrap = state.container?.querySelector('#orders-filters');
  if (!wrap) return;
  clear(wrap);
  if (state.activeView !== 'list') return;

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

function renderView() {
  const toggleWrap = state.container.querySelector('#orders-view-toggle');
  if (toggleWrap) {
    clear(toggleWrap);
    toggleWrap.appendChild(buildViewToggle());
  }

  renderFilters();

  if (state.activeView === 'kanban') renderKanban();
  else if (state.activeView === 'grouping') renderGrouping();
  else renderList();
}

/* ==========================================================================
   12. المؤقت الحيّ
   ========================================================================== */

function startLiveTimer() {
  stopLiveTimer();
  state._timerInterval = setInterval(() => {
    if (!state.container) return;
    state.orders.forEach((o) => {
      const sessions = Array.isArray(o.workSessions) ? o.workSessions : [];
      if (!getActiveSession(sessions)) return;
      const badge = state.container.querySelector('[data-timer-id="' + o.id + '"]');
      if (!badge) return;
      badge.textContent = '⏱️ يعمل · ' + formatDuration(getTotalWorkTime(sessions));
    });
  }, 1000);
}

function stopLiveTimer() {
  if (state._timerInterval) { clearInterval(state._timerInterval); state._timerInterval = null; }
}

async function refreshAll() {
  await loadData();
  renderTopBanners();
  renderStats();
  renderView();
  startLiveTimer();
}

/* ==========================================================================
   13. API
   ========================================================================== */

export const ordersPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.activeView = 'list';

    container.appendChild(el('div', { id: 'orders-daily-limit' }));
    container.appendChild(el('div', { id: 'orders-alerts' }));

    container.appendChild(el('div', {
      id: 'orders-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openOrderForm(),
    }, '➕ إضافة طلب'));

    container.appendChild(el('div', { id: 'orders-view-toggle' }));
    container.appendChild(el('div', {
      id: 'orders-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'orders-list' }));

    await refreshAll();
  },

  destroy() {
    stopLiveTimer();
    state = {
      orders: [], customers: [], customerMap: {},
      activeFilter: 'all', activeView: 'list',
      scheduleConfig: { dayOffWeekday: 0, dailyOrderLimit: 0 },
      container: null, _timerInterval: null,
    };
  },
};
