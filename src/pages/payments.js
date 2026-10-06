/* ==========================================================================
   payments.js — صفحة الدفعات
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { payments } from '../data/repos/payments.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewPayment } from '../ui/quick-preview.js';
import { formatEGP, formatDate } from '../core/utils.js';

let state = {
  payments: [],
  customers: [],
  orders: [],
  customerMap: {},
  orderMap: {},
  container: null,
};

async function loadData() {
  const [pList, cList, oList] = await Promise.all([
    payments.list(), customers.list(), orders.list(),
  ]);
  pList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.payments = pList;
  state.customers = cList;
  state.orders = oList;
  state.customerMap = {};
  cList.forEach((c) => { state.customerMap[c.id] = c; });
  state.orderMap = {};
  oList.forEach((o) => { state.orderMap[o.id] = o; });
}

function openPaymentForm(existing = null) {
  const isEdit = existing !== null;

  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— اختر عميلاً —'));
  state.customers.forEach((c) => {
    customerSelect.appendChild(el('option', { value: c.id }, c.name));
  });
  if (isEdit && existing.customerId) customerSelect.value = existing.customerId;

  const amountInput = el('input', { className: 'input', type: 'number', placeholder: '0', min: '0', step: '0.01' });
  if (isEdit && existing.amount != null) amountInput.value = String(existing.amount);

  const methodSelect = el('select', { className: 'select' });
  [['cash', 'نقدي'], ['instapay', 'InstaPay'], ['vodafone', 'Vodafone Cash'], ['other', 'أخرى']].forEach(([v, l]) => {
    methodSelect.appendChild(el('option', { value: v }, l));
  });
  if (isEdit) methodSelect.value = existing.method || 'cash';

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العميل *'), customerSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'المبلغ (ج.م) *'), amountInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'طريقة الدفع'), methodSelect]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل دفعة' : 'إضافة دفعة',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ' : 'إضافة',
        variant: 'primary',
        action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          const amount = Number(amountInput.value);
          if (!customerId) return toast.warning('اختر عميلاً');
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');
          const data = {
            customerId,
            amount,
            method: methodSelect.value,
            notes: notesInput.value.trim(),
          };
          try {
            if (isEdit) { await payments.update(existing.id, data); toast.success('تم التحديث'); }
            else { await payments.create(data); toast.success('تم الإضافة'); }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل: ' + err.message); }
        },
      },
    ],
  });
}

async function deletePayment(p) {
  const c = state.customerMap[p.customerId];
  const ok = await modal.confirm({
    title: 'حذف دفعة',
    message: 'حذف دفعة "' + (c ? c.name : '') + '" بمبلغ ' + formatEGP(p.amount) + '؟',
    confirmText: 'حذف',
    cancelText: 'إلغاء',
    danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('payments', p);
    await payments.remove(p.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

function buildPaymentCard(p) {
  const c = state.customerMap[p.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى' };

  const card = el('div', {
  className: 'card',
  style: { marginBottom: '8px', cursor: 'pointer' },
  'data-id': p.id,
  onClick: () => previewPayment(p, c, () => openPaymentForm(p)),
}, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, name),
      el('div', { style: { fontWeight: '700', color: '#2E7D32', fontSize: '16px' } }, formatEGP(p.amount)),
    ]),
    el('div', { style: { display: 'flex', gap: '10px', fontSize: '12px', color: '#666', marginBottom: '8px' } }, [
      el('span', {}, '💳 ' + (methods[p.method] || 'نقدي')),
      p.createdAt ? el('span', {}, '📅 ' + formatDate(p.createdAt)) : null,
    ]),
  ]);

  if (p.notes) {
    card.appendChild(el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } }, p.notes));
  }

  card.appendChild(el('div', {
  style: { display: 'flex', gap: '6px' },
  onClick: (e) => e.stopPropagation(),
}, [
  el('button', { className: 'btn btn--sm btn--secondary', onClick: () => openPaymentForm(p) }, '✏️ تعديل'),
  el('button', { className: 'btn btn--sm btn--danger', onClick: () => deletePayment(p) }, '🗑️'),
]));

  return card;
}

function renderStats() {
  const wrap = state.container?.querySelector('#payments-stats');
  if (!wrap) return;
  clear(wrap);
  const total = state.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthTotal = state.payments
    .filter((p) => (p.createdAt || 0) >= monthStart.getTime())
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value' }, formatEGP(total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value' }, formatEGP(monthTotal)),
    el('span', { className: 'stat__label' }, 'هذا الشهر'),
  ]));
}

function renderList() {
  const lc = state.container?.querySelector('#payments-list');
  if (!lc) return;
  clear(lc);
  if (state.payments.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '💰'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد دفعات'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة دفعة" للبدء'),
    ]));
    return;
  }
  state.payments.forEach((p) => lc.appendChild(buildPaymentCard(p)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderList();
}

export const paymentsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    container.appendChild(el('div', {
      id: 'payments-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '16px' },
      onClick: () => openPaymentForm(),
    }, '➕ إضافة دفعة'));
    container.appendChild(el('div', { id: 'payments-list' }));
    await refreshAll();
  },
  destroy() {
    state = { payments: [], customers: [], orders: [], customerMap: {}, orderMap: {}, container: null };
  },
};
