/* ==========================================================================
   referrals-list.js — إحصائيات ونسبة المكافأة والفلاتر والقائمة (v3.5.25: مفصول عن referrals.js)
   ==========================================================================
   API: renderStats(ctx) · renderPercentCard(ctx) · renderFilters(ctx) · renderList(ctx)
   ctx = { state, refresh, renderList }. لا يستورد referrals.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP, normalizeSearch, phoneMatches } from '../core/utils.js';
import { buildReferralCard } from './referrals-card.js';
import { openRewardPercentForm, currentPercent } from './referrals-form.js';

/** عدد الإحالات الجاهزة للمكافأة. */
const dueCount = (state) => [...state.rewards.values()].filter((x) => x.state === 'due').length;

export function renderStats(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#ref-stats');
  if (!wrap) return;
  clear(wrap);

  const s = state.stats;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🤝'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, String(s.total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏳'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#F57C00' } },
      formatEGP(s.pending.amount)),
    el('span', { className: 'stat__label' }, 'معلقة — ' + s.pending.count),
  ]));

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#2E7D32' } },
      formatEGP(s.paid.amount)),
    el('span', { className: 'stat__label' }, 'مدفوعة — ' + s.paid.count),
  ]));
}

export function renderPercentCard(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#ref-percent');
  if (!wrap) return;
  clear(wrap);
  wrap.appendChild(el('div', {
    className: 'card',
    style: { padding: '10px 12px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  }, [
    el('div', { style: { fontSize: '13px', color: '#666' } }, [
      '📊 نسبة المكافأة الافتراضية: ',
      el('strong', { style: { color: '#1F6D57' } }, currentPercent(state) + '%'),
    ]),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'edit-percent',
      onClick: () => openRewardPercentForm(ctx),
    }, '✏️ تعديل النسبة'),
  ]));
}

export function renderFilters(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#ref-filters');
  if (!wrap) return;
  clear(wrap);

  const items = [
    { id: 'all',     label: '🎯 الكل',    count: state.stats.total },
    { id: 'due',     label: '🎁 جاهزة',   count: dueCount(state) },
    { id: 'pending', label: '⏳ معلقة',   count: state.stats.pending.count },
    { id: 'paid',    label: '✅ مدفوعة', count: state.stats.paid.count },
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

function applyFilters(state) {
  let list = state.items;
  if (state.activeFilter === 'due') {
    list = list.filter((r) => { const x = state.rewards.get(r.id); return !!x && x.state === 'due'; });
  } else if (state.activeFilter !== 'all') {
    list = list.filter((r) => (r.status || 'pending') === state.activeFilter);
  }
  const q = normalizeSearch(state.searchQuery);
  if (q) {
    list = list.filter((r) =>
      normalizeSearch(r.referrerName).includes(q) ||
      normalizeSearch(r.referredName).includes(q) ||
      phoneMatches(r.referredPhone, q)
    );
  }
  return list;
}

export function renderList(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#ref-list');
  if (!wrap) return;
  clear(wrap);

  const list = applyFilters(state);

  if (list.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '🤝'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' : 'لا توجد إحالات'),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة إحالة" للبدء'),
    ]));
    return;
  }

  list.forEach((r) => wrap.appendChild(buildReferralCard(ctx, r)));
}
