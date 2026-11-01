/* ==========================================================================
   payments-list.js — إحصائيات وفلاتر وقائمة الدفعات (v3.5.24: مفصول عن payments.js)
   ==========================================================================
   API: renderStats(ctx) · renderFilters(ctx) · renderList(ctx) · disposePaymentsList()
   ctx = { state, refresh }. لا يستورد payments.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP, normalizeSearch } from '../core/utils.js';
import { withDepositPayments, computeRefundsDue } from '../services/payments-view.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { buildPaymentCard } from './payments-card.js';

/* قائمة تدريجية: 30 دفعة ثم المزيد عند التمرير (كانت ترسم الكل: 72 ألف عنصر DOM عند 6000 دفعة) */
let paymentsList = null;
export function disposePaymentsList() {
  if (paymentsList) { try { paymentsList.destroy(); } catch (e) { /* ignore */ } paymentsList = null; }
}

export function renderStats(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#payments-stats');
  if (!wrap) return;
  clear(wrap);

  /* دفعات الطلبات الملغاة ليست إيراداً (تُردّ للعميل): تُستبعد من الإجمالي كي يطابق اللوحة والتقارير */
  const cancelledIds = new Set(state.orders.filter((o) => o && o.status === 'cancelled').map((o) => o.id));
  const live = state.payments.filter((p) => !(p.orderId && cancelledIds.has(p.orderId)));
  const total = live.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthTotal = live
    .filter((p) => (p.createdAt || 0) >= monthStart.getTime())
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const linked = live.filter((p) => p.orderId).length;
  const refundsDue = computeRefundsDue(state.orders, state.payments).total;

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, formatEGP(total)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📅'),
    el('span', { className: 'stat__value', style: { fontSize: '18px' } }, formatEGP(monthTotal)),
    el('span', { className: 'stat__label' }, 'هذا الشهر'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '🔗'),
    el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#1F6D57' } }, String(linked)),
    el('span', { className: 'stat__label' }, 'مرتبطة بطلب'),
  ]));

  if (refundsDue > 0) {
    wrap.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '💸'),
      el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#C62828' } }, formatEGP(refundsDue)),
      el('span', { className: 'stat__label' }, 'تُردّ للعملاء (طلبات ملغاة)'),
    ]));
  }

  /* المقدمات المقبوضة في الطلبات ولم تُسجَّل كدفعات: تُحتسب في الإيرادات (اللوحة/التقارير)
     فنعرضها هنا حتى لا يختلف إجمالي هذه الصفحة عن بقية الصفحات بلا تفسير. */
  const deposits = withDepositPayments(state.payments, state.orders)
    .filter((p) => p && p.synthetic)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (deposits > 0) {
    wrap.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '🧾'),
      el('span', { className: 'stat__value', style: { fontSize: '18px', color: '#B8863B' } }, formatEGP(deposits)),
      el('span', { className: 'stat__label' }, 'مقدمات طلبات (خارج الإجمالي)'),
    ]));
  }
}

export function renderFilters(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#payments-filters');
  if (!wrap) return;
  clear(wrap);

  const items = [
    { id: 'all',           label: '🎯 الكل',           count: state.payments.length },
    { id: 'with-order',    label: '🔗 لها طلب',        count: state.payments.filter((p) => p.orderId).length },
    { id: 'without-order', label: '⭕ بدون طلب',       count: state.payments.filter((p) => !p.orderId).length },
  ];

  items.forEach((it) => {
    const isActive = state.activeFilter === it.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
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
  let list = state.payments;

  if (state.activeFilter === 'with-order') {
    list = list.filter((p) => p.orderId);
  } else if (state.activeFilter === 'without-order') {
    list = list.filter((p) => !p.orderId);
  }

  const q = normalizeSearch(state.searchQuery);
  if (q) {
    list = list.filter((p) => {
      const c = state.customerMap[p.customerId];
      const name = c ? normalizeSearch(c.name) : '';
      const notes = normalizeSearch(p.notes);
      return name.includes(q) || notes.includes(q);
    });
  }

  return list;
}

export function renderList(ctx) {
  const { state } = ctx;
  const lc = state.container?.querySelector('#payments-list');
  if (!lc) return;
  disposePaymentsList();
  clear(lc);

  const filtered = applyFilters(state);

  if (filtered.length === 0) {
    const isSearching = state.searchQuery.trim() !== '';
    const isFiltered = state.activeFilter !== 'all';
    lc.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state__icon' }, isSearching ? '🔍' : '💰'),
      el('h2', { className: 'empty-state__title' },
        isSearching ? 'لا نتائج' :
        (isFiltered ? 'لا توجد دفعات في هذا التصنيف' : 'لا توجد دفعات')),
      el('p', { className: 'empty-state__text' },
        isSearching ? 'جرّب كلمة أخرى' : 'اضغط "إضافة دفعة" للبدء'),
    ]));
    return;
  }

  paymentsList = createProgressiveList({
    items: filtered,
    pageSize: 30,
    render: (p) => buildPaymentCard(ctx, p),
  });
  lc.appendChild(paymentsList.node);
}
