/* ==========================================================================
   workers-views.js — رسم صفحة العمال: الإحصاءات · التبويبات · الفلاتر · القائمة (v3.5.9)
   ==========================================================================
   كل الدوال تستلم ctx صريح { state, refresh, openForm } (لا حالة خاصة بالوحدة).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { workers } from '../data/repos/workers.js';
import { formatEGP, normalizeSearch } from '../core/utils.js';
import { filterWorkers } from './workers-logic.js';
import { buildWorkerCard, buildPaymentRow } from './workers-cards.js';

/* ==========================================================================
   9. الرسم
   ========================================================================== */

export function renderStats(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#workers-stats');
  if (!wrap) return;
  clear(wrap);

  const total = state.workers.length;
  const active = state.workers.filter((w) => w.active !== false).length;
  const fixedTotal = state.workers
    .filter((w) => w.active !== false && w.salaryType === 'fixed')
    .reduce((s, w) => s + (Number(w.salary) || 0), 0);

  /* مدفوع هذا الشهر */
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const paidThisMonth = state.payments
    .filter((p) => p.date && p.date >= start && p.date < end)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '👷'),
    el('span', { className: 'stat__value', style: { fontSize: '16px' } }, String(total)),
    el('span', { className: 'stat__label' }, 'إجمالي (' + active + ' نشط)'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#B8863B' } },
      formatEGP(fixedTotal)),
    el('span', { className: 'stat__label' }, 'رواتب ثابتة / شهر'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💵'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#2E7D32' } },
      formatEGP(paidThisMonth)),
    el('span', { className: 'stat__label' }, 'مدفوع هذا الشهر'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📜'),
    el('span', { className: 'stat__value', style: { fontSize: '16px' } },
      String(state.payments.length)),
    el('span', { className: 'stat__label' }, 'عدد الدفعات'),
  ]));
}

function renderTabs(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#workers-tabs');
  if (!wrap) return;
  clear(wrap);

  const tabs = [
    { id: 'workers',  icon: '👷', label: 'العمال' },
    { id: 'payments', icon: '💵', label: 'الدفعات' },
  ];

  tabs.forEach((t) => {
    const active = state.activeTab === t.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => {
        state.activeTab = t.id;
        state.activeFilter = 'all';
        state.searchQuery = '';
        renderPage(ctx);
      },
    }, t.icon + ' ' + t.label));
  });
}

function renderFilters(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#workers-filters');
  if (!wrap) return;
  clear(wrap);

  if (state.activeTab !== 'workers') return;

  const items = [
    { id: 'all',      label: 'الكل' },
    { id: 'active',   label: 'نشط' },
    { id: 'inactive', label: 'معطَّل' },
  ];
  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters(ctx);
        renderList(ctx);
      },
    }, it.label));
  });
}

function applySearch(state, list) {
  const q = normalizeSearch(state.searchQuery);
  if (!q) return list;
  return list.filter((x) => normalizeSearch(x.name).includes(q));
}

export function renderList(ctx) {
  const { state } = ctx;
  const lc = state.container?.querySelector('#workers-list');
  if (!lc) return;
  clear(lc);

  if (state.activeTab === 'payments') {
    const filtered = applySearch(state, state.payments.map((p) => ({
      ...p,
      name: (state.workers.find((w) => w.id === p.workerId) || {}).name || '',
    })));

    if (filtered.length === 0) {
      lc.appendChild(el('div', { className: 'empty-state' }, [
        el('div', { className: 'empty-state__icon' }, '💵'),
        el('h2', { className: 'empty-state__title' }, 'لا توجد دفعات'),
        el('p', { className: 'empty-state__text' }, 'ستظهر الدفعات هنا'),
      ]));
      return;
    }
    filtered.forEach((p) => lc.appendChild(buildPaymentRow(ctx, p)));
    return;
  }

  /* وضع العمال */
  let list = filterWorkers(state.workers, state.activeFilter);
  list = applySearch(state, list);

  if (list.length === 0) {
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '👷'),
      el('h2', { className: 'empty-state__title' }, 'لا يوجد عمال'),
      el('p', { className: 'empty-state__text' }, 'اضغط "إضافة عامل" للبدء'),
    ]));
    return;
  }
  list.forEach((w) => lc.appendChild(buildWorkerCard(ctx, w)));
}

export function renderPage(ctx) {
  const { state } = ctx;
  const c = state.container;
  if (!c) return;

  /* مسح العناصر الديناميكية فقط */
  const stats = c.querySelector('#workers-stats');
  const tabs = c.querySelector('#workers-tabs');
  const search = c.querySelector('#workers-search');
  const addBtn = c.querySelector('#workers-add-btn');
  const filters = c.querySelector('#workers-filters');

  /* إعادة الرسم الكامل للتبويب النشط */
  if (stats) { clear(stats); renderStats(ctx); }
  if (tabs) { clear(tabs); renderTabs(ctx); }
  if (filters) { clear(filters); renderFilters(ctx); }

  /* إظهار/إخفاء العناصر حسب التبويب */
  if (search) search.style.display = state.activeTab === 'workers' ? '' : 'none';
  if (addBtn) addBtn.style.display = state.activeTab === 'workers' ? '' : 'none';
  if (filters) filters.style.display = state.activeTab === 'workers' ? '' : 'none';

  renderList(ctx);
}
