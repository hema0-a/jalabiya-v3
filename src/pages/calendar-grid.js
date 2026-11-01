/* ==========================================================================
   calendar-grid.js — رأس التقويم والفلاتر والإحصائيات وشبكة الأيام والمفتاح (v3.5.24: مفصول عن calendar.js)
   ==========================================================================
   API: renderHeader(ctx) · renderFilters(ctx) · renderStats(ctx) · renderGrid(ctx) · renderLegend()
   ctx = { state, navigate, goToToday, refresh }. لا يستورد calendar.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { DAY_NAMES_SHORT, MONTH_NAMES } from '../core/config.js';
import { isPastDue } from '../services/order-timing.js';
import { startOfNextDay } from '../core/day-math.js';
import { startOfDayMs, isSameDay, formatArabicDate, eventsForDay } from './calendar-utils.js';
import { openDayModal } from './calendar-day.js';

export function renderHeader(ctx) {
  const { state } = ctx;
  const btnStyle = { minWidth: '40px' };
  const btnPrev = el('button', {
    className: 'btn btn--secondary',
    style: btnStyle,
    'aria-label': 'الشهر السابق',
    onClick: () => ctx.navigate(-1),
  }, '‹');
  const btnNext = el('button', {
    className: 'btn btn--secondary',
    style: btnStyle,
    'aria-label': 'الشهر التالي',
    onClick: () => ctx.navigate(1),
  }, '›');
  const btnToday = el('button', {
    className: 'btn btn--primary btn--sm',
    onClick: () => ctx.goToToday(),
  }, '📌 اليوم');

  const title = el('div', {
    style: {
      flex: '1',
      textAlign: 'center',
      fontWeight: '600',
      fontSize: '16px',
      color: '#123C2F',
    },
  }, '📅 ' + MONTH_NAMES[state.month] + ' ' + state.year);

  return el('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '12px',
    },
  }, [btnPrev, title, btnNext, btnToday]);
}

export function renderFilters(ctx) {
  const { state } = ctx;
  const wrap = el('div', {
    style: { display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' },
  });
  const filters = [
    { id: 'all',          label: '🎯 الكل' },
    { id: 'orders',       label: '📋 الطلبات' },
    { id: 'appointments', label: '📅 المواعيد' },
  ];
  filters.forEach((f) => {
    const isActive = state.filter === f.id;
    wrap.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--sm ' + (isActive ? 'btn--primary' : 'btn--ghost'),
      onClick: () => {
        state.filter = f.id;
        try { localStorage.setItem('jalabiya_v3_calendar_filter', f.id); } catch {}
        ctx.refresh();
      },
    }, f.label));
  });
  return wrap;
}

export function renderStats(ctx) {
  const { state } = ctx;
  const now = Date.now();
  const todayStart = startOfDayMs(now);
  const todayEnd = startOfNextDay(todayStart);

  const monthOrders = state.events.filter((e) => e.type === 'order').length;
  const todayOrders = state.events.filter((e) =>
    e.type === 'order' && e.date >= todayStart && e.date < todayEnd
  ).length;

  const grid = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' },
  });

  [
    { icon: '📊', value: String(monthOrders),    label: 'هذا الشهر', color: '#2E7D32' },
    { icon: '📅', value: String(todayOrders),    label: 'اليوم',     color: '#F57C00' },
    { icon: '🚨', value: String(state.overdueCount), label: 'متأخرة',  color: '#C62828' },
  ].forEach((s) => {
    grid.appendChild(el('div', { className: 'stat' }, [
      el('span', { className: 'stat__icon' }, s.icon),
      el('span', { className: 'stat__value', style: { color: s.color } }, s.value),
      el('span', { className: 'stat__label' }, s.label),
    ]));
  });

  return grid;
}

function buildDayCell(ctx, day, ts) {
  const { state } = ctx;
  const now = Date.now();
  const isToday = isSameDay(ts, now);
  const isOff = new Date(ts).getDay() === state.dayOffWeekday;
  const dayEvents = eventsForDay(state, ts);
  const orders = dayEvents.filter((e) => e.type === 'order');
  const appts = dayEvents.filter((e) => e.type === 'appointment');

  /* حساب لون النقطة */
  let dotColor = null;
  if (orders.length > 0) {
    const hasOverdue = orders.some((o) =>
      isPastDue(o.date, now) && o.metadata.status !== 'delivered' && o.metadata.status !== 'cancelled'
    );
    const hasSoon = orders.some((o) => {
      const diff = o.date - now;
      return !isPastDue(o.date, now) && diff < 3 * 86400000;
    });
    const allDelivered = orders.every((o) => o.metadata.status === 'delivered');
    dotColor = hasOverdue ? '#C62828' : hasSoon ? '#F57C00' : allDelivered ? '#2E7D32' : '#2E7D32';
  }

  /* الستايلات */
  const style = {
    minHeight: '56px',
    padding: '4px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    cursor: 'pointer',
    userSelect: 'none',
    position: 'relative',
    background: isOff ? '#E5DDD0' : '#FFF',
    border: isToday ? '2px solid #1F6D57' : '1px solid #E5DDD0',
    transition: 'transform 0.1s',
  };

  const cell = el('div', {
    style,
    'data-day': String(day),
    'aria-label': formatArabicDate(ts),
    onClick: () => openDayModal(ctx, ts),
  });

  /* رقم اليوم */
  cell.appendChild(el('div', {
    style: {
      fontSize: '13px',
      fontWeight: isToday ? '700' : '500',
      color: '#123C2F',
      lineHeight: '1',
    },
  }, String(day)));

  /* رمز الإجازة */
  if (isOff) {
    cell.appendChild(el('div', {
      style: { fontSize: '9px', color: '#666', marginTop: '2px' },
    }, '🏖️'));
  }

  /* شرائط الأحداث */
  const bars = el('div', {
    style: { display: 'flex', gap: '2px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' },
  });
  if (orders.length > 0) {
    bars.appendChild(el('span', {
      style: {
        fontSize: '9px', background: '#FFF3E0', color: '#E65100',
        padding: '1px 4px', borderRadius: '6px', lineHeight: '1.2',
      },
    }, '📋' + orders.length));
  }
  if (appts.length > 0) {
    bars.appendChild(el('span', {
      style: {
        fontSize: '9px', background: '#E3F2FD', color: '#1565C0',
        padding: '1px 4px', borderRadius: '6px', lineHeight: '1.2',
      },
    }, '📅' + appts.length));
  }
  if (bars.children.length > 0) cell.appendChild(bars);

  /* النقطة الملونة */
  if (dotColor) {
    cell.appendChild(el('span', {
      style: {
        position: 'absolute',
        bottom: '4px',
        width: '6px', height: '6px',
        borderRadius: '50%',
        background: dotColor,
      },
    }));
  }

  return cell;
}

export function renderGrid(ctx) {
  const { state } = ctx;
  const grid = el('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: '4px',
      marginBottom: '16px',
    },
  });

  /* أسماء الأيام */
  DAY_NAMES_SHORT.forEach((name) => {
    grid.appendChild(el('div', {
      style: {
        textAlign: 'center',
        fontSize: '11px',
        fontWeight: '600',
        color: '#2E8B6F',
        padding: '4px 0',
      },
    }, name));
  });

  /* الفراغات قبل أول يوم */
  const firstDay = new Date(state.year, state.month, 1);
  const startWeekday = firstDay.getDay(); // 0=Sunday
  for (let i = 0; i < startWeekday; i++) {
    grid.appendChild(el('div', { style: { minHeight: '56px' } }));
  }

  /* أيام الشهر */
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const ts = new Date(state.year, state.month, d).getTime();
    grid.appendChild(buildDayCell(ctx, d, ts));
  }

  /* الفراغات بعد آخر يوم (لإكمال الشبكة) */
  const totalCells = startWeekday + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder !== 0) {
    for (let i = 0; i < (7 - remainder); i++) {
      grid.appendChild(el('div', { style: { minHeight: '56px' } }));
    }
  }

  return grid;
}

export function renderLegend() {
  const items = [
    { color: '#2E7D32', label: 'قريب' },
    { color: '#F57C00', label: 'خلال 3 أيام' },
    { color: '#C62828', label: 'متأخر' },
    { color: '#9E9E9E', label: '🏖️ إجازة' },
  ];
  const wrap = el('div', {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      justifyContent: 'center',
      padding: '8px',
      background: '#F6F1E6',
      borderRadius: '8px',
      marginBottom: '16px',
      fontSize: '11px',
      color: '#666',
    },
  });
  items.forEach((it) => {
    wrap.appendChild(el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '4px' },
    }, [
      el('span', {
        style: { width: '8px', height: '8px', borderRadius: '50%', background: it.color },
      }),
      el('span', {}, it.label),
    ]));
  });
  return wrap;
}
