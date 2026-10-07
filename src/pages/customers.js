/* ==========================================================================
   customers.js — صفحة العملاء (CRUD + مقاسات + صورة + فلترة + ترتيب)
   ==========================================================================
   - صورة شخصية للعميل (avatar).
   - مقاسات ديناميكية + فلترة (VIP/عادي) + ترتيب (الأحدث/الأشرى/أبجدي).
   - Progressive List + Quick Preview + كشف حساب.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة).
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
import { createOrderImagePicker } from '../ui/order-image-picker.js';
import { formatEGP } from '../core/utils.js';
import * as draft from '../services/draft-manager.js';

/* --- مفتاح المسودة --- */
const DRAFT_KEY = 'customer-form';

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
  customerTotals: {},
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

  const totals = {};
  paymentsList.forEach((p) => {
    const cid = p.customerId;
    if (!cid) return;
    totals[cid] = (totals[cid] || 0) + (Number(p.amount) || 0);
  });
  state.customerTotals = totals;

  const ordersCount = {};
  ordersList.forEach((o) => {
    const cid = o.customerId;
    if (!cid) return;
    ordersCount[cid] = (ordersCount[cid] || 0) + 1;
  });

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

function applyFiltersAndSort(list) {
  let result = list;

  if (state.activeFilter === 'vip') {
    result = result.filter((c) => c.vip === true);
  } else if (state.activeFilter === 'normal') {
    result = result.filter((c) => !c.vip);
  }

  result = filterCustomers(result, state.searchQuery);

  if (state.activeSort === 'spent') {
    result = [...result].sort((a, b) => (b._totalPaid || 0) - (a._totalPaid || 0));
  } else if (state.activeSort === 'name') {
    result = [...result].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ar')
    );
  } else {
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
    return { node: wrap, getValues: () => ({}), setValues: () => {} };
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
    setValues: (obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(inputs).forEach((id) => {
        const v = obj[id];
        inputs[id].value = (v != null && v !== '') ? String(v) : '';
      });
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

  /* --- صورة العميل (reuse order-image-picker) --- */
  const imagePicker = createOrderImagePicker({
    value: isEdit ? (existing.image || '') : '',
    label: '🖼️ صورة العميل',
    hint: 'صورة شخصية (اختياري) — تظهر في البطاقة والكشف',
  });

  const measurements = buildMeasurementsSection(
    isEdit ? existing.measurements : null
  );

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم *'), nameInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'رقم الهاتف'), phoneInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'العنوان'), addressInput]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'ملاحظات'), notesInput]),
    el('div', { className: 'field' }, [vipToggle]),
    imagePicker.node,
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
            image: imagePicker.getValue() || '',
            measurements: measurements.getValues(),
          };
          try {
            if (isEdit) { await customers.update(existing.id, data); toast.success('تم تحديث العميل'); }
            else { await customers.create(data); toast.success('تم إضافة العميل'); }
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
        if (typeof savedDraft.name === 'string') nameInput.value = savedDraft.name;
        if (typeof savedDraft.phone === 'string') phoneInput.value = savedDraft.phone;
        if (typeof savedDraft.address === 'string') addressInput.value = savedDraft.address;
        if (typeof savedDraft.notes === 'string') notesInput.value = savedDraft.notes;
        if (typeof savedDraft.vip === 'boolean') vipCheckbox.checked = savedDraft.vip;

        if (savedDraft.image && typeof imagePicker.setValue === 'function') {
          imagePicker.setValue(savedDraft.image);
        }
        if (savedDraft.measurements && typeof measurements.setValues === 'function') {
          measurements.setValues(savedDraft.measurements);
        }

        toast.info('📝 تم استرجاع مسودة سابقة');
      } catch (e) {
        console.warn('[CustomerForm] draft restore failed:', e);
      }
    }

    /* 2. حفظ تلقائي أثناء الكتابة (debounce 500ms) */
    let _saveTimer = null;
    const scheduleSave = () => {
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        try {
          const payload = {
            name: nameInput.value,
            phone: phoneInput.value,
            address: addressInput.value,
            notes: notesInput.value,
            vip: vipCheckbox.checked,
            image: imagePicker.getValue() || '',
            measurements: measurements.getValues(),
          };
          draft.save(DRAFT_KEY, payload);
        } catch (e) {
          console.warn('[CustomerForm] draft save failed:', e);
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
   6. عرض صورة العميل (lightbox)
   ========================================================================== */

function showCustomerImage(dataUrl, name) {
  if (!dataUrl) return;
  const body = el('div', {}, [
    el('img', {
      src: dataUrl, alt: name,
      style: { width: '100%', maxHeight: '70vh', objectFit: 'contain',
        borderRadius: '12px', background: '#fff' },
    }),
    el('div', {
      style: { fontSize: '13px', textAlign: 'center', marginTop: '8px', color: '#666' },
    }, '👤 ' + (name || 'عميل')),
  ]);
  modal.open({
    title: 'صورة العميل', body, closable: true,
    actions: [{ text: 'إغلاق', variant: 'ghost', onClick: () => modal.close() }],
  });
}

/* ==========================================================================
   7. بطاقة عميل
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
  const hasImage = !!c.image;

  /* --- الأفاتار: صورة أو حرف --- */
  const avatar = hasImage
    ? el('img', {
        src: c.image, alt: c.name || '',
        style: {
          width: '44px', height: '44px', borderRadius: '50%',
          objectFit: 'cover', flexShrink: '0', cursor: 'pointer',
          border: '2px solid #1F6D57',
        },
        onClick: (e) => {
          e.stopPropagation();
          showCustomerImage(c.image, c.name);
        },
      })
    : el('div', {
        style: {
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
          color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '18px', fontWeight: '600',
          flexShrink: '0',
        },
      }, initial);

  const headerChildren = [
    avatar,
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

  /* شارات */
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
   8. الرسم
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
   9. API
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

    container.appendChild(el('div', { id: 'customers-filters' }));
    container.appendChild(el('div', { id: 'customers-sort' }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '16px' },
      onClick: () => openCustomerForm(),
    }, '➕ إضافة عميل'));

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
