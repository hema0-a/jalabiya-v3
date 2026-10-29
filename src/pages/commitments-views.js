/* ==========================================================================
   commitments-views.js — رسم صفحة المالية الشخصية (v3.5.10)
   ==========================================================================
   renderTabs · renderStats · renderHealth · renderAlerts · renderSearchBox
   · renderCategoryFilters · renderCommitmentsList · renderGoalsList · renderPage
   كلها تستلم ctx. لا تستورد المدخل.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { getHealthScore, getSmartAlerts } from '../services/commitments-calculator.js';
import { COMMITMENT_CATEGORIES } from '../core/config.js';
import { formatEGP, normalizeSearch } from '../core/utils.js';
import { filterCommitments, filterGoals } from './commitments-logic.js';
import { buildCommitmentCard, buildGoalCard } from './commitments-cards.js';

/* ==========================================================================
   1. التبويبات
   ========================================================================== */

export function renderTabs(ctx) {
  const state = ctx.state;
  const wrap = el('div', {
    role: 'tablist',
    'aria-label': 'الأقسام',
    style: { display: 'flex', gap: '4px', marginBottom: '16px', background: '#F6F1E6', padding: '4px', borderRadius: '10px' },
  });

  const tabs = [
    { id: 'commitments', icon: '📋', label: 'الالتزامات' },
    { id: 'goals',       icon: '🏦', label: 'أهداف الادخار' },
  ];

  tabs.forEach((t) => {
    const active = state.activeTab === t.id;
    wrap.appendChild(el('button', {
      type: 'button', role: 'tab',
      'aria-selected': String(active),
      className: 'btn ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { flex: '1' },
      onClick: () => {
        state.activeTab = t.id;
        ctx.refresh();
      },
    }, t.icon + ' ' + t.label));
  });

  return wrap;
}

/* ==========================================================================
   2. بطاقات الإحصائية
   ========================================================================== */

export function renderStats(ctx) {
  const state = ctx.state;
  const s = state.stats;
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' },
  });

  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value', style: { fontSize: '16px' } }, formatEGP(s.totalMonthlyExpected)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#2E7D32' } }, formatEGP(s.totalPaidThisMonth)),
    el('span', { className: 'stat__label' }, 'مدفوع'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏳'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: '#F57C00' } }, formatEGP(s.totalRemaining)),
    el('span', { className: 'stat__label' }, 'متبقي'),
  ]));
  grid.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⚠️'),
    el('span', { className: 'stat__value', style: { fontSize: '16px', color: s.overdueCount > 0 ? '#C62828' : '#666' } }, String(s.overdueCount)),
    el('span', { className: 'stat__label' }, 'متأخر'),
  ]));

  return grid;
}

/* ==========================================================================
   3. صحة الالتزامات
   ========================================================================== */

export function renderHealth(ctx) {
  const state = ctx.state;
  const h = getHealthScore(state.stats);
  const color = h.score >= 80 ? '#2E7D32' : h.score >= 60 ? '#2E8B6F' : h.score >= 40 ? '#F57C00' : '#C62828';
  const stars = '⭐'.repeat(h.stars) + '☆'.repeat(5 - h.stars);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '12px', background: 'linear-gradient(135deg, #FFFFFF, #F9F5EC)' },
  });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '🎯 صحة الالتزامات'),
    el('span', { style: { fontSize: '13px', color, fontWeight: '600' } }, stars),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  }, [
    el('span', { style: { fontSize: '22px', fontWeight: '700', color } }, h.score + ' / 100'),
    el('span', { style: { fontSize: '13px', color: '#666' } }, h.level),
  ]));

  card.appendChild(el('div', {
    style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden' },
  }, [
    el('div', { style: { width: h.score + '%', height: '100%', background: color, transition: 'width 0.5s' } }),
  ]));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '12px', justifyContent: 'space-around', marginTop: '10px', fontSize: '12px' },
  }, [
    el('span', {}, '✅ ' + state.stats.paidCount + ' مدفوع'),
    el('span', {}, '⏳ ' + state.stats.pendingCount + ' متبقي'),
    el('span', { style: { color: state.stats.overdueCount > 0 ? '#C62828' : '#666' } }, '⚠️ ' + state.stats.overdueCount + ' متأخر'),
  ]));

  return card;
}

/* ==========================================================================
   4. التنبيهات الذكية
   ========================================================================== */

export function renderAlerts(ctx) {
  const state = ctx.state;
  const alerts = getSmartAlerts(state.stats, state.withPayments);
  if (alerts.length === 0) return null;

  const colors = {
    critical: { bg: '#FFEBEE', border: '#C62828' },
    warning:  { bg: '#FFF3E0', border: '#F57C00' },
    success:  { bg: '#E8F5E9', border: '#2E7D32' },
    info:     { bg: '#E3F2FD', border: '#1565C0' },
  };

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '12px', padding: '10px' },
  });
  card.appendChild(el('h3', {
    style: { fontSize: '14px', color: '#123C2F', margin: '0 0 8px 0', fontWeight: '600' },
  }, '⚠️ تنبيهات ذكية'));

  alerts.forEach((a) => {
    const c = colors[a.type] || colors.info;
    card.appendChild(el('div', {
      style: {
        padding: '6px 10px', background: c.bg,
        borderRight: '3px solid ' + c.border,
        borderRadius: '6px', marginBottom: '4px',
        fontSize: '12px', lineHeight: '1.5',
      },
    }, a.icon + ' ' + a.text));
  });

  return card;
}

/* ==========================================================================
   5. البحث + الفلترة
   ========================================================================== */

export function renderSearchBox(ctx) {
  const state = ctx.state;
  const inp = el('input', {
    className: 'input', type: 'search',
    placeholder: '🔍 ابحث بالاسم...',
    style: { marginBottom: '8px' },
  });
  inp.addEventListener('input', () => {
    state.searchQuery = inp.value;
    if (state.activeTab === 'commitments') renderCommitmentsList(ctx);
    else renderGoalsList(ctx);
  });
  return inp;
}

export function renderCategoryFilters(ctx) {
  const state = ctx.state;
  const wrap = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', marginBottom: '12px', gap: '2px' },
  });
  const all = [{ id: 'all', label: 'الكل', icon: '📁' }, ...COMMITMENT_CATEGORIES];
  all.forEach((c) => {
    const active = state.activeCategory === c.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--ghost'),
      style: { marginBottom: '2px' },
      onClick: () => {
        state.activeCategory = c.id;
        ctx.refresh();
      },
    }, c.icon + ' ' + c.label));
  });
  return wrap;
}

/* ==========================================================================
   6. رسم قائمة الالتزامات
   ========================================================================== */

export function renderCommitmentsList(ctx) {
  const state = ctx.state;
  const wrap = state.container?.querySelector('#cm-list');
  if (!wrap) return;
  clear(wrap);

  const q = normalizeSearch(state.searchQuery);
  const list = filterCommitments(state.withPayments, state.activeCategory, q);

  if (list.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '💳'),
      el('h2', { className: 'empty-state__title' }, q ? 'لا نتائج' : 'لا توجد التزامات'),
      el('p', { className: 'empty-state__text' }, q ? 'جرّب كلمة أخرى' : 'اضغط "إضافة التزام" للبدء'),
    ]));
    return;
  }

  list.forEach((c) => wrap.appendChild(buildCommitmentCard(ctx, c)));
}

/* ==========================================================================
   7. رسم قائمة الأهداف
   ========================================================================== */

export function renderGoalsList(ctx) {
  const state = ctx.state;
  const wrap = state.container?.querySelector('#cm-list');
  if (!wrap) return;
  clear(wrap);

  const q = normalizeSearch(state.searchQuery);
  const list = filterGoals(state.goals, q);

  if (list.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '🏦'),
      el('h2', { className: 'empty-state__title' }, q ? 'لا نتائج' : 'لا توجد أهداف ادخار'),
      el('p', { className: 'empty-state__text' }, q ? 'جرّب كلمة أخرى' : 'اضغط "إضافة هدف" للبدء'),
    ]));
    return;
  }

  list.forEach((g) => wrap.appendChild(buildGoalCard(ctx, g)));
}

/* ==========================================================================
   8. الصفحة الرئيسية
   ========================================================================== */

export function renderPage(ctx) {
  const state = ctx.state;
  const c = state.container;
  if (!c) return;
  clear(c);

  c.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '💳 المالية الشخصية'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'الالتزامات الشهرية وأهداف الادخار'),
  ]));

  if (!state.stats.hasData) {
    c.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, '💳'),
      el('h2', { className: 'empty-state__title' }, 'لا توجد بيانات'),
      el('p', { className: 'empty-state__text' }, 'ابدأ بإضافة أول التزام أو هدف ادخار'),
    ]));
    c.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginTop: '12px' },
      onClick: () => ctx.openCommitmentForm(),
    }, '➕ إضافة التزام'));
    return;
  }

  c.appendChild(renderTabs(ctx));

  if (state.activeTab === 'commitments') {
    c.appendChild(renderStats(ctx));
    c.appendChild(renderHealth(ctx));
    const alerts = renderAlerts(ctx);
    if (alerts) c.appendChild(alerts);

    c.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => ctx.openCommitmentForm(),
    }, '➕ إضافة التزام'));

    c.appendChild(renderSearchBox(ctx));
    c.appendChild(renderCategoryFilters(ctx));

    c.appendChild(el('div', { id: 'cm-list' }));
    renderCommitmentsList(ctx);
  }
  else {
    c.appendChild(el('button', {
      className: 'btn btn--primary btn--block', type: 'button',
      style: { marginBottom: '12px' },
      onClick: () => ctx.openGoalForm(),
    }, '➕ إضافة هدف'));

    if (state.stats.goalsCount > 0) {
      c.appendChild(el('div', {
        className: 'card', style: { marginBottom: '12px' },
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' } }, [
          el('span', { style: { fontWeight: '600', color: '#123C2F' } }, '🏦 إجمالي الأهداف'),
          el('span', { style: { color: '#2E8B6F' } }, state.stats.goalsCount + ' هدف'),
        ]),
        el('div', {
          style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' },
        }, [
          el('span', {}, 'المجموع: ' + formatEGP(state.stats.totalGoalCurrent)),
          el('span', {}, 'الهدف: ' + formatEGP(state.stats.totalGoalTarget)),
        ]),
      ]));
    }

    c.appendChild(renderSearchBox(ctx));
    c.appendChild(el('div', { id: 'cm-list' }));
    renderGoalsList(ctx);
  }
}
