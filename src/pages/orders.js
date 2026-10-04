/* ==========================================================================
   orders.js — صفحة الطلبات (CRUD + فلاتر بالحالة)
   ==========================================================================
   API:
     ordersPage.render(container)  → Promise<void>
     ordersPage.destroy()          → void
     filterOrders(list, filterId)  → Array (مُصدَّرة للاختبار)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { customers } from '../data/repos/customers.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { formatEGP, formatDate } from '../core/utils.js';

/* --- حالة الصفحة --- */
let state = {
  orders: [],
  customers: [],
  customerMap: {},
  activeFilter: 'all',
  container: null,
};

/* --- خريطة الحالات --- */
const STATUS_MAP = {
  pending:     { label: 'قيد الانتظار', badge: 'badge--warning' },
  in_progress: { label: 'قيد التنفيذ',  badge: 'badge--info'    },
  ready:       { label: 'جاهز للتسليم', badge: 'badge--accent'  },
  delivered:   { label: 'تم التسليم',   badge: 'badge--success' },
  cancelled:   { label: 'ملغي',         badge: 'badge--danger'  },
};

const STATUS_ORDER = ['pending', 'in_progress', 'ready', 'delivered', 'cancelled'];

/* ==========================================================================
   1. فلترة (مُصدَّرة للاختبار)
   ========================================================================== */

/**
 * فلترة الطلبات حسب الحالة.
 * @param {Array} list
 * @param {string} filterId — 'all' أو حالة
 * @returns {Array}
 */
export function filterOrders(list, filterId) {
  if (filterId === 'all') return list;
  return list.filter((o) => o.status === filterId);
}

/* ==========================================================================
   2. تحميل البيانات
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
   3. نموذج إضافة/تعديل طلب
   ========================================================================== */

function openOrderForm(existing = null) {
  const isEdit = existing !== null;

  /* قائمة العملاء */
  const customerSelect = el('select', { className: 'select' });
  customerSelect.appendChild(el('option', { value: '' }, '— اختر عميلاً —'));
  state.customers.forEach((c) => {
    const label = c.name + (c.phone ? ' (' + c.phone + ')' : '');
    customerSelect.appendChild(el('option', { value: c.id }, label));
  });
  if (isEdit && existing.customerId) {
    customerSelect.value = existing.customerId;
  }

  /* حالة الطلب */
  const statusSelect = el('select', { className: 'select' });
  STATUS_ORDER.forEach((s) => {
    statusSelect.appendChild(el('option', { value: s }, STATUS_MAP[s].label));
  });
  statusSelect.value = isEdit ? existing.status : 'pending';

  /* التاريخ */
  const dateInput = el('input', { className: 'input', type: 'date' });
  if (isEdit && existing.dueDate) {
    dateInput.value = new Date(existing.dueDate).toISOString().slice(0, 10);
  }

  /* المبلغ */
  const amountInput = el('input', {
    className: 'input',
    type: 'number',
    placeholder: '0',
    min: '0',
    step: '0.01',
  });
  if (isEdit && existing.amount != null) {
    amountInput.value = String(existing.amount);
  }

  /* الملاحظات */
  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات...' });
  if (isEdit) notesInput.value = existing.notes || '';

  const body = el('div', {}, [
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'العميل *'),
      customerSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'الحالة'),
      statusSelect,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'تاريخ التسليم'),
      dateInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'المبلغ (ج.م)'),
      amountInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', { className: 'field__label' }, 'ملاحظات'),
      notesInput,
    ]),
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل طلب' : 'إضافة طلب',
    body,
    closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary',
        action: 'save',
        onClick: async () => {
          const customerId = customerSelect.value;
          if (!customerId) {
            toast.warning('اختر عميلاً');
            return;
          }
          const dueDateStr = dateInput.value;
          const dueDate = dueDateStr ? new Date(dueDateStr).getTime() : null;
          const amountRaw = amountInput.value.trim();
          const amount = amountRaw === '' ? 0 : Number(amountRaw);

          const data = {
            customerId,
            status: statusSelect.value,
            dueDate,
            amount,
            notes: notesInput.value.trim(),
          };

          try {
            if (isEdit) {
              await orders.update(existing.id, data);
              toast.success('تم تحديث الطلب');
            } else {
              await orders.create(data);
              toast.success('تم إضافة الطلب');
            }
            handle.close();
            await refreshAll();
          } catch (err) {
            toast.danger('فشل الحفظ: ' + err.message);
          }
        },
      },
    ],
  });
}

/* ==========================================================================
   4. حذف + تغيير الحالة
   ========================================================================== */

async function deleteOrder(order) {
  const c = state.customerMap[order.customerId];
  const label = c ? c.name : 'طلب';
  const ok = await modal.confirm({
    title: 'حذف طلب',
    message: 'هل أنت متأكد من حذف طلب "' + label + '"؟',
    confirmText: 'حذف',
    cancelText: 'إلغاء',
    danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('orders', order);
    await orders.remove(order.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) {
    toast.danger('فشل الحذف: ' + err.message);
  }
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
  } catch (err) {
    toast.danger('فشل التحديث: ' + err.message);
  }
}

/* ==========================================================================
   5. بناء بطاقة طلب
   ========================================================================== */

function buildOrderCard(o) {
  const c = state.customerMap[o.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const phone = c ? c.phone : '';
  const statusInfo = STATUS_MAP[o.status] || { label: o.status, badge: 'badge--info' };

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

  const actionChildren = [
    el('button', {
      className: 'btn btn--sm btn--secondary',
      'data-action': 'edit',
      onClick: () => openOrderForm(o),
    }, '✏️ تعديل'),
  ];
  if (o.status !== 'delivered' && o.status !== 'cancelled') {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--primary',
      'data-action': 'advance',
      onClick: () => advanceStatus(o),
    }, '▶️ التالي'));
  }
  actionChildren.push(el('button', {
    className: 'btn btn--sm btn--danger',
    'data-action': 'delete',
    onClick: () => deleteOrder(o),
  }, '🗑️'));

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px' },
    'data-id': o.id,
  }, [
    el('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' },
    }, headerChildren),
    el('div', {
      style: { display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#666', marginBottom: '8px' },
    }, metaChildren),
  ]);

  if (o.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, o.notes));
  }

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  }, actionChildren));

  return card;
}

/* ==========================================================================
   6. الرسم
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
  state.orders.forEach((o) => {
    if (counts[o.status] != null) counts[o.status]++;
  });

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
   7. API عام
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
    state = {
      orders: [],
      customers: [],
      customerMap: {},
      activeFilter: 'all',
      container: null,
    };
  },
};
