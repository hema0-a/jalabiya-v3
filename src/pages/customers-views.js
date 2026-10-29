/* ==========================================================================
   customers-views.js — رسم صفحة العملاء: الإحصاءات · الفلاتر · الترتيب · القائمة (v3.5.8)
   ==========================================================================
   كل الدوال تستلم ctx صريح { state, refresh, openForm } (لا حالة خاصة بالوحدة).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { FILTERS, SORTS, applyFiltersAndSort } from './customers-logic.js';
import { buildCustomerCard } from './customers-cards.js';

/* ==========================================================================
   8. الرسم
   ========================================================================== */

export function renderStats(ctx) {
  const { state } = ctx;
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

function buildFilterBar(ctx) {
  const { state } = ctx;
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
        renderFilterBar(ctx);
        renderList(ctx);
      },
    }, f.icon + ' ' + f.label));
  });

  return wrap;
}

function buildSortBar(ctx) {
  const { state } = ctx;
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
        renderSortBar(ctx);
        renderList(ctx);
      },
    }, s.icon + ' ' + s.label));
  });

  return wrap;
}

export function renderFilterBar(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#customers-filters');
  if (!wrap) return;
  clear(wrap);
  wrap.appendChild(buildFilterBar(ctx));
}

export function renderSortBar(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#customers-sort');
  if (!wrap) return;
  clear(wrap);
  wrap.appendChild(buildSortBar(ctx));
}

function buildEmptyState(ctx) {
  const { state } = ctx;
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

export function renderList(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#customers-list');
  if (!wrap) return;

  const filtered = applyFiltersAndSort(state.customers, state);

  if (state.list) {
    state.list.setItems(filtered);
    return;
  }

  const list = createProgressiveList({
    items: filtered,
    pageSize: 20,
    render: (c) => buildCustomerCard(ctx, c),
    emptyState: () => buildEmptyState(ctx),
  });

  state.list = list;
  wrap.appendChild(list.node);
}
