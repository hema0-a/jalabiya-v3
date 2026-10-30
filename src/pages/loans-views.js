/* ==========================================================================
   loans-views.js — رسم صفحة القروض: الإحصاءات · الفلاتر · القائمة (v3.5.11)
   ==========================================================================
   renderStats · renderFilters · renderList — كلها (ctx) ومنقولة حرفياً.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP } from '../core/utils.js';
import { applyFilters } from './loans-logic.js';
import { buildLoanCard } from './loans-cards.js';

/* ==========================================================================
   7. الرسم
   ========================================================================== */

export function renderStats(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#loans-stats');
  if (!wrap) return;
  clear(wrap);

  const s = state.stats;

  wrap.appendChild(el('div', {
    className: 'stat',
    style: { borderTop: '3px solid #2E7D32' },
  }, [
    el('span', { className: 'stat__icon' }, '📤'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#2E7D32' } },
      formatEGP(s.given.remaining)),
    el('span', { className: 'stat__label' }, 'ليّ (مستحق) — ' + s.given.count),
  ]));

  wrap.appendChild(el('div', {
    className: 'stat',
    style: { borderTop: '3px solid #C62828' },
  }, [
    el('span', { className: 'stat__icon' }, '📥'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#C62828' } },
      formatEGP(s.received.remaining)),
    el('span', { className: 'stat__label' }, 'عليّ (التزام) — ' + s.received.count),
  ]));

  /* صافي الرصيد */
  const net = s.netBalance;
  const netColor = net > 0 ? '#2E7D32' : net < 0 ? '#C62828' : '#666';
  const netLabel = net > 0 ? 'لصالحك ✅' : net < 0 ? 'عليك ❌' : 'متوازن';

  wrap.appendChild(el('div', {
    className: 'stat',
    style: { borderTop: '3px solid ' + netColor, gridColumn: '1 / -1' },
  }, [
    el('span', { className: 'stat__icon' }, '⚖️'),
    el('span', { className: 'stat__value', style: { fontSize: '20px', color: netColor } },
      formatEGP(Math.abs(net))),
    el('span', { className: 'stat__label' }, 'صافي الرصيد — ' + netLabel),
  ]));
}

export function renderFilters(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#loans-filters');
  if (!wrap) return;
  clear(wrap);

  const items = [
    { id: 'all',      label: '🎯 الكل',   count: state.loans.length },
    { id: 'given',    label: '📤 ليّ',    count: state.stats.given.count },
    { id: 'received', label: '📥 عليّ',   count: state.stats.received.count },
  ];

  items.forEach((it) => {
    const active = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      'data-filter': it.id,
      style: { marginInlineEnd: '4px', marginBottom: '4px' },
      onClick: () => {
        state.activeFilter = it.id;
        renderFilters(ctx);
        renderList(ctx);
      },
    }, it.label + ' (' + it.count + ')'));
  });
}

export function renderList(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#loans-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters(state);

  if (list.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '💵'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا توجد قروض'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة قرض" للبدء'),
    ]));
    return;
  }

  list.forEach((l) => wrap.appendChild(buildLoanCard(ctx, l)));
}
