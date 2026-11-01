/* ==========================================================================
   referrals.js — صفحة الإحالات
   ==========================================================================
   - 3 بطاقات إحصائية (الكل / معلقة / مدفوعة).
   - بحث + فلترة بالحالة.
   - CRUD كامل.
   - زر واتساب للمُرشَّح.
   - [v3.5.22] نسبة المكافأة الافتراضية (settings.referrals.rewardPercent): تُقترح مكافأة = النسبة × أول طلب
     مُسلَّم للمُرشَّح، ويعتمدها المستخدم بزر (لا تُكتب تلقائياً).
   - [v3.3.45] مكافآت تلقائية: عند تسليم أول طلب للعميل المُحال تظهر الإحالة «🎁 جاهزة
     للمكافأة» وزر «شكر + مكافأة» يفتح واتساب برسالة للمُرشِّح (قالب قابل للتخصيص).
   [v3.5.25] قُسِّمت الصفحة دون تغيير سلوك (على نمط orders*.js):
     referrals.js        — الحالة + تحميل البيانات + الواجهة العامة (هذا الملف)
     referrals-form.js   — نموذج الإحالة + نموذج نسبة المكافأة
     referrals-card.js   — بطاقة الإحالة وإجراءاتها (حذف/دفع/اعتماد/شكر)
     referrals-list.js   — الإحصائيات وبطاقة النسبة والفلاتر والقائمة
   الوحدات تستلم ctx = { state, refresh, renderList } ولا تستورد هذا الملف.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { toast } from '../ui/toast.js';
import { referrals } from '../data/repos/referrals.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { settings } from '../data/repos/settings.js';
import { computeReferralRewards } from '../services/referral-rewards.js';
import { openReferralForm } from './referrals-form.js';
import { renderStats, renderPercentCard, renderFilters, renderList } from './referrals-list.js';

/* --- الحالة (كائن واحد ثابت الهوية؛ يُعاد ضبطه في destroy) --- */
const state = {
  container: null,
  items: [],
  stats: null,
  activeFilter: 'all',
  searchQuery: '',
  rewards: new Map(),
  settings: null,
};

const ctx = { state, refresh: refreshAll, renderList: () => renderList(ctx) };

/* ==========================================================================
   1. تحميل البيانات
   ========================================================================== */

async function loadData() {
  const [items, stats, custs, ords, st] = await Promise.all([
    referrals.list(),
    referrals.getStats(),
    customers.list().catch(() => []),
    orders.list().catch(() => []),
    settings.get().catch(() => ({})),
  ]);
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.items = items;
  state.stats = stats;
  state.settings = st || {};
  /* ربط الإحالات بالعملاء وأول طلب مُسلَّم: referralId → {state, referrer, referred, ...} */
  state.rewards = new Map(computeReferralRewards(items, custs, ords).map((x) => [x.referral.id, x]));
}

async function refreshAll() {
  try {
    await loadData();
    renderStats(ctx);
    renderPercentCard(ctx);
    renderFilters(ctx);
    renderList(ctx);
  } catch (e) {
    toast.danger('فشل التحميل: ' + e.message);
    console.error(e);
  }
}

/* ==========================================================================
   6. API
   ========================================================================== */

export const referralsPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.activeFilter = 'all';
    state.searchQuery = '';

    /* رأس الصفحة */
    container.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '🤝 الإحالات'),
      el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'تتبّع إحالات العملاء ومكافآتهم'),
    ]));

    /* بطاقات الإحصائية */
    container.appendChild(el('div', {
      id: 'ref-stats',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginBottom: '16px',
      },
    }));

    /* زر إضافة */
    container.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => openReferralForm(ctx),
    }, '➕ إضافة إحالة'));

    /* نسبة المكافأة الافتراضية */
    container.appendChild(el('div', { id: 'ref-percent' }));

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
      id: 'ref-filters',
      style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px' },
    }));

    /* قائمة */
    container.appendChild(el('div', { id: 'ref-list' }));

    await refreshAll();
  },

  destroy() {
    Object.assign(state, {
      container: null,
      items: [],
      stats: null,
      activeFilter: 'all',
      searchQuery: '',
      rewards: new Map(),
      settings: null,
    });
  },
};
