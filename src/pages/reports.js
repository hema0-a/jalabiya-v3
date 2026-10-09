/* ==========================================================================
   reports.js — صفحة التقارير (KPIs + رسوم بيانية بسيطة)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { expenses } from '../data/repos/expenses.js';
import { customers } from '../data/repos/customers.js';
import { formatEGP } from '../core/utils.js';
import { withDepositPayments } from '../services/payments-view.js';

let state = { container: null, activePeriod: 'month' };

/**
 * حساب بداية فترة.
 */
export function getPeriodStart(period) {
  const d = new Date();
  const day = 86400000;
  if (period === 'week') return Date.now() - 7 * day;
  if (period === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (period === 'year') { d.setMonth(0); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return 0;
}

/**
 * حساب الإيرادات والمصروفات والربح لفترة.
 */
export async function computeReport(period) {
  const start = getPeriodStart(period);
  const [rawPayList, expList, ordList, custList] = await Promise.all([
    payments.list(), expenses.list(), orders.list(), customers.list(),
  ]);
  const payList = withDepositPayments(rawPayList, ordList);
  const revenue = payList
    .filter((p) => (p.createdAt || 0) >= start)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const spent = expList
    .filter((e) => (e.date || 0) >= start)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const profit = revenue - spent;
  const ordersCount = ordList.filter((o) => (o.createdAt || 0) >= start).length;
  return {
    revenue, spent, profit, ordersCount,
    totalCustomers: custList.length,
    totalOrders: ordList.length,
  };
}

function buildKpiRow(report) {
  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' },
  });
  [
    { icon: '💰', value: formatEGP(report.revenue), label: 'الإيرادات' },
    { icon: '💸', value: formatEGP(report.spent), label: 'المصروفات' },
    { icon: report.profit >= 0 ? '📈' : '📉', value: formatEGP(report.profit), label: 'الربح' },
    { icon: '📦', value: String(report.ordersCount), label: 'طلبات الفترة' },
  ].forEach((it) => {
    grid.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, it.icon),
      el('span', { className: 'stat__value' }, it.value),
      el('span', { className: 'stat__label' }, it.label),
    ]));
  });
  return grid;
}

/**
 * رسم شريط بياني بسيط.
 */
function buildBar(label, value, maxValue, color) {
  const width = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 2;
  return el('div', { style: { marginBottom: '10px' } }, [
    el('div', {
      style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#123C2F', marginBottom: '4px' },
    }, [
      el('span', {}, label),
      el('span', { style: { fontWeight: '600' } }, formatEGP(value)),
    ]),
    el('div', {
      style: { background: '#E5DDD0', height: '8px', borderRadius: '4px', overflow: 'hidden' },
    }, [
      el('div', {
        style: {
          width: width + '%',
          height: '100%',
          background: color || 'linear-gradient(90deg, #2E8B6F, #1F6D57)',
          transition: 'width 0.4s ease',
        },
      }),
    ]),
  ]);
}

async function buildOrdersByStatus() {
  const all = await orders.list();
  const map = { pending: 0, in_progress: 0, ready: 0, delivered: 0, cancelled: 0 };
  all.forEach((o) => { if (map[o.status] != null) map[o.status]++; });
  const labels = {
    pending: 'قيد الانتظار',
    in_progress: 'قيد التنفيذ',
    ready: 'جاهز',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
  };
  const max = Math.max(1, ...Object.values(map));
  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📦 توزيع الطلبات'),
  ]));
  Object.entries(map).forEach(([k, v]) => {
    card.appendChild(buildBar(labels[k] + ' (' + v + ')', v, max, 'linear-gradient(90deg, #4FC3F7, #1565C0)'));
  });
  return card;
}

async function buildTopCustomers() {
  const allPayments = withDepositPayments(await payments.list(), await orders.list());
  const totals = {};
  allPayments.forEach((p) => {
    totals[p.customerId] = (totals[p.customerId] || 0) + (Number(p.amount) || 0);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const custList = await customers.list();
  const custMap = {};
  custList.forEach((c) => { custMap[c.id] = c; });

  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '⭐ أكثر العملاء دفعاً'),
  ]));

  if (sorted.length === 0) {
    card.appendChild(el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'لا توجد بيانات بعد.'));
    return card;
  }

  const max = sorted[0][1];
  sorted.forEach(([cid, total]) => {
    const c = custMap[cid];
    card.appendChild(buildBar(c ? c.name : 'عميل محذوف', total, max, 'linear-gradient(90deg, #D4A55C, #B8863B)'));
  });
  return card;
}

async function refreshAll() {
  const container = state.container;
  if (!container) return;
  clear(container);

  /* فلاتر الفترة */
  const filters = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px' } });
  [['week', 'الأسبوع'], ['month', 'هذا الشهر'], ['year', 'هذه السنة'], ['all', 'الكل']].forEach(([id, label]) => {
    const isActive = state.activePeriod === id;
    filters.appendChild(el('button', {
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      'data-filter': id,
      onClick: () => { state.activePeriod = id; refreshAll(); },
    }, label));
  });
  container.appendChild(filters);

  const report = await computeReport(state.activePeriod);
  container.appendChild(buildKpiRow(report));
  container.appendChild(await buildOrdersByStatus());
  container.appendChild(await buildTopCustomers());
}

export const reportsPage = {
  async render(container) {
    state.container = container;
    state.activePeriod = 'month';
    await refreshAll();
  },
  destroy() { state = { container: null, activePeriod: 'month' }; },
};
