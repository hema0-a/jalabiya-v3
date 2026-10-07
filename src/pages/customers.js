/* ==========================================================================
   customers.js — صفحة العملاء (CRUD + مقاسات + فلترة + ترتيب)
   ==========================================================================
   - فلترة: الكل / VIP / عادي.
   - ترتيب: الأحدث / الأعلى شراءً / أبجدي.
   - عرض تدريجي (Progressive List).
   - كشف حساب + Quick Preview + مقاسات.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { trash } from '../data/repos/trash.js';
import { settings } from '../data/repos/settings.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { previewCustomer } from '../ui/quick-preview.js';
import { printCustomerStatement } from '../services/invoice-print.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { formatEGP } from '../core/utils.js';

/* --- الفلاتر والترتيب --- */
const FILTERS = [
  { id: 'all',    label: 'الكل',      icon: '👥' },
  { id: 'vip',    label: 'VIP',       icon: '⭐' },
  { id: 'normal', label: 'عادي',      icon: '👤' },
];

const SORTS = [
  { id: 'recent', label: 'الأحدث',      icon: '🕐' },
  { id: 'spent',  label: 'الأعلى شراءً', icon: '💰' },
  { id: 'name',   label: 'أبجدي',       icon: '🔤' },
];

/* --- الحالة --- */
let state = {
  customers: [],
  customerTotals: {},        // { customerId: totalPaid }
  activeFilter: 'all',
  activeSort: 'recent',
  searchQuery: '',
  container: null,
  measurementFields: [],
  list: null,
};

/* ==========================================================================
   1. الفلترة (مُصدَّرة للاختبار)
   ========================================================================== */

export function filterCustomers(list, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => {
    const name = String(c.name || '').toLowerCase();
    const phone = String(c.phone || '');
    return name.includes(q) || phone.includes(q);
  });
}

/* ==========================================================================
   2. تحميل
   ========================================================================== */

async function loadCustomers() {
  const [list, ordersList, paymentsList] = await Promise.all([
    customers.list(),
    orders.list(),
    payments.list(),
  ]);

  /* حساب إجمالي المدفوع لكل عميل */
  const totals = {};
  paymentsList.forEach((p) => {
    const cid = p.customerId;
    if (!cid) return;
    totals[cid] = (totals[cid] || 0) + (Number(p.amount) || 0);
  });
  state.customerTotals = totals;

  /* إحصائيات الطلبات لكل عميل (عدد) */
  const ordersCount = {};
  ordersList.forEach((o) => {
    const cid = o.customerId;
    if (!cid) return;
    ordersCount[cid] = (ordersCount[cid] || 0) + 1;
  });

  /* إضافة البيانات المساعدة */
  list.forEach((c) => {
    c._totalPaid = totals[c.id] || 0;
    c._ordersCount = ordersCount[c.id] || 0;
  });

  state.customers = list;
}

async function loadMeasurementFields() {
  try {
    const s = await settings.get();
    const fields = Array.isArray(s.measurementFields) ? s.measurementFields : [];
    state.measurementFields = fields.filter((f) => f.enabled !== false);
  } catch {
    state.measurementFields = [];
  }
}

/* ==========================================================================
   3. الفلترة والترتيب
   ========================================================================== */

/**
 * تطبيق الفلتر والترتيب على القائمة.
 * @param {Array} list
 * @returns {Array}
 */
function applyFiltersAndSort(list) {
  let result = list;

  /* الفلترة */
  if (state.activeFilter === 'vip') {
    result = result.filter((c) => c.vip === true);
  } else if (state.activeFilter === 'normal') {
    result = result.filter((c) => !c.vip);
  }

  /* البحث */
  result = filterCustomers(result, state.searchQuery);

  /* الترتيب */
  if (state.activeSort === 'spent') {
    result = [...result].sort((a, b) => (b._totalPaid || 0) - (a._totalPaid || 0));
  } else if (state.activeSort === 'name') {
    result = [...result].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ar')
    );
  } else {
    /* الأحدث */
    result = [...result].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  return result;
}

/* ==========================================================================
   4. نموذج العميل
   ========================================================================== */

function buildMeasurementsSection(existingMeasurements) {
  const wrap = el('div', { className: 'field' });
  wrap.appendChild(el('label', { className: 'field__label' }, '📏 المقاسات (اختياري)'));

  const fields = state.measurementFields;
  const values = existingMeasurements || {};

  if (fields.length === 0) {
    wrap.appendChild(el('div', {
      style: { fontSize: '11px', color: '#999', padding: '6px 0' },
    }, 'لا توجد حقول مقاسات مفعَّلة. أضفها من الإعدادات → حقول المقاسات.'));
    return { node: wrap, getValues: () => ({}) };
  }

  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  });

  const inputs = {};

  fields.forEach((f) => {
    const inp = el('input', {
      className: 'input', type: 'number', min: '0', step: '0.5', placeholder: '0',
    });
    if (values[f.id] != null && values[f.id] !== '') {
      inp.value = String(values[f.id]);
    }
    inputs[f.id] = inp;

    grid.appendChild(el('div', {}, [
      el('label', {
        style: { fontSize: '11px', color: '#666', marginBottom: '3px', display: 'block' },
      }, f.name + (f.unit ? ' (' + f.unit + ')' : '')),
      inp,
    ]));
  });

  wrap.appendChild(grid);

  return {
    node: wrap,
    getValues: () => {
      const out = {};
      Object.keys(inputs).forEach((id) => {
        const v = inputs[id].value.trim();
        if (v === '') return;
        const n = Number(v);
        if (isFinite(n) && n > 0) out[id] = n;
      });
      return out;
    },
  };
}

function openCustomerForm(existing = null) {
  const isEdit = existing !== null;

  const nameInput = el('input', {
    className: 'input', type: 'text', placeholder: 'اسم العميل',
    value: isEdit ? (existing.name || '') : '',
  });

  const phoneInput = el('input', {
    className: 'input', type: 'tel', placeholder: '01xxxxxxxxx',
    value: isEdit ? (existing.phone || '') : '',
  });

  const addressInput = el('input', {
    className: 'input', type: 'text', placeholder: 'العنوان (اختياري)',
    value: isEdit ? (existing.address || '') : '',
  });

  const notesInput = el('textarea', { className: 'textarea', placeholder: 'ملاحظات إضافية...' });
  notesInput.value = isEdit ? (existing.notes || '') : '';

  const vipCheckbox = el('input', { type: 'checkbox', className: 'toggle__input' });
  vipCheckbox.checked = isEdit ? Boolean(existing.vip) : false;

  const vipToggle = el('label', { className: 'toggle' }, [
    vipCheckbox,
    el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
    el('span', { className: 'toggle__label' }, 'عميل مميز (VIP)'),
  ]);

  const measurements = buildMeasurementsSection(
    isEdit ? existing.measurements : null
  );

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'رقم الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العنوان'), addressInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
    el('div', { className: 'field' }, [vipToggle]),
    measurements.node,
  ]);

  const handle = modal.open({
    title: isEdit ? 'تعديل عميل' : 'إضافة عميل',
    body,
    closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: isEdit ? 'حفظ التعديلات' : 'إضافة',
        variant: 'primary', action: 'save',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) { toast.warning('الاسم مطلوب'); return; }
          const data = {
            name,
            phone: phoneInput.value.trim(),
            address: addressInput.value.trim(),
            notes: notesInput.value.trim(),
            vip: vipCheckbox.checked,
            measurements: measurements.getValues(),
          };
          try {
            if (isEdit) { await customers.update(existing.id, data); toast.success('تم تحديث العميل'); }
            else { await customers.create(data); toast.success('تم إضافة العميل'); }
            handle.close();
            await refreshAll();
          } catch (err) { toast.danger('فشل الحفظ: ' + err.message); }
        },
      },
    ],
  });
}

/* ==========================================================================
   5. حذف + VIP + طباعة
   ========================================================================== */

async function deleteCustomer(customer) {
  const ok = await modal.confirm({
    title: 'حذف عميل',
    message: 'هل أنت متأكد من حذف "' + customer.name + '"؟',
    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;
  try {
    await trash.addToTrash('customers', customer);
    await customers.remove(customer.id);
    toast.success('تم الحذف');
    await refreshAll();
  } catch (err) { toast.danger('فشل الحذف: ' + err.message); }
}

async function toggleVIP(customer) {
  try {
    const updated = await customers.toggleVIP(customer.id);
    if (updated && updated.vip) toast.info('تم تعيينه كعميل VIP');
    else toast.info('تم إزالة تصنيف VIP');
    await refreshAll();
  } catch (err) { toast.danger('فشل التغيير: ' + err.message); }
}

async function printStatement(customer) {
  try {
    toast.info('جارٍ تجهيز الكشف...');
    const [ordersList, paymentsList] = await Promise.all([
      orders.findByCustomer(customer.id),
      payments.findByCustomer(customer.id),
    ]);
    await printCustomerStatement(customer, ordersList, paymentsList);
  } catch (err) {
    console.error('[printStatement]', err);
    toast.danger('فشل فتح نافذة الطباعة');
  }
}

/* ==========================================================================
   6. بطاقة عميل
   ========================================================================== */

function hasMeasurements(c) {
  if (!c.measurements) return false;
  return Object.keys(c.measurements).length > 0;
}

function buildCustomerCard(c) {
  const initial = String(c.name || '?').trim().charAt(0) || '?';
  const withMeasurements = hasMeasurements(c);
  const totalPaid = Number(c._totalPaid) || 0;
  const ordersCount = Number(c._ordersCount) || 0;

  const headerChildren = [
    el('div', {
      style: {
        width: '40px', height: '40px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
        color: '#fff', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '18px', fontWeight: '600',
        flexShrink: '0',
      },
    }, initial),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        c.name || 'بدون اسم'),
      c.phone ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, c.phone) : null,
    ]),
  ];
  if (c.vip) {
    headerChildren.push(el('span', { className: 'badge badge--accent' }, '⭐ VIP'));
  }

  const header = el('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '8px',
      marginBottom: (c.notes || withMeasurements || totalPaid > 0) ? '8px' : '12px',
    },
  }, headerChildren);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': c.id,
    onClick: () => previewCustomer(c, () => openCustomerForm(c)),
  }, [header]);

  /* شارات المقاسات + الإجمالي */
  const badges = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  });

  if (withMeasurements) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#1F6D57', background: '#E8F5E9',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, '📏 مقاسات'));
  }

  if (ordersCount > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#1565C0', background: '#E3F2FD',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, '📦 ' + ordersCount + ' طلب'));
  }

  if (totalPaid > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#2E7D32', background: '#E8F5E9',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, '💰 ' + formatEGP(totalPaid)));
  }

  if (badges.children.length > 0) card.appendChild(badges);

  if (c.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '12px', lineHeight: '1.4' },
    }, c.notes));
  }

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--secondary',
      onClick: () => openCustomerForm(c),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      title: 'كشف حساب',
      onClick: () => printStatement(c),
    }, '📄'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      onClick: () => toggleVIP(c),
    }, c.vip ? '⭐ إزالة' : '⭐ VIP'),
    el('button', {
      className: 'btn btn--sm btn--danger',
      onClick: () => deleteCustomer(c),
    }, '🗑️'),
  ]));

  return card;
}

/* ==========================================================================
   7. الرسم
   ========================================================================== */

function renderStats() {
  const stats = state.container?.querySelector('#customers-stats');
  if (!stats) return;
  clear(stats);

  const total = state.customers.length;
  const vips = state.customers.filter((c) => c.vip).length;

  stats.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '👥'),
    el('span', { className: 'stat__value' }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي العملاء'),
  ]));

  stats.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⭐'),
    el('span', { className: 'stat__value' }, String(vips)),
    el('span', { className: 'stat__label' }, 'عملاء VIP'),
  ]));
}

function buildFilterBar() {
  const wrap = el('div', {
    style: { display: 'flex', gap: '4px', marginBottom: '8px', overflowX: 'auto' },
  });

  FILTERS.forEach((f) => {
    const isActive = state.activeFilter === f.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      onClick: () => {
        state.activeFilter = f.id;
        renderFilterBar();
        renderList();
      },
    }, f.icon + ' ' + f.label));
  });

  return wrap;
}

function buildSortBar() {
  const wrap = el('div', {
    style: { display: 'flex', gap: '4px', marginBottom: '12px', overflowX: 'auto' },
  });

  SORTS.forEach((s) => {
    const isActive = state.activeSort === s.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--secondary' : 'btn--ghost'),
      onClick: () => {
        state.activeSort = s.id;
        renderSortBar();
        renderList();
      },
    }, s.icon + ' ' + s.label));
  });

  return wrap;
}

function renderFilterBar() {
  const wrap = state.container?.querySelector('#customers-filters');
  if (!wrap) return;
  clear(wrap);
  wrap.appendChild(buildFilterBar());
}

function renderSortBar() {
  const wrap = state.container?.querySelector('#customers-sort');
  if (!wrap) return;
  clear(wrap);
  wrap.appendChild(buildSortBar());
}

function buildEmptyState() {
  const isSearching = state.searchQuery.trim() !== '';
  const isFiltered = state.activeFilter !== 'all';
  return el('div', { className: 'empty-state' }, [
    el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '👥'),
    el('h2', { className: 'empty-state__title' },
      isSearching ? 'لا نتائج' : (isFiltered ? 'لا يوجد عملاء في هذه الفئة' : 'لا يوجد عملاء')),
    el('p', { className: 'empty-state__text' },
      isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة عميل" للبدء'),
  ]);
}

function renderList() {
  const wrap = state.container?.querySelector('#customers-list');
  if (!wrap) return;

  const filtered = applyFiltersAndSort(state.customers);

  if (state.list) {
    state.list.setItems(filtered);
    return;
  }

  const list = createProgressiveList({
    items: filtered,
    pageSize: 20,
    render: (c) => buildCustomerCard(c),
    emptyState: () => buildEmptyState(),
  });

  state.list = list;
  wrap.appendChild(list.node);
}

async function refreshAll() {
  await loadCustomers();
  renderStats();

  if (state.list) {
    state.list.destroy();
    state.list = null;
  }
  const wrap = state.container?.querySelector('#customers-list');
  if (wrap) clear(wrap);

  renderList();
}

/* ==========================================================================
   8. API
   ========================================================================== */

export const customersPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.searchQuery = '';
    state.list = null;
    state.activeFilter = 'all';
    state.activeSort = 'recent';

    await loadMeasurementFields();

    container.appendChild(el('div', {
      id: 'customers-stats',
      style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
    }));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الهاتف...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      const filtered = applyFiltersAndSort(state.customers);
      if (state.list) state.list.setItems(filtered);
      else renderList();
    });
    container.appendChild(searchInput);

    /* الفلاتر */
    container.appendChild(el('div', { id: 'customers-filters' }));

    /* الترتيب */
    container.appendChild(el('div', { id: 'customers-sort' }));

    /* زر الإضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '16px' },
      onClick: () => openCustomerForm(),
    }, '➕ إضافة عميل'));

    /* القائمة */
    container.appendChild(el('div', { id: 'customers-list' }));

    await refreshAll();
    renderFilterBar();
    renderSortBar();
  },

  destroy() {
    if (state.list) {
      try { state.list.destroy(); } catch (e) { /* ignore */ }
    }
    state = {
      customers: [], customerTotals: {},
      activeFilter: 'all', activeSort: 'recent',
      searchQuery: '', container: null,
      measurementFields: [], list: null,
    };
  },
};
