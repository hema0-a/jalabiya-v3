/* ==========================================================================
   workers.js — صفحة العمال (CRUD + نوع أجر + سجل الدفعات)
   ==========================================================================
   - نوع أجر: ثابت / بالقطعة / يومي / ساعي.
   - تبويبان: العمال / الدفعات.
   - إحصائيات: عمال نشط + رواتب ثابتة شهرية + مدفوع هذا الشهر.
   - Quick Preview + واتساب.

   v3.5.9: تقسيم صيانة بلا تغيير سلوك (794 سطراً ← مدخل + 6 وحدات):
     workers-logic.js (ثوابت ومنطق نقي) · workers-forms.js (نموذج العامل/الدفعة) · workers-detail.js (التفاصيل)
     · workers-actions.js (حذف/تفعيل/حذف دفعة) · workers-cards.js (البطاقة وصف الدفعة) · workers-views.js (الإحصاءات والتبويبات والفلاتر والقائمة).
   التواصل عبر ctx صريح { state, refresh, openForm } (لا EventBus، لا استيراد دائري). الوحدات لا تستورد هذا الملف.
   الواجهة العامة كما كانت: workersPage · filterWorkers.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { workers } from '../data/repos/workers.js';
import { workerPayments } from '../data/repos/worker-payments.js';
import { toast } from '../ui/toast.js';
import { openWorkerForm } from './workers-forms.js';
import { renderPage, renderList } from './workers-views.js';

/* --- إعادة تصدير الواجهة العامة (نفس الاسم والتوقيع) --- */
export { filterWorkers } from './workers-logic.js';

/* --- الحالة --- */
/* كائن واحد ثابت طوال عمر الوحدة: destroy يصفّره في مكانه (لا إعادة إسناد) فلا يبقى أي مرجع قديم في الوحدات. */
const state = {
  container: null,
  workers: [],
  payments: [],
  activeTab: 'workers',       // 'workers' | 'payments'
  activeFilter: 'all',
  searchQuery: '',
};

/* السياق الصريح الذي تستلمه الوحدات: الحالة + إعادة التحميل/الرسم + فتح نموذج العامل. */
const ctx = {
  state,
  refresh: () => refreshAll(),
  openForm: (worker) => openWorkerForm(ctx, worker),
};

/** تصفير الحالة في المكان (يطابق الشكل الذي كان destroy ينشئه سابقاً). */
function resetWorkersState(s) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    container: null,
    workers: [],
    payments: [],
    activeTab: 'workers',
    activeFilter: 'all',
    searchQuery: '',
  });
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [wList, pList] = await Promise.all([
    workers.list(),
    workerPayments.list(),
  ]);
  wList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  pList.sort((a, b) => (b.date || 0) - (a.date || 0));
  state.workers = wList;
  state.payments = pList;
}

async function refreshAll() {
  try {
    await loadData();
    renderPage(ctx);
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   10. API
   ========================================================================== */

export const workersPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeTab = 'workers';
    state.activeFilter = 'all';
    state.searchQuery = '';

    container.appendChild(el('div', {
      id: 'workers-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    container.appendChild(el('div', {
      id: 'workers-tabs',
      style: {
        display: 'flex',
        gap: '4px',
        marginBottom: '12px',
        background: '#F6F1E6',
        padding: '4px',
        borderRadius: '10px',
      },
    }));

    const searchInput = el('input', {
      className: 'input',
      type: 'search',
      placeholder: '🔍 ابحث بالاسم...',
      style: { marginBottom: '8px' },
    });
    searchInput.id = 'workers-search';
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      renderList(ctx);
    });
    container.appendChild(searchInput);

    const addBtn = el('button', {
      className: 'btn btn--primary btn--block',
      style: { marginBottom: '12px' },
      onClick: () => ctx.openForm(),
    }, '➕ إضافة عامل');
    addBtn.id = 'workers-add-btn';
    container.appendChild(addBtn);

    container.appendChild(el('div', {
      id: 'workers-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    container.appendChild(el('div', { id: 'workers-list' }));

    await refreshAll();
  },

  destroy() {
    resetWorkersState(state);
  },
};
