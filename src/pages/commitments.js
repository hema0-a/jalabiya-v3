/* ==========================================================================
   commitments.js — صفحة المالية الشخصية (الالتزامات + أهداف الادخار)
   ==========================================================================
   - تبويبان: الالتزامات / أهداف الادخار.
   - 8 تصنيفات + 6 دوريات.
   - 4 بطاقات إحصائية + صحة الالتزامات + تنبيهات ذكية.
   - معاينة سريعة (previewCommitment + previewGoal).

   v3.5.10: تقسيم صيانة بلا تغيير سلوك (909 أسطر ← مدخل + 6 وحدات):
     commitments-logic.js (ألوان + فلترة نقية) · commitments-load.js (loadData)
     · commitments-forms.js (نماذج الالتزام/الدفعة/الهدف/الإيداع) · commitments-actions.js (حذف/تفاصيل/معاينات)
     · commitments-cards.js (البطاقتان) · commitments-views.js (التبويبات والإحصاءات والصحة والتنبيهات والقوائم والصفحة).
   التواصل عبر ctx صريح { state, refresh, openCommitmentForm, openGoalForm } (لا EventBus، لا استيراد دائري).
   الوحدات لا تستورد هذا الملف. الواجهة العامة كما كانت: commitmentsPage.
   ========================================================================== */

import { clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { loadData } from './commitments-load.js';
import { openCommitmentForm, openGoalForm } from './commitments-forms.js';
import { renderPage } from './commitments-views.js';

/* --- الحالة --- */
/* كائن واحد ثابت طوال عمر الوحدة: destroy يصفّره في مكانه (لا إعادة إسناد) فلا يبقى أي مرجع قديم في الوحدات. */
const state = {
  container: null,
  activeTab: 'commitments',
  activeCategory: 'all',
  searchQuery: '',
  stats: null,
  withPayments: [],
  goals: [],
};

/* السياق الصريح الذي تستلمه الوحدات: الحالة + إعادة التحميل/الرسم + فتح نموذجَي الالتزام والهدف. */
const ctx = {
  state,
  refresh: () => refreshAll(),
  openCommitmentForm: (c) => openCommitmentForm(ctx, c),
  openGoalForm: (g) => openGoalForm(ctx, g),
};

/** تصفير الحالة في المكان (يطابق الشكل الذي كان destroy ينشئه سابقاً). */
function resetCommitmentsState(s) {
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    container: null,
    activeTab: 'commitments',
    activeCategory: 'all',
    searchQuery: '',
    stats: null,
    withPayments: [],
    goals: [],
  });
}

/* ==========================================================================
   1. تحميل + تحديث
   ========================================================================== */

async function refreshAll() {
  try {
    await loadData(state);
    renderPage(ctx);
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   2. API
   ========================================================================== */

export const commitmentsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeTab = 'commitments';
    state.activeCategory = 'all';
    state.searchQuery = '';
    await refreshAll();
  },

  destroy() {
    resetCommitmentsState(state);
  },
};
