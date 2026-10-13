/* ==========================================================================
   quotes.js — عروض الأسعار  [v3.3.30]
   ==========================================================================
   عرض لعميل قبل الاتفاق: بنود + خصم اختياري + صلاحية بالأيام.
   أزرار: مشاركة واتساب · تحويل لطلب (يُنشئ طلباً pending بنفس البنود) · رفض · حذف.
   المنطق في services/quotes.js.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { uid, formatEGP, formatDate, toNonNegative } from '../core/utils.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { quotes } from '../data/repos/quotes.js';
import { trash } from '../data/repos/trash.js';
import { settings } from '../data/repos/settings.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { sendLogged } from '../services/auto-messages.js';
import {
  QUOTE_STATUS, DEFAULT_VALID_DAYS, quoteTotals, isExpired, validUntilFrom, quoteToOrderPayload, buildQuoteText,
} from '../services/quotes.js';

let state = { container: null, list: [], customers: [], workshop: {}, msgCfg: null, filter: 'open' };

async function loadData() {
  const [q, cus, st] = await Promise.all([quotes.list(), customers.list(), settings.get()]);
  state.list = q.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.customers = cus;
  state.workshop = st.workshop || {};
  state.msgCfg = st.autoMessages || null;
}

const custName = (id) => { const c = state.customers.find((x) => x.id === id); return c ? c.name : 'عميل غير معروف'; };

/* ---------- نموذج إنشاء/تعديل ---------- */
function itemRow(item, onRemove) {
  const nameIn = el('input', { className: 'input', type: 'text', placeholder: 'اسم البند (مثال: جلابية سادة)', 'aria-label': 'اسم البند', value: item.name || '' });
  const priceIn = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', placeholder: '0', 'aria-label': 'السعر', value: item.price || '' });
  const qtyIn = el('input', { className: 'input', type: 'number', min: '1', step: '1', inputmode: 'numeric', 'aria-label': 'الكمية', value: item.quantity || 1 });
  const labeled = (txt, input) => el('label', { className: 'order-item__f' }, [el('span', { className: 'order-item__lbl' }, txt), input]);
  /* نفس تصميم بند الطلب: الاسم بعرض كامل ثم السعر والكمية — لا حقول ضيقة على الجوال */
  const row = el('div', { className: 'order-item' }, [
    el('div', { className: 'order-item__name' }, [nameIn]),
    labeled('السعر (ج.م)', priceIn),
    labeled('الكمية', qtyIn),
    el('button', { className: 'btn btn--sm btn--danger order-item__remove', type: 'button', 'aria-label': 'حذف البند', title: 'حذف البند', onClick: () => onRemove(row) }, '✕'),
  ]);
  row._values = () => ({ id: item.id || uid(), name: nameIn.value.trim() || 'بند', price: toNonNegative(priceIn.value), quantity: toNonNegative(qtyIn.value) || 1 });
  [priceIn, qtyIn].forEach((i) => i.addEventListener('input', () => row.dispatchEvent(new Event('qchange', { bubbles: true }))));
  return row;
}

function openForm(existing) {
  const isEdit = !!existing;
  const customerSel = el('select', { className: 'input' }, [
    el('option', { value: '' }, '— اختر العميل —'),
    ...state.customers.map((c) => el('option', { value: c.id }, c.name + (c.phone ? ' · ' + c.phone : ''))),
  ]);
  if (isEdit) customerSel.value = existing.customerId || '';
  const itemsBox = el('div');
  const totalLine = el('div', { style: { fontWeight: '700', margin: '8px 0', color: '#1F6D57' } });
  const discountIn = el('input', { className: 'input', type: 'number', min: '0', step: '0.01', value: isEdit ? (existing.discount || '') : '', placeholder: 'خصم ثابت (اختياري)' });
  const daysIn = el('input', { className: 'input', type: 'number', min: '1', step: '1', value: DEFAULT_VALID_DAYS });
  const notesIn = el('textarea', { className: 'input', rows: '2', placeholder: 'ملاحظات تظهر للعميل (اختياري)' });
  notesIn.value = isEdit ? (existing.notes || '') : '';

  const getItems = () => [...itemsBox.children].map((r) => r._values());
  const recalc = () => {
    const t = quoteTotals(getItems(), discountIn.value);
    totalLine.textContent = 'الإجمالي: ' + formatEGP(t.amount) + (t.discountAmount > 0 ? ' (بعد خصم ' + formatEGP(t.discountAmount) + ')' : '');
  };
  const addRow = (it) => { itemsBox.appendChild(itemRow(it, (r) => { r.remove(); recalc(); })); recalc(); };
  itemsBox.addEventListener('qchange', recalc);
  discountIn.addEventListener('input', recalc);
  (isEdit && existing.items && existing.items.length ? existing.items : [{ quantity: 1 }]).forEach(addRow);

  const body = el('div', {}, [
    el('label', { className: 'field__label' }, 'العميل'), customerSel,
    el('label', { className: 'field__label', style: { marginTop: '10px', display: 'block' } }, 'البنود (الاسم · السعر · الكمية)'),
    itemsBox,
    el('button', { className: 'btn btn--secondary btn--sm', type: 'button', onClick: () => addRow({ quantity: 1 }) }, '+ بند'),
    el('div', { style: { marginTop: '10px' } }, [discountIn]),
    totalLine,
    isEdit ? null : el('div', {}, [el('label', { className: 'field__label' }, 'صلاحية العرض (أيام)'), daysIn]),
    el('div', { style: { marginTop: '8px' } }, [notesIn]),
  ].filter(Boolean));

  const m = modal.open({
    title: isEdit ? 'تعديل عرض سعر' : 'عرض سعر جديد', body,
    actions: [
      { text: 'إلغاء', variant: 'secondary', onClick: () => m.close() },
      { text: 'حفظ', variant: 'primary', onClick: async () => {
        if (!customerSel.value) { toast.error('اختر العميل'); return; }
        const items = getItems().filter((i) => i.price > 0);
        if (!items.length) { toast.error('أضف بنداً بسعر'); return; }
        const data = { customerId: customerSel.value, items, discount: toNonNegative(discountIn.value), notes: notesIn.value.trim() };
        try {
          if (isEdit) await quotes.update(existing.id, data);
          else {
            const now = Date.now();
            await quotes.create({ ...data, status: 'open', validUntil: validUntilFrom(now, Number(daysIn.value)) });
          }
          m.close(); toast.success('تم حفظ العرض');
          await loadData(); draw();
        } catch (err) { console.error('[quotes] save:', err); toast.error('تعذّر الحفظ'); }
      } },
    ],
  });
}

/* ---------- إجراءات ---------- */
async function convert(q) {
  const ok = await modal.confirm({
    title: 'تحويل العرض لطلب',
    message: 'سيُنشأ طلب جديد (قيد الانتظار) بنفس بنود العرض ومبلغه ' + formatEGP(quoteTotals(q.items, q.discount).amount) + '.',
    confirmText: 'حوّل', cancelText: 'إلغاء',
  });
  if (!ok) return;
  try {
    const order = await orders.create(quoteToOrderPayload(q));
    await quotes.update(q.id, { status: 'accepted', orderId: order.id, acceptedAt: Date.now() });
    toast.success('تم إنشاء الطلب');
    await loadData(); draw();
  } catch (err) { console.error('[quotes] convert:', err); toast.error('تعذّر التحويل'); }
}

async function remove(q) {
  const ok = await modal.confirm({ title: 'حذف عرض', message: 'حذف هذا العرض؟ يمكنك استرجاعه من سلة المحذوفات.', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
  if (!ok) return;
  try { await trash.addToTrash('quotes', q); await quotes.remove(q.id); toast.success('تم الحذف'); await loadData(); draw(); }
  catch (err) { toast.error('تعذّر الحذف'); }
}

function share(q) {
  const c = state.customers.find((x) => x.id === q.customerId);
  if (!c || !c.phone) { toast.error('لا يوجد رقم هاتف لهذا العميل'); return; }
  sendLogged(c.phone, buildQuoteText(q, c.name, state.workshop, state.msgCfg), { kind: 'quote_share', ref: q.id, customerId: c.id });
}

function card(q) {
  const expired = isExpired(q);
  const t = quoteTotals(q.items, q.discount);
  const statusText = expired ? 'منتهي الصلاحية' : QUOTE_STATUS[q.status] || q.status;
  const color = q.status === 'accepted' ? '#2E7D32' : (expired || q.status === 'rejected') ? '#C62828' : '#1F6D57';
  const btn = (txt, fn, cls = 'secondary') => el('button', { className: 'btn btn--' + cls, type: 'button', style: { fontSize: '12px', padding: '4px 10px' }, onClick: fn }, txt);
  const actions = [];
  if (q.status === 'open') {
    actions.push(btn('💬 واتساب', () => share(q)));
    actions.push(btn('✅ حوّل لطلب', () => convert(q), 'primary'));
    actions.push(btn('✏️', () => openForm(q)));
    actions.push(btn('رفض', async () => { await quotes.update(q.id, { status: 'rejected' }); await loadData(); draw(); }));
  }
  actions.push(btn('🗑️', () => remove(q), 'danger'));
  return el('div', { className: 'card', style: { padding: '12px', marginBottom: '8px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, [
      el('strong', { 'data-customer-id': q.customerId || null }, custName(q.customerId)),
      el('span', { style: { fontSize: '12px', fontWeight: '700', color } }, statusText),
    ]),
    el('div', { style: { fontSize: '12px', color: '#666', margin: '4px 0 8px' } },
      (q.items || []).length + ' بند · ' + formatEGP(t.amount) + (q.validUntil ? ' · حتى ' + formatDate(q.validUntil) : '')),
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, actions),
  ]);
}

function draw() {
  const c = state.container;
  if (!c) return;
  clear(c);
  c.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('h2', { style: { margin: '0' } }, '📝 عروض الأسعار'),
    el('button', { className: 'btn btn--primary', type: 'button', onClick: () => openForm(null) }, '+ عرض جديد'),
  ]));
  const filters = [['open', 'مفتوحة'], ['accepted', 'محوَّلة'], ['all', 'الكل']];
  c.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
    filters.map(([id, label]) => el('button', {
      className: 'btn ' + (state.filter === id ? 'btn--primary' : 'btn--secondary'), type: 'button',
      onClick: () => { state.filter = id; draw(); },
    }, label))));
  const list = state.list.filter((q) => state.filter === 'all' ? true : state.filter === 'open' ? q.status === 'open' : q.status === 'accepted');
  if (!list.length) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center', color: '#888' } },
      state.list.length ? 'لا توجد عروض في هذا التصنيف' : 'لا توجد عروض بعد — اضغط «+ عرض جديد»'));
    return;
  }
  list.forEach((q) => c.appendChild(card(q)));
}

export const quotesPage = {
  async render(container) {
    state = { container, list: [], customers: [], workshop: {}, msgCfg: null, filter: 'open' };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try { await loadData(); draw(); } catch (err) {
      console.error('[quotes] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() { state = { container: null, list: [], customers: [], workshop: {}, msgCfg: null, filter: 'open' }; },
};
