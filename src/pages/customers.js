/* ==========================================================================
   customers.js — صفحة العملاء (المدخل): الحالة والدورة الحيّة والواجهة العامة
   ==========================================================================
   - صورة شخصية للعميل (avatar).
   - مقاسات ديناميكية + فلترة (VIP/عادي) + ترتيب (الأحدث/الأشرى/أبجدي).
   - Progressive List + Quick Preview + كشف حساب.
   - Autosave: حفظ تلقائي لمسودة النموذج (24 ساعة).

   v3.5.8: تقسيم صيانة بلا تغيير سلوك (1050 سطراً ← مدخل + 7 وحدات):
     customers-logic.js (منطق نقي وثوابت) · customers-load.js (التحميل وترقية VIP) · customers-measure.js (المقاسات وأخذ المقاس)
     · customers-form.js (openCustomerForm حرفياً) · customers-actions.js (حذف/VIP/كشف/صورة/تصدير جهات الاتصال)
     · customers-cards.js (البطاقة) · customers-views.js (الإحصاءات والفلاتر والترتيب والقائمة).
   التواصل عبر ctx صريح { state, refresh, openForm } (لا EventBus، لا استيراد دائري). الوحدات لا تستورد هذا الملف.
   الواجهة العامة كما كانت: customersPage · filterCustomers.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { consumeNew } from '../core/deeplink.js';
import { openContactsImport } from '../ui/contacts-import-dialog.js';
import { applyFiltersAndSort } from './customers-logic.js';
import { loadCustomers, loadMeasurementFields } from './customers-load.js';
import { openCustomerForm } from './customers-form.js';
import { openContactsExport } from './customers-actions.js';
import { renderStats, renderFilterBar, renderSortBar, renderList } from './customers-views.js';

/* --- إعادة تصدير الواجهة العامة (نفس الاسم والتوقيع) --- */
export { filterCustomers } from './customers-logic.js';

/* --- الحالة --- */
/* كائن واحد ثابت طوال عمر الوحدة: destroy يصفّره في مكانه (لا إعادة إسناد) فلا يبقى أي مرجع قديم في الوحدات. */
const state = {
  customers: [],
  customerTotals: {},
  activeFilter: 'all',
  activeSort: 'recent',
  searchQuery: '',
  container: null,
  measurementFields: [],
  list: null,
};

/* السياق الصريح الذي تستلمه الوحدات: الحالة + إعادة التحميل/الرسم + فتح النموذج. */
const ctx = {
  state,
  refresh: () => refreshAll(),
  openForm: (customer) => openCustomerForm(ctx, customer),
};

/** تصفير الحالة في المكان (يطابق الشكل الذي كان destroy ينشئه سابقاً). */
function resetCustomersState(s) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    customers: [], customerTotals: {},
    activeFilter: 'all', activeSort: 'recent',
    searchQuery: '', container: null,
    measurementFields: [], list: null,
  });
}

async function refreshAll() {
  await loadCustomers(state);
  renderStats(ctx);

  if (state.list) {
    state.list.destroy();
    state.list = null;
  }
  const wrap = state.container?.querySelector('#customers-list');
  if (wrap) clear(wrap);

  renderList(ctx);
}

/* ==========================================================================
   9. API
   ========================================================================== */

export const customersPage = {
  async render(container, sub) {
    clear(container);
    state.container = container;
    state.searchQuery = '';
    state.list = null;
    state.activeFilter = 'all';
    state.activeSort = 'recent';

    await loadMeasurementFields(state);

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
      const filtered = applyFiltersAndSort(state.customers, state);
      if (state.list) state.list.setItems(filtered);
      else renderList(ctx);
    });
    container.appendChild(searchInput);

    container.appendChild(el('div', { id: 'customers-filters' }));
    container.appendChild(el('div', { id: 'customers-sort' }));

    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '16px' },
      onClick: () => ctx.openForm(),
    }, '➕ إضافة عميل'));

    container.appendChild(el('button', {
      className: 'btn btn--secondary btn--block', type: 'button', 'data-action': 'import-contacts',
      style: { marginBottom: '16px' },
      onClick: () => openContactsImport({ onDone: () => refreshAll() }),
    }, '📇 استيراد من جهات الاتصال'));

    container.appendChild(el('button', {
      className: 'btn btn--secondary btn--block',
      style: { marginBottom: '16px' },
      onClick: () => openContactsExport(ctx),
    }, '📇 تصدير العملاء لجهات الاتصال'));

    container.appendChild(el('div', { id: 'customers-list' }));

    await refreshAll();
    renderFilterBar(ctx);
    renderSortBar(ctx);
    consumeNew(sub, 'customers', () => ctx.openForm());
  },

  destroy() {
    if (state.list) {
      try { state.list.destroy(); } catch (e) { /* ignore */ }
    }
    resetCustomersState(state);
  },
};
