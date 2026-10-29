/* ==========================================================================
   loans.js — صفحة القروض الشخصية
   ==========================================================================
   - قروض ليّ (أنا الدائن) + عليّ (أنا المدين).
   - بطاقتان إحصائيتان + صافي الرصيد.
   - 3 فلاتر (الكل / ليّ / عليّ) + بحث.
   - CRUD كامل + نافذة تفاصيل + سجل دفعات.
   - معاينة سريعة (سيُضاف لاحقاً).

   v3.5.11: تقسيم صيانة بلا تغيير سلوك (629 سطراً ← مدخل + 5 وحدات):
     loans-logic.js · loans-forms.js (نموذج القرض/الدفعة) · loans-detail.js · loans-cards.js · loans-views.js (الإحصاءات/الفلاتر/القائمة).
   التواصل عبر ctx صريح { state, refresh, openForm } (لا EventBus، لا استيراد دائري). الوحدات لا تستورد هذا الملف.
   الواجهة العامة كما كانت: loansPage.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { getLoansWithPayments, getLoansStats } from '../services/loans-calculator.js';
import { openLoanForm } from './loans-forms.js';
import { renderStats, renderFilters, renderList } from './loans-views.js';

/* --- الحالة --- */
/* كائن واحد ثابت طوال عمر الوحدة: destroy يصفّره في مكانه (لا إعادة إسناد) فلا يبقى أي مرجع قديم في الوحدات. */
const state = {
  container: null,
  loans: [],
  stats: null,
  activeFilter: 'all',
  searchQuery: '',
};

/* السياق الصريح الذي تستلمه الوحدات: الحالة + إعادة التحميل/الرسم + فتح نموذج القرض. */
const ctx = {
  state,
  refresh: () => refreshAll(),
  openForm: (loan) => openLoanForm(ctx, loan),
};

/** تصفير الحالة في المكان (يطابق الشكل الذي كان destroy ينشئه سابقاً). */
function resetLoansState(s) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    container: null,
    loans: [],
    stats: null,
    activeFilter: 'all',
    searchQuery: '',
  });
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [loans, stats] = await Promise.all([
    getLoansWithPayments(),
    getLoansStats(),
  ]);
  state.loans = loans;
  state.stats = stats;
}

async function refreshAll() {
  try {
    await loadData();
    renderStats(ctx);
    renderFilters(ctx);
    renderList(ctx);
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   8. API
   ========================================================================== */

export const loansPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '💵 القروض'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'قروض ليّ وعليّ'),
    ]));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'loans-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر إضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => ctx.openForm(),
    }, '➕ إضافة قرض'));

    /* بحث */
    const searchInput = el('input', {
      className: 'input', type: 'search',
      placeholder: '🔍 ابحث بالاسم أو الهاتف...',
      style: { marginBottom: '8px' },
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList(ctx);
    });
    container.appendChild(searchInput);

    /* فلاتر */
    container.appendChild(el('div', {
      id: 'loans-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* قائمة */
    container.appendChild(el('div', { id: 'loans-list' }));

    await refreshAll();
  },

  destroy() {
    resetLoansState(state);
  },
};
