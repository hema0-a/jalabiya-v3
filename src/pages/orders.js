/* ==========================================================================
   orders.js — صفحة الطلبات (كل الميزات + صورة مرجعية)
   ==========================================================================
   - 3 طرق عرض: قائمة / كانبان / تجميع.
   - نموذج كامل + اقتراح موعد + صورة مرجعية + معاينة + طباعة + رسائل.
   - مؤقت العمل + توقيع التسليم + شريط الحد + تنبيهات عاجلة.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { consumeNew } from '../core/deeplink.js';
import { uid, formatEGP, formatDate, parseDateInput, localDateInput, toNonNegative } from '../core/utils.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { payments as paymentsRepoForDelete } from '../data/repos/payments.js';
import { trash } from '../data/repos/trash.js';
import { settings } from '../data/repos/settings.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewOrder } from '../ui/quick-preview.js';
import { openSignaturePad } from '../ui/signature-pad.js';
import { createOrderImagePicker } from '../ui/order-image-picker.js';
import { printOrderInvoice } from '../services/invoice-print.js';
import { getOrderMessageOptions } from '../services/auto-messages.js';
import { orderPaidBreakdown } from '../services/payments-view.js';
import { statusNotifyAction, newOrderNotifyAction } from '../services/status-notify.js';
import { depositGuard } from '../ui/deposit-guard.js';
import { sinceText } from '../services/message-log.js';
import { suggestDueDate, getDayLoad, planOrder, isValidWorkPlan } from '../services/order-scheduler.js';
import {
  getDeadlineInfo, getPickupInfo, formatDuration,
  getTotalWorkTime, getActiveSession, startSession, stopSession, isPastDue,
} from '../services/order-timing.js';
import * as draft from '../services/draft-manager.js';
import { orderProfit, summarizeProfit } from '../services/order-profit.js';
import { groupingOptions, fabricPickupDays } from '../services/alert-rules.js';
import { clusterBySize } from '../services/size-clusters.js';
import { createProgressiveList } from '../ui/progressive-list.js';

/* --- مفاتيح المسودات --- */
const DRAFT_KEY = 'order-form';

/* --- الحالة --- */
/* القائمة التدريجية: رسم 30 طلباً ثم المزيد عند التمرير (كانت ترسم الكل: 70 ألف عنصر DOM عند 4000 طلب) */
let ordersList = null;
function disposeOrdersList() {
  if (ordersList) { try { ordersList.destroy(); } catch (e) { /* ignore */ } ordersList = null; }
}

let state = {
  orders: [],
  customers: [],
  customerMap: {},
  activeFilter: 'all',
  activeView: 'list',
  scheduleConfig: { dayOffWeekday: 0, dailyOrderLimit: 0 },
  grouping: { enabled: false, sameTypeOnly: true, tolerance: 2 },
  pickupDays: 2,
  jalabiyaTypes: [],
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

export function computeTotals(items, discountType, discountValue, extraFees) {
  const subtotal = (items || []).reduce(
    (s, it) => s + toNonNegative(it.price) * toNonNegative(it.quantity), 0
  );
  const dv = toNonNegative(discountValue);
  let discountAmount = 0;
  if (discountType === 'percent') discountAmount = subtotal * (dv / 100);
  else if (discountType === 'fixed') discountAmount = dv;
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
  const extraFeesTotal = (extraFees || []).reduce((s, f) => {
    const v = toNonNegative(f.value);
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

/* --- حدّ الخصم (v3.3.42): خصم يتجاوز النسبة يطلب تأكيداً لتفادي أخطاء الإدخال (مثل 500 بدل 50) --- */
export const MAX_DISCOUNT_PERCENT = 20;

/** نسبة الخصم من المجموع الفرعي (0 عند عدم وجود خصم). */
export function discountPercentOf(totals) {
  const sub = Number(totals && totals.subtotal) || 0;
  const d = Number(totals && totals.discountAmount) || 0;
  return sub > 0 ? Math.round((d / sub) * 1000) / 10 : 0;
}

/** هل الخصم أعلى من الحد المسموح بلا تأكيد؟ */
export function isDiscountExcessive(totals, limit = MAX_DISCOUNT_PERCENT) {
  return discountPercentOf(totals) > limit;
}

/* --- وضع الإدخال السريع (v3.3.42) --- */
const FORM_MODE_KEY = 'jalabiya_v3_order_form_mode';
function readFormMode() {
  try { return localStorage.getItem(FORM_MODE_KEY) === 'quick' ? 'quick' : 'full'; } catch { return 'full'; }
}
function writeFormMode(m) {
  try { localStorage.setItem(FORM_MODE_KEY, m); } catch { /* ignore */ }
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

export function groupOrders(list, opts = {}) {
  const sameTypeOnly = opts.sameTypeOnly !== false;
  const groups = new Map();
  list.forEach((o) => {
    const cid = o.customerId || 'unknown';
    const type = sameTypeOnly ? orderType(o).toLowerCase() : '*';
    const key = cid + '::' + type;
    if (!groups.has(key)) {
      groups.set(key, { key, customerId: cid, type: sameTypeOnly ? orderType(o) : 'متنوعة', orders: [], totalAmount: 0 });
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

  /* إعدادات التجميع واستلام القماش (v3.3.32: كانت تُحفظ ولا تُقرأ) */
  state.grouping = groupingOptions(s);
  state.pickupDays = fabricPickupDays(s);
  /* أنواع الجلابيب من الإعدادات: اقتراح اسم + تعبئة السعر تلقائياً في بنود الطلب (v3.3.32) */
  state.jalabiyaTypes = (Array.isArray(s && s.jalabiyaTypes) ? s.jalabiyaTypes : []).filter((t) => t && t.name);
  syncTypesDatalist();
  if (!state.grouping.enabled && state.activeView === 'grouping') state.activeView = 'list';

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

const TYPES_DL_ID = 'jalabiya-types-dl';

function syncTypesDatalist() {
  try {
    let dl = document.getElementById(TYPES_DL_ID);
    if (!dl) { dl = document.createElement('datalist'); dl.id = TYPES_DL_ID; document.body.appendChild(dl); }
    dl.replaceChildren(...state.jalabiyaTypes.map((t) => {
      const o = document.createElement('option');
      o.value = t.name;
      if (t.price) o.label = t.name + ' — ' + t.price + ' ج.م';
      return o;
    }));
  } catch (e) { /* اختياري */ }
}

function buildItemRow(item, onRemove) {
  const nameIn = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم البند (مثال: جلابية سادة)',
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

  /* اختيار نوع من الإعدادات يملأ السعر إن كان فارغاً (لا يكتب فوق سعر أدخله المستخدم) */
  nameIn.setAttribute('list', TYPES_DL_ID);
  nameIn.addEventListener('change', () => {
    const t = state.jalabiyaTypes.find((x) => x.name === nameIn.value.trim());
    if (t && Number(t.price) > 0 && !(Number(priceIn.value) > 0)) {
      priceIn.value = String(t.price);
      priceIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  const labeled = (txt, input, cls) => el('label', { className: 'order-item__f ' + (cls || '') }, [
    el('span', { className: 'order-item__lbl' }, txt), input,
  ]);

  const row = el('div', { className: 'order-item' }, [
    el('div', { className: 'order-item__name' }, [nameIn]),
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
    value: toNonNegative(valueIn.value),
  });

  return row;
}
function openOrderForm(existing = null) {
  const isEdit = existing !== null;
  let draftDone = false;   /* بعد الحفظ الناجح لا تُعاد كتابة المسودة عند إغلاق النافذة */

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
    receivedDateInput.value = localDateInput(existing.receivedDate);
  }

  const dueDateInput = el('input', { className: 'input', type: 'date', 'aria-label': 'تاريخ التسليم' });
  if (isEdit && existing.dueDate) {
    dueDateInput.value = localDateInput(existing.dueDate);
  }

  /* آخر خطة عمل اقترحها زر ✨ (تُحفظ مع الطلب إن بقي المبلغ والتاريخ كما هما) */
  let suggestedPlan = null;

  /* نتيجة الاقتراح تظهر تحت الحقل نفسه (بدل إشعارات عائمة تختفي وتتراكب مع النموذج) */
  const dueHint = el('div', { className: 'order-hint', role: 'status', 'aria-live': 'polite' });
  const setHint = (lines, warn) => {
    clear(dueHint);
    dueHint.classList.toggle('order-hint--warn', !!warn);
    lines.forEach((l) => dueHint.appendChild(el('div', {}, l)));
  };
  dueDateInput.addEventListener('input', () => setHint([]));

  const suggestBtn = el('button', {
    className: 'btn btn--sm btn--secondary btn--block', type: 'button',
    title: 'اقتراح أقرب موعد تسليم يناسب الحد اليومي',
    onClick: async () => {
      try {
        const _items = Array.from(itemsContainer.children).map((r) => r._getValues());
        const _fees = Array.from(feesContainer.children).map((r) => r._getValues());
        const _t = computeTotals(_items, discountTypeSelect.value, discountValueInput.value, _fees);
        const _orderAmount = Number(_t.amount) || 0;
        const suggestion = suggestDueDate(state.orders, {
          dayOffWeekday: state.scheduleConfig.dayOffWeekday,
          dailyOrderLimit: state.scheduleConfig.dailyOrderLimit,
          minDays: 1, maxLookaheadDays: 60,
          excludeOrderId: existing ? existing.id : null,
          orderAmount: _orderAmount,
        });
        dueDateInput.value = localDateInput(suggestion.timestamp);
        dueDateInput.dispatchEvent(new Event('change', { bubbles: true }));   /* يحفظ المسودة */
        suggestedPlan = { amount: _orderAmount, dueTs: suggestion.timestamp, plan: suggestion.workPlan || [] };
        const lines = ['💡 ' + suggestion.reason + ': ' + formatDate(suggestion.timestamp)];
        if (suggestion.daysUsed > 1) {
          lines.push((suggestion.overLimit ? '⚠️ الطلب أكبر من الحد اليومي — ' : 'ℹ️ السعة المتبقية موزّعة — ') +
            'يُنفَّذ على ' + suggestion.daysUsed + ' أيام عمل: يبدأ ' + formatDate(suggestion.startTimestamp) +
            ' وينتهي ' + formatDate(suggestion.timestamp));
        }
        setHint(lines, suggestion.overLimit);
      } catch (e) { setHint(['تعذّر اقتراح موعد — اختر التاريخ يدوياً'], true); }
    },
  }, '✨ اقتراح أقرب موعد متاح');

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
    className: 'btn btn--sm btn--secondary btn--block', type: 'button', 'data-full': '1',
    onClick: () => {
      addItemRow({ id: uid(), name: '', price: 0, quantity: 1 }); recalc();
      itemsContainer.lastElementChild?.querySelector('input')?.focus();   /* جاهز للكتابة فوراً */
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

  /* --- ملخص الحساب --- */
  const totalsSummary = el('div', {
    style: { padding: '12px', background: '#F6F1E6', borderRadius: '8px', fontSize: '13px', lineHeight: '1.8' },
  });

  function recalc() {
    const items = Array.from(itemsContainer.children).map((r) => r._getValues());
    const fees = Array.from(feesContainer.children).map((r) => r._getValues());
    const t = computeTotals(items, discountTypeSelect.value, discountValueInput.value, fees);
    const deposit = toNonNegative(depositInput.value);
    const remaining = Math.max(0, t.amount - deposit);

    clear(totalsSummary);
    const row = (lbl, val, color) => el('div', {
      style: { display: 'flex', justifyContent: 'space-between', color: color || '#123C2F' },
    }, [el('span', {}, lbl), el('span', { style: { fontWeight: '600' } }, val)]);

    totalsSummary.appendChild(row('المجموع الفرعي:', formatEGP(t.subtotal)));
    if (t.discountAmount > 0) totalsSummary.appendChild(row('الخصم:', '− ' + formatEGP(t.discountAmount) + ' (' + discountPercentOf(t) + '%)', '#C62828'));
    if (isDiscountExcessive(t)) {
      totalsSummary.appendChild(el('div', { className: 'order-hint order-hint--warn', role: 'alert' },
        '⚠️ الخصم أعلى من ' + MAX_DISCOUNT_PERCENT + '% من المجموع — تأكد من الرقم'));
    }
    if (t.extraFeesTotal > 0) totalsSummary.appendChild(row('الرسوم الإضافية:', '+ ' + formatEGP(t.extraFeesTotal), '#F57C00'));
    totalsSummary.appendChild(row('الإجمالي:', formatEGP(t.amount)));
    if (deposit > 0) totalsSummary.appendChild(row('المقدم:', '− ' + formatEGP(deposit), '#2E7D32'));
    totalsSummary.appendChild(el('div', {
      style: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5DDD0', marginTop: '6px', paddingTop: '6px', fontWeight: '700' },
    }, [
      el('span', {}, 'المتبقي:'),
      el('span', { style: { color: remaining > 0 ? '#F57C00' : '#2E7D32' } }, formatEGP(remaining)),
    ]));
    const pr = orderProfit({ amount: t.amount, cost: costInput.value });
    if (pr.hasCost) {
      totalsSummary.appendChild(row('الربح التقديري:',
        formatEGP(pr.profit) + ' (' + pr.margin + '%)', pr.profit < 0 ? '#C62828' : '#2E7D32'));
    }
  }

  /* --- body: الأساسيات أولاً، والباقي في «خيارات إضافية» (مطوي) --- */
  const fieldOf = (label, ...nodes) => el('div', { className: 'field' }, [el('label', { className: 'field__label' }, label), ...nodes]);

  const statusField = fieldOf('الحالة', statusSelect);

  /* القسم الإضافي يُفتح تلقائياً إن كان فيه بيانات (تعديل طلب موجود) */
  const hasExtras = isEdit && (
    (existing.discountType && existing.discountType !== 'none' && Number(existing.discountValue) > 0) ||
    (Array.isArray(existing.extraFees) && existing.extraFees.length > 0) ||
    Number(existing.cost) > 0 || !!existing.notes || !!existing.referenceImage || !!existing.receivedDate
  );
  const extras = el('details', { className: 'order-extras' }, [
    el('summary', { className: 'order-extras__summary' }, [
      el('span', {}, '⚙️ خيارات إضافية'),
      el('span', { className: 'order-extras__hint' }, 'خصم · رسوم · تكلفة · ملاحظات · صورة'),
    ]),
    el('div', { className: 'order-extras__body' }, [
      ...(isEdit ? [] : [statusField]),
      fieldOf('📥 تاريخ استلام القماش', receivedDateInput),
      fieldOf('🎁 خصم', discountTypeSelect, discountValueInput),
      fieldOf('➕ رسوم إضافية', feesContainer, addFeeBtn),
      fieldOf('🧵 التكلفة (لحساب الربح)', costInput),
      fieldOf('📝 ملاحظات', notesInput),
      imagePicker.node,
    ]),
  ]);
  if (hasExtras) extras.open = true;

  const depositField = fieldOf('💰 المقدم (ج.م)', depositInput);
  depositField.setAttribute('data-full', '1');
  extras.setAttribute('data-full', '1');

  /* مبدّل الوضع: «سريع» = العميل + البند + التاريخ فقط (للزحام)، «كامل» = كل الحقول. للطلب الجديد فقط */
  const modeBtn = (key, label) => el('button', {
    type: 'button', className: 'btn btn--sm order-mode__btn', 'data-mode': key,
    onClick: () => setMode(key),
  }, label);
  const quickBtn = modeBtn('quick', '⚡ سريع');
  const fullBtn = modeBtn('full', '📋 كامل');
  const modeBar = el('div', { className: 'order-mode', role: 'group', 'aria-label': 'وضع النموذج' }, [quickBtn, fullBtn]);

  const body = el('div', { className: 'order-form' }, [
    ...(isEdit ? [] : [modeBar]),
    fieldOf('العميل *', customerSelect),
    ...(isEdit ? [statusField] : []),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '📦 بنود الطلب'),
      itemsContainer, addItemBtn,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, '📅 تاريخ التسليم'),
      dueDateInput, suggestBtn, dueHint,
    ]),
    depositField,
    extras,
    totalsSummary,
  ]);

  function setMode(m, persist = true) {
    const quick = !isEdit && m === 'quick';
    body.classList.toggle('order-form--quick', quick);
    quickBtn.setAttribute('aria-pressed', String(quick));
    fullBtn.setAttribute('aria-pressed', String(!quick));
    quickBtn.classList.toggle('order-mode__btn--on', quick);
    fullBtn.classList.toggle('order-mode__btn--on', !quick);
    if (persist && !isEdit) writeFormMode(quick ? 'quick' : 'full');
  }
  setMode(readFormMode(), false);

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
          const dv = dt === 'percent'
            ? Math.min(100, toNonNegative(discountValueInput.value))
            : toNonNegative(discountValueInput.value);
          const deposit = toNonNegative(depositInput.value);
          const totals = computeTotals(items, dt, dv, extraFees);
          if (deposit > totals.amount) {
            toast.warning('المقدم (' + formatEGP(deposit) + ') أكبر من إجمالي الطلب (' + formatEGP(totals.amount) + ')');
            return;
          }

          if (isDiscountExcessive(totals)) {
            const okDisc = await modal.confirm({
              title: 'خصم كبير',
              message: 'الخصم ' + discountPercentOf(totals) + '% (' + formatEGP(totals.discountAmount) + ') من مجموع ' +
                formatEGP(totals.subtotal) + ' — أعلى من ' + MAX_DISCOUNT_PERCENT + '%.\nهل الرقم صحيح؟',
              confirmText: 'نعم، احفظ', cancelText: 'تعديل الخصم',
            });
            if (!okDisc) { extras.open = true; setMode('full', false); discountValueInput.focus(); return; }
          }

          const data = {
            customerId, status: statusSelect.value,
            dueDate: (dueDateInput.value ? parseDateInput(dueDateInput.value) : null),
            receivedDate: (receivedDateInput.value ? parseDateInput(receivedDateInput.value) : null),
            items, discountType: dt, discountValue: dv, discountAmount: totals.discountAmount,
            extraFees, extraFeesTotal: totals.extraFeesTotal,
            subtotal: totals.subtotal, deposit, amount: totals.amount,
            cost: toNonNegative(costInput.value),
            notes: notesInput.value.trim(),
            referenceImage: imagePicker.getValue() || '',
          };
          /* تاريخ التسليم الفعلي (تعتمد عليه مؤشرات الأداء): يُحفظ عند التحوّل لـ delivered ويُمسح عند الرجوع منها */
          if (data.status === 'delivered') {
            data.deliveredAt = (isEdit && existing.deliveredAt) || Date.now();
          } else if (isEdit && existing.deliveredAt) {
            data.deliveredAt = null;
          }

          /* خطة العمل على أساس الحد اليومي: تُحفظ مع الطلب فتُحسب سعة كل يوم بدقة (حتى الجزئية) */
          const planLimit = state.scheduleConfig.dailyOrderLimit || 0;
          const planActive = data.status !== 'delivered' && data.status !== 'cancelled';
          const cents = (v) => Math.round((Number(v) || 0) * 100);
          if (planActive && data.dueDate && planLimit > 0 && data.amount > 0) {
            const unchanged = isEdit && isValidWorkPlan(existing) &&
              cents(existing.amount) === cents(data.amount) && existing.dueDate === data.dueDate;
            if (unchanged) {
              data.workPlan = existing.workPlan;                 /* لا نحرّك خطة سبق الوعد بها */
            } else if (suggestedPlan && suggestedPlan.dueTs === data.dueDate &&
                       cents(suggestedPlan.amount) === cents(data.amount) && suggestedPlan.plan.length > 0) {
              data.workPlan = suggestedPlan.plan;                /* الخطة التي اقترحها ✨ */
            } else {
              const pl = planOrder(state.orders, {
                orderAmount: data.amount, dailyOrderLimit: planLimit,
                dayOffWeekday: state.scheduleConfig.dayOffWeekday,
                endDate: data.dueDate, excludeOrderId: isEdit ? existing.id : null, minDays: 0,
              });
              if (pl) {
                data.workPlan = pl.plan;
              } else {
                data.workPlan = null;
                const alt = suggestDueDate(state.orders, {
                  dayOffWeekday: state.scheduleConfig.dayOffWeekday, dailyOrderLimit: planLimit,
                  minDays: 1, maxLookaheadDays: 60, excludeOrderId: isEdit ? existing.id : null,
                  orderAmount: data.amount,
                });
                toast.warning('⚠️ السعة اليومية لا تتسع للطلب حتى هذا التاريخ — أقرب موعد ممكن: ' + formatDate(alt.timestamp));
              }
            }
          } else if (planActive) {
            data.workPlan = null;
          }                                                      /* المسلَّم/الملغى: تبقى خطته كما هي */

          try {
            if (isEdit) { await orders.update(existing.id, data); toast.success('تم تحديث الطلب'); }
            else {
              const created = await orders.create(data);
              const notify = await newOrderNotifyAction(created && created.id ? created : { ...data });
              toast.success('تم إضافة الطلب', notify ? { action: notify, duration: 9000 } : {});
            }
            draftDone = true;
            draft.clear(DRAFT_KEY);
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل الحفظ: ' + err.message); }
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
        if (draftDone) return;
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
      try { if (!draftDone) scheduleSave(); } catch { /* ignore */ }
      return origHandleClose.apply(this, arguments);
    };
  }
}
/* ==========================================================================
   5. عمليات
   ========================================================================== */

async function deleteOrder(order) {
  const c = state.customerMap[order.customerId];
  const label = c ? c.name : 'طلب';
  let linkedNote = '';
  try {
    const linked = await paymentsRepoForDelete.findByOrder(order.id);
    if (linked.length > 0) {
      linkedNote = '\n\n⚠️ مرتبط به ' + linked.length +
        ' دفعة ستبقى محسوبة في الإيرادات (يمكنك حذفها من صفحة المدفوعات).';
    }
  } catch (e) { /* نكمل بدون التنبيه */ }
  const ok = await modal.confirm({
    title: 'حذف طلب',
    message: 'هل أنت متأكد من حذف طلب "' + label + '"؟' + linkedNote,
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
  if (!(await depositGuard(order, next))) return;   /* تحذير العربون قبل بدء التنفيذ */
  try {
    const patch = { status: next };
    if (next === 'delivered' && !order.deliveredAt) patch.deliveredAt = Date.now();
    await orders.update(order.id, patch);
    const prev = { status: order.status, deliveredAt: order.deliveredAt ?? null, readyAt: order.readyAt ?? null };
    /* زر «📱 إشعار العميل» في نفس التنبيه (إن كان للحالة قالب والعميل له هاتف) */
    const notify = await statusNotifyAction({ ...order, ...patch }, next);
    toast.undo('الحالة: ' + STATUS_MAP[next].label, async () => {
      await orders.update(order.id, prev);
      toast.info('تم التراجع: ' + STATUS_MAP[prev.status].label);
      await refreshAll();
    }, notify ? { extraAction: notify, duration: 10000 } : {});
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
  /* المتبقي الحقيقي (دفعات + مقدم) واسم الورشة من الإعدادات — كانا يُهملان فيظهر «متبقي» = الإجمالي */
  let paid = Number(order.deposit) || 0;
  let workshop = {};
  try {
    const linked = await paymentsRepoForDelete.findByOrder(order.id);
    paid = orderPaidBreakdown(order, linked).paid;
  } catch (e) { /* نكتفي بالمقدم */ }
  try { workshop = (await settings.get()).workshop || {}; } catch (e) { /* افتراضي */ }
  const options = await getOrderMessageOptions(order, customer, workshop, { paid });
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
      opt.lastSentAt
        ? el('div', { style: { fontSize: '11px', color: '#E65100', marginTop: '6px' } },
          '✔ فُتحت لهذا الطلب ' + sinceText(opt.lastSentAt))
        : null,
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

  /* نفس تعريف المجدول: حِمل اليوم = طلبات موعد تسليمها اليوم (يشمل المسلَّم لأنه استهلك سعة اليوم) */
  const load = getDayLoad(state.orders, Date.now(), { limit, dayOffWeekday: state.scheduleConfig.dayOffWeekday, includeDelivered: true });
  const todayTotal = load.amount;
  const percent = load.percent;
  const exceeded = load.exceeded;
  const near = load.near;
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
      exceeded ? '🚨 تجاوزت الحد اليومي' : (near ? '⚠️ اقتربت من الحد اليومي' : '📊 حِمل تسليم اليوم')),
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
    isPastDue(o.dueDate, now) &&
    o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const needPickup = state.orders.filter((o) =>
    !o.receivedDate && o.dueDate &&
    o.dueDate >= todayMs && o.dueDate <= todayMs + state.pickupDays * DAY_MS &&
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
      sub: 'التسليم خلال ' + state.pickupDays + ' أيام',
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
  { const pr = orderProfit(o);
    if (pr.hasCost) metaChildren.push(el('span', { style: { color: pr.profit < 0 ? '#C62828' : '#2E7D32' } },
      '📈 ربح ' + formatEGP(pr.profit))); }
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
  disposeOrdersList();
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

function groupOrderRow(o, c) {
  const sInfo = STATUS_MAP[o.status] || STATUS_MAP.pending;
  return el('div', {
    style: { padding: '8px 10px', background: '#F9F6EF', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer' },
    onClick: () => previewOrder(o, c, () => openOrderForm(o)),
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' } }, [
      el('span', { style: { fontSize: '12px', fontWeight: '500', color: '#123C2F' } },
        '#' + String(o.id).slice(-6) + (c ? ' · ' + c.name : '')),
      el('span', { className: 'badge ' + sInfo.badge }, sInfo.label),
    ]),
    el('div', { style: { fontSize: '11px', color: '#666', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      o.amount ? el('span', {}, formatEGP(o.amount)) : null,
      o.dueDate ? el('span', {}, '📅 ' + formatDate(o.dueDate)) : null,
    ].filter(Boolean)),
  ]);
}

function groupCard(title, subtitle, total, orderRows, accent) {
  const card = el('div', { className: 'card', style: { marginBottom: '12px', borderRight: '4px solid ' + accent } });
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
      marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #E5DDD0' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, title),
      el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, subtitle),
    ]),
    el('div', { style: { fontSize: '14px', fontWeight: '700', color: '#2E7D32' } }, formatEGP(total)),
  ]));
  orderRows.forEach((r) => card.appendChild(r));
  return card;
}

function renderGrouping() {
  const wrap = state.container?.querySelector('#orders-list');
  if (!wrap) return;
  disposeOrdersList();
  clear(wrap);

  const active = state.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const opts = state.grouping;
  const groups = groupOrders(active, { sameTypeOnly: opts.sameTypeOnly });
  const clusters = opts.tolerance > 0
    ? clusterBySize(active, state.customerMap, opts.tolerance, orderType, opts.sameTypeOnly)
    : [];

  if (groups.length === 0 && clusters.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🎯'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد مجموعات'),
      el('p', { className: 'empty-state__text' }, 'لم يتم العثور على طلبات متشابهة.'),
    ]));
    return;
  }

  groups.forEach((g) => {
    const c = state.customerMap[g.customerId];
    wrap.appendChild(groupCard('👤 ' + (c ? c.name : 'عميل محذوف'),
      '📦 ' + g.type + ' — ' + g.orders.length + ' طلب', g.totalAmount,
      g.orders.map((o) => groupOrderRow(o, null)), '#1F6D57'));
  });

  if (clusters.length > 0) {
    wrap.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '700', color: '#123C2F', margin: '12px 0 8px' } },
      '📏 قياسات متقاربة (±' + opts.tolerance + ' سم) — لدفعة قص واحدة'));
    clusters.forEach((cl) => {
      wrap.appendChild(groupCard('📦 ' + cl.type,
        cl.orders.length + ' طلب لـ ' + cl.customers.length + ' عملاء', cl.totalAmount,
        cl.orders.map((o) => groupOrderRow(o, state.customerMap[o.customerId])), '#B8863B'));
    });
  }
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

  const sp = summarizeProfit(state.orders);
  if (sp.count > 0) {
    wrap.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '📈'),
      el('span', { className: 'stat__value', style: { color: sp.profit < 0 ? '#C62828' : '#2E7D32' } }, formatEGP(sp.profit)),
      el('span', { className: 'stat__label' }, 'ربح المسلَّم (' + sp.margin + '% من ' + sp.count + ' طلب)'),
    ]));
  }
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
    ...(state.grouping.enabled ? [{ id: 'grouping', icon: '🎯', label: 'تجميع' }] : []),
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
  /* الشريحة النشطة تظهر دائماً داخل الصف القابل للتمرير */
  wrap.querySelector('.btn--primary')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
}

function renderList() {
  const listContainer = state.container?.querySelector('#orders-list');
  if (!listContainer) return;
  disposeOrdersList();
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

  ordersList = createProgressiveList({
    items: filtered,
    pageSize: 30,
    render: (o) => buildOrderCard(o),
  });
  listContainer.appendChild(ordersList.node);
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
  async render(container, sub) {
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
      className: 'scroll-row',
      style: { marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'orders-list' }));

    await refreshAll();
    consumeNew(sub, 'orders', () => openOrderForm());
  },

    destroy() {
    stopLiveTimer();
    disposeOrdersList();
    state = {
      orders: [], customers: [], customerMap: {},
      activeFilter: 'all', activeView: 'list',
      scheduleConfig: { dayOffWeekday: 0, dailyOrderLimit: 0 },
      grouping: { enabled: false, sameTypeOnly: true, tolerance: 2 },
      pickupDays: 2,
      jalabiyaTypes: [],
      container: null, _timerInterval: null,
    };
  },
};
