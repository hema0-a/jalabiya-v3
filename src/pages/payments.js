/* ==========================================================================
   payments.js — صفحة الدفعات (CRUD + ربط الطلب + معاينة)
   ==========================================================================
   - CRUD كامل + ربط بعميل وطلب.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة).
   [v3.5.24] قُسِّمت الصفحة دون تغيير سلوك (على نمط orders*.js):
     payments.js       — الحالة + تحميل البيانات + الواجهة العامة (هذا الملف)
     payments-form.js  — نموذج الإضافة/التعديل
     payments-card.js  — بطاقة الدفعة + الحذف
     payments-list.js  — الإحصائيات والفلاتر والقائمة التدريجية
   الوحدات تستلم ctx = { state, refresh } ولا تستورد هذا الملف.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { consumeNew } from '../core/deeplink.js';
import { payments } from '../data/repos/payments.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { openPaymentForm } from './payments-form.js';
import { renderStats, renderFilters, renderList, disposePaymentsList } from './payments-list.js';

/* --- الحالة (كائن واحد ثابت الهوية؛ يُعاد ضبطه في destroy) --- */
const state = {
  payments: [],
  customers: [],
  orders: [],
  customerMap: {},
  orderMap: {},
  activeFilter: 'all',       // 'all' | 'with-order' | 'without-order'
  searchQuery: '',
  container: null,
};

const ctx = { state, refresh: refreshAll };

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

async function refreshAll() {
  await loadData();
  renderStats(ctx);
  renderFilters(ctx);
  renderList(ctx);
}

/* ==========================================================================
   6. API
   ========================================================================== */

export const paymentsPage = {
  async render(container, sub) {
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
      onClick: () => openPaymentForm(ctx),
    }, '➕ إضافة دفعة'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الملاحظات...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList(ctx);
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'payments-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'payments-list' }));

    await refreshAll();
    consumeNew(sub, 'payments', () => openPaymentForm(ctx));
  },

  destroy() {
    disposePaymentsList();
    Object.assign(state, {
      payments: [], customers: [], orders: [],
      customerMap: {}, orderMap: {},
      activeFilter: 'all', searchQuery: '', container: null,
    });
  },
};
