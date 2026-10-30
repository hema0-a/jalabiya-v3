/* ==========================================================================
   orders-summary.js — شريط الحد اليومي والتنبيهات العاجلة والإحصاءات (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون تغيير منطق. كل دالة تستلم ctx وتقرأ ctx.state عند كل استدعاء (لا تحتفظ بمراجع).
   API: renderStats(ctx) · renderTopBanners(ctx) · buildDailyLimitBar(ctx) · buildUrgentAlerts(ctx)
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { getDayLoad } from '../services/order-scheduler.js';
import { isPastDue } from '../services/order-timing.js';
import { summarizeProfit } from '../services/order-profit.js';
import { DAY_MS } from './orders/logic.js';

/* ==========================================================================
   6. شريط الحد اليومي
   ========================================================================== */

export function buildDailyLimitBar(ctx) {
  const { state } = ctx;
  const limit = state.scheduleConfig.dailyOrderLimit || 0;
  if (limit <= 0) return null;

  /* نفس تعريف المجدول: حِمل اليوم = طلبات موعد تسليمها اليوم (يشمل المسلَّم لأنه استهلك سعة اليوم) */
  const load = getDayLoad(state.orders, Date.now(), { limit, dayOffWeekday: state.scheduleConfig.dayOffWeekday, includeDelivered: true });
  const todayTotal = load.amount;
  const percent = load.percent;
  const exceeded = load.exceeded;
  const near = load.near;
  const barColor = exceeded ? '#C62828' : (near ? '#F57C00' : '#2E7D32');
  const bgColor = exceeded ? '#FFEBEE' : (near ? '#FFF3E0' : '#E8F5E9');

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '16px', padding: '12px', background: bgColor, border: '1px solid ' + barColor + '33' },
  });

  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  }, [
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: barColor } },
      exceeded ? '🚨 تجاوزت الحد اليومي' : (near ? '⚠️ اقتربت من الحد اليومي' : '📊 حِمل تسليم اليوم')),
    el('div', { style: { fontSize: '13px', fontWeight: '700', color: barColor } },
      formatEGP(todayTotal) + ' / ' + formatEGP(limit)),
  ]));

  card.appendChild(el('div', {
    style: { background: 'rgba(0,0,0,0.08)', height: '10px', borderRadius: '5px', overflow: 'hidden' },
  }, [
    el('div', { style: { width: percent + '%', height: '100%', background: barColor, transition: 'width 0.4s' } }),
  ]));

  card.appendChild(el('div', {
    style: { fontSize: '11px', color: '#666', marginTop: '4px', textAlign: 'left' },
  }, percent + '%'));

  return card;
}

/* ==========================================================================
   7. بطاقة التنبيهات العاجلة
   ========================================================================== */

export function buildUrgentAlerts(ctx) {
  const { state } = ctx;
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const overdue = state.orders.filter((o) =>
    isPastDue(o.dueDate, now) &&
    o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const needPickup = state.orders.filter((o) =>
    !o.receivedDate && o.dueDate &&
    o.dueDate >= todayMs && o.dueDate <= todayMs + state.pickupDays * DAY_MS &&
    o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const ready = state.orders.filter((o) => o.status === 'ready');

  if (overdue.length === 0 && needPickup.length === 0 && ready.length === 0) return null;

  const card = el('div', { className: 'card', style: { marginBottom: '16px', padding: '12px' } });
  card.appendChild(el('div', {
    style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', marginBottom: '10px' },
  }, '🔔 تنبيهات عاجلة'));

  const items = [];

  if (overdue.length > 0) {
    items.push({
      icon: '🚨', color: '#C62828', bg: '#FFEBEE',
      label: overdue.length + ' طلب متأخر',
      sub: overdue.slice(0, 2).map((o) => {
        const c = state.customerMap[o.customerId];
        return (c ? c.name : 'عميل') + ' · ' + formatDate(o.dueDate);
      }).join(' — '),
    });
  }

  if (needPickup.length > 0) {
    items.push({
      icon: '🧵', color: '#F57C00', bg: '#FFF3E0',
      label: needPickup.length + ' طلب يحتاج استلام قماش',
      sub: 'التسليم خلال ' + state.pickupDays + ' أيام',
    });
  }

  if (ready.length > 0) {
    items.push({
      icon: '✅', color: '#2E7D32', bg: '#E8F5E9',
      label: ready.length + ' طلب جاهز للتسليم',
      sub: 'في انتظار العميل',
    });
  }

  items.forEach((it) => {
    card.appendChild(el('div', {
      style: { padding: '8px 10px', background: it.bg, borderRadius: '8px',
        marginBottom: '6px', borderRight: '3px solid ' + it.color },
    }, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' } }, [
        el('span', { style: { fontSize: '16px' } }, it.icon),
        el('span', { style: { fontSize: '13px', fontWeight: '600', color: it.color } }, it.label),
      ]),
      it.sub ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } }, it.sub) : null,
    ]));
  });

  return card;
}

/* ==========================================================================
   الإحصاءات والبانرات العلوية
   ========================================================================== */

export function renderStats(ctx) {
  const { state } = ctx;
  const wrap = state.container?.querySelector('#orders-stats');
  if (!wrap) return;
  clear(wrap);

  const active = state.orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const ready = state.orders.filter((o) => o.status === 'ready').length;
  const totalAmount = state.orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '📦'),
    el('span', { className: 'stat__value' }, String(state.orders.length)),
    el('span', { className: 'stat__label' }, 'إجمالي'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '⏳'),
    el('span', { className: 'stat__value' }, String(active)),
    el('span', { className: 'stat__label' }, 'نشط'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '✅'),
    el('span', { className: 'stat__value' }, String(ready)),
    el('span', { className: 'stat__label' }, 'جاهز'),
  ]));
  wrap.appendChild(el('div', { className: 'stat' }, [
    el('span', { className: 'stat__icon' }, '💰'),
    el('span', { className: 'stat__value' }, formatEGP(totalAmount)),
    el('span', { className: 'stat__label' }, 'إجمالي المبالغ'),
  ]));

  const sp = summarizeProfit(state.orders);
  if (sp.count > 0) {
    wrap.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, '📈'),
      el('span', { className: 'stat__value', style: { color: sp.profit < 0 ? '#C62828' : '#2E7D32' } }, formatEGP(sp.profit)),
      el('span', { className: 'stat__label' }, 'ربح المسلَّم (' + sp.margin + '% من ' + sp.count + ' طلب)'),
    ]));
  }
}

export function renderTopBanners(ctx) {
  const { state } = ctx;
  const dailyWrap = state.container?.querySelector('#orders-daily-limit');
  if (dailyWrap) {
    clear(dailyWrap);
    const bar = buildDailyLimitBar(ctx);
    if (bar) dailyWrap.appendChild(bar);
  }

  const alertsWrap = state.container?.querySelector('#orders-alerts');
  if (alertsWrap) {
    clear(alertsWrap);
    const alerts = buildUrgentAlerts(ctx);
    if (alerts) alertsWrap.appendChild(alerts);
  }
}
