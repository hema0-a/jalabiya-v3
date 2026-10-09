/* ==========================================================================
   payments.js — صفحة الدفعات (CRUD + ربط الطلب + معاينة)
   ==========================================================================
   - CRUD كامل + ربط بعميل وطلب.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة).
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
import * as draft from '../services/draft-manager.js';
import { withDepositPayments } from '../services/payments-view.js';

/* --- مفتاح المسودة --- */
const DRAFT_KEY = 'payment-form';

/* --- الحالة --- */
let state = {
  payments: [],
  customers: [],
  orders: [],
  customerMap: {},
  orderMap: {},
  activeFilter: 'all',       // 'all' | 'with-order' | 'without-order'
  searchQuery: '',
  container: null,
};

/* ==========================================================================
   1. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [pList, cList, oList] = await Promise.all([
    payments.list(),
    customers.list(),
    orders.list(),
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

/* ==========================================================================
   2. النموذج
   ========================================================================== */

function openPaymentForm(existing = null) {
  const isEdit = existing !== null;

  /* العميل */
  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— اختر عميلاً —'));
  state.customers.forEach((c) => {
    customerSelect.appendChild(el('option', { value: c.id }, c.name));
  });
  if (isEdit && existing.customerId) customerSelect.value = existing.customerId;

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
          const amount = Number(amountInput.value);
          if (!customerId) return toast.warning('اختر عميلاً');
          if (!amount || amount <= 0) return toast.warning('أدخل مبلغاً صحيحاً');

          const data = {
            customerId,
            orderId,
            amount,
            method: methodSelect.value,
            notes: notesInput.value.trim(),
            isDeposit: !!orderId && depositCheck.checked,
          };
          try {
            if (isEdit) { await payments.update(existing.id, data); toast.success('تم التحديث'); }
            else { await payments.create(data); toast.success('تم الإضافة'); }
            draft.clear(DRAFT_KEY);
            handle.close();
            await refreshAll();
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

/* ==========================================================================
   3. عمليات
   ========================================================================== */

async function deletePayment(p) {
  const c = state.customerMap[p.customerId];
  const ok = await modal.confirm({
    title: 'حذف دفعة',
    message: 'حذف دفعة "' + (c ? c.name : '') + '" بمبلغ ' + formatEGP(p.amount) + '؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('payments', p);
    await payments.remove(p.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل: ' + err.message); }
}

/* ==========================================================================
   4. بطاقة الدفعة
   ========================================================================== */

function buildPaymentCard(p) {
  const c = state.customerMap[p.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone: 'Vodafone', other: 'أخرى' };

  /* الطلب المرتبط */
  const linkedOrder = p.orderId ? state.orderMap[p.orderId] : null;
  const orderLabel = linkedOrder
    ? '#' + String(linkedOrder.id).slice(-6) + ' — ' + formatEGP(linkedOrder.amount)
    : null;

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': p.id,
    onClick: () => previewPayment(p, c, () => openPaymentForm(p)),
  });

  /* السطر 1: العميل + المبلغ */
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  }, [
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, name),
      orderLabel ? el('div', {
        style: { fontSize: '11px', color: '#1F6D57', marginTop: '2px', fontWeight: '500' },
      }, '🔗 ' + orderLabel) : el('div', {
        style: { fontSize: '11px', color: '#999', marginTop: '2px' },
      }, 'بدون طلب مرتبط'),
    ]),
    el('div', { style: { fontWeight: '700', color: '#2E7D32', fontSize: '16px', textAlign: 'left' } },
      formatEGP(p.amount)),
  ]));

  /* السطر 2: طريقة + تاريخ */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '10px', fontSize: '12px', color: '#666', marginBottom: '8px', flexWrap: 'wrap' },
  }, [
    el('span', {}, '💳 ' + (methods[p.method] || 'نقدي')),
    p.createdAt ? el('span', {}, '📅 ' + formatDate(p.createdAt)) : null,
  ].filter(Boolean)));

  if (p.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px' },
    }, p.notes));
  }

  /* الأزرار */
  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: () => openPaymentForm(p),
    }, '✏️ تعديل'),
    el('button', {
      className: 'btn btn--sm btn--danger', type: 'button',
      onClick: () => deletePayment(p),
    }, '🗑️'),
  ]));

  return card;
}

/* ==========================================================================
   5. الرسم
   ========================================================================== */

function renderStats() {
  const wrap = state.container?.querySelector('#payments-stats');
  if (!wrap) return;
  clear(wrap);

  const total = state.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthTotal = state.payments
    .filter((p) => (p.createdAt || 0) >= monthStart.getTime())
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const linked = state.payments.filter((p) => p.orderId).length;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, formatEGP(total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, formatEGP(monthTotal)),
    el('span', { className: 'stat__label' }, 'هذا الشهر'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🔗'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#1F6D57' } }, String(linked)),
    el('span', { className: 'stat__label' }, 'مرتبطة بطلب'),
  ]));

  /* المقدمات المقبوضة في الطلبات ولم تُسجَّل كدفعات: تُحتسب في الإيرادات (اللوحة/التقارير)
     فنعرضها هنا حتى لا يختلف إجمالي هذه الصفحة عن بقية الصفحات بلا تفسير. */
  const deposits = withDepositPayments(state.payments, state.orders)
    .filter((p) => p && p.synthetic)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (deposits > 0) {
    wrap.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '🧾'),
      el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#B8863B' } }, formatEGP(deposits)),
      el('span', { className: 'stat__label' }, 'مقدمات طلبات (خارج الإجمالي)'),
    ]));
  }
}

function renderFilters() {
  const wrap = state.container?.querySelector('#payments-filters');
  if (!wrap) return;
  clear(wrap);

  const items = [
    { id: 'all',           label: '🎯 الكل',           count: state.payments.length },
    { id: 'with-order',    label: '🔗 لها طلب',        count: state.payments.filter((p) => p.orderId).length },
    { id: 'without-order', label: '⭕ بدون طلب',       count: state.payments.filter((p) => !p.orderId).length },
  ];

  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters();
        renderList();
      },
    }, it.label + ' (' + it.count + ')'));
  });
}

function applyFilters() {
  let list = state.payments;

  if (state.activeFilter === 'with-order') {
    list = list.filter((p) => p.orderId);
  } else if (state.activeFilter === 'without-order') {
    list = list.filter((p) => !p.orderId);
  }

  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((p) => {
      const c = state.customerMap[p.customerId];
      const name = c ? String(c.name || '').toLowerCase() : '';
      const notes = String(p.notes || '').toLowerCase();
      return name.includes(q) || notes.includes(q);
    });
  }

  return list;
}

function renderList() {
  const lc = state.container?.querySelector('#payments-list');
  if (!lc) return;
  clear(lc);

  const filtered = applyFilters();

  if (filtered.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    const isFiltered = state.activeFilter !== 'all';
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '💰'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' :
        (isFiltered ? 'لا توجد دفعات في هذا التصنيف' : 'لا توجد دفعات')),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة دفعة" للبدء'),
    ]));
    return;
  }

  filtered.forEach((p) => lc.appendChild(buildPaymentCard(p)));
}

async function refreshAll() {
  await loadData();
  renderStats();
  renderFilters();
  renderList();
}

/* ==========================================================================
   6. API
   ========================================================================== */

export const paymentsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    container.appendChild(el('div', {
      id: 'payments-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => openPaymentForm(),
    }, '➕ إضافة دفعة'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الملاحظات...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList();
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'payments-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'payments-list' }));

    await refreshAll();
  },

  destroy() {
    state = {
      payments: [], customers: [], orders: [],
      customerMap: {}, orderMap: {},
      activeFilter: 'all', searchQuery: '', container: null,
    };
  },
};
