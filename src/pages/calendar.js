/* ==========================================================================
   calendar.js — تقويم المواعيد (عرض شهري مرئي)
   ==========================================================================
   - يعتمد على services/calendar-events.js للأحداث الموحّدة.
   - يقرأ dayOffWeekday من الإعدادات.
   - 3 فلاتر: طلبات / مواعيد / الكل.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { settings } from '../data/repos/settings.js';
import { getCalendarEvents, getOverdueOrdersCount } from '../services/calendar-events.js';
import { DAY_NAMES_SHORT, MONTH_NAMES, DEFAULT_SETTINGS } from '../core/config.js';
import { formatEGP } from '../core/utils.js';

/* --- حالة الصفحة --- */
let state = {
  container: null,
  year: 0,
  month: 0,           // 0-11
  events: [],
  filter: 'all',
  dayOffWeekday: 0,
  overdueCount: 0,
};

/* ==========================================================================
   1. أدوات التاريخ
   ========================================================================== */

function monthStartMs(y, m) { return new Date(y, m, 1, 0, 0, 0, 0).getTime(); }
function monthEndMs(y, m)   { return new Date(y, m + 1, 1, 0, 0, 0, 0).getTime(); }

function startOfDayMs(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isSameDay(ts1, ts2) {
  return startOfDayMs(ts1) === startOfDayMs(ts2);
}

function formatArabicDate(ts) {
  const d = new Date(ts);
  return DAY_NAMES_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' +
    MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
}

function shortDate(ts) {
  const d = new Date(ts);
  return d.getDate() + '/' + (d.getMonth() + 1);
}

/* ==========================================================================
   2. تحميل البيانات
   ========================================================================== */

async function loadMonth() {
  const s = monthStartMs(state.year, state.month);
  const e = monthEndMs(state.year, state.month);
  const [events, overdue] = await Promise.all([
    getCalendarEvents(s, e, state.filter),
    getOverdueOrdersCount(),
  ]);
  state.events = events;
  state.overdueCount = overdue;
}

/* ==========================================================================
   3. الرسم
   ========================================================================== */

function renderHeader() {
  const btnStyle = { minWidth: '40px' };
  const btnPrev = el('button', {
    className: 'btn btn--secondary',
    style: btnStyle,
    'aria-label': 'الشهر السابق',
    onClick: () => navigate(-1),
  }, '‹');
  const btnNext = el('button', {
    className: 'btn btn--secondary',
    style: btnStyle,
    'aria-label': 'الشهر التالي',
    onClick: () => navigate(1),
  }, '›');
  const btnToday = el('button', {
    className: 'btn btn--primary btn--sm',
    onClick: () => goToToday(),
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

function renderFilters() {
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
        refreshAll();
      },
    }, f.label));
  });
  return wrap;
}

function renderStats() {
  const now = Date.now();
  const todayStart = startOfDayMs(now);
  const todayEnd = todayStart + 86400000;

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

function eventsForDay(ts) {
  return state.events.filter((e) => isSameDay(e.date, ts));
}

function buildDayCell(day, ts) {
  const now = Date.now();
  const isToday = isSameDay(ts, now);
  const isOff = new Date(ts).getDay() === state.dayOffWeekday;
  const dayEvents = eventsForDay(ts);
  const orders = dayEvents.filter((e) => e.type === 'order');
  const appts = dayEvents.filter((e) => e.type === 'appointment');

  /* حساب لون النقطة */
  let dotColor = null;
  if (orders.length > 0) {
    const hasOverdue = orders.some((o) =>
      o.date < now && o.metadata.status !== 'delivered' && o.metadata.status !== 'cancelled'
    );
    const hasSoon = orders.some((o) => {
      const diff = o.date - now;
      return diff >= 0 && diff < 3 * 86400000;
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
    onClick: () => openDayModal(ts),
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

function renderGrid() {
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
    grid.appendChild(buildDayCell(d, ts));
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

function renderLegend() {
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

async function renderUpcoming() {
  const now = Date.now();
  const monthEnd = now + 30 * 86400000;
  const upcoming = await getCalendarEvents(now, monthEnd, state.filter);

  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📌 المواعيد القادمة (30 يوماً)'),
  ]));

  if (upcoming.length === 0) {
    card.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا توجد مواعيد خلال 30 يوماً.'));
    return card;
  }

  /* تجميع حسب اليوم */
  const byDay = {};
  upcoming.forEach((e) => {
    const k = startOfDayMs(e.date);
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(e);
  });

  const sortedDays = Object.keys(byDay).map(Number).sort((a, b) => a - b).slice(0, 10);
  sortedDays.forEach((dayMs) => {
    const events = byDay[dayMs];
    const dayCard = el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        cursor: 'pointer',
      },
      onClick: () => openDayModal(dayMs),
    });
    dayCard.appendChild(el('div', {
      style: { fontSize: '13px', fontWeight: '600', color: '#123C2F', marginBottom: '4px' },
    }, formatArabicDate(dayMs) + ' — ' + events.length + ' حدث'));

    events.slice(0, 3).forEach((e) => {
      dayCard.appendChild(el('div', {
        style: { fontSize: '12px', color: '#666', padding: '2px 0' },
      }, e.icon + ' ' + e.title + ' — ' + e.subtitle));
    });
    if (events.length > 3) {
      dayCard.appendChild(el('div', {
        style: { fontSize: '11px', color: '#2E8B6F', marginTop: '2px' },
      }, '+ ' + (events.length - 3) + ' حدث آخر'));
    }
    card.appendChild(dayCard);
  });

  return card;
}

/* ==========================================================================
   4. نافذة تفاصيل اليوم
   ========================================================================== */

function openDayModal(ts) {
  const dayEvents = eventsForDay(ts);
  const orders = dayEvents.filter((e) => e.type === 'order');
  const appts = dayEvents.filter((e) => e.type === 'appointment');

  const body = el('div', {});

  if (dayEvents.length === 0) {
    body.appendChild(el('p', {
      style: { textAlign: 'center', color: '#2E8B6F', padding: '16px' },
    }, 'لا توجد أحداث في هذا اليوم'));
  }

  if (orders.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '0 0 8px 0' },
    }, '📋 الطلبات (' + orders.length + ')'));
    orders.forEach((o) => {
      body.appendChild(el('div', {
        style: {
          padding: '8px', background: '#F6F1E6',
          borderRadius: '6px', marginBottom: '6px', fontSize: '13px',
        },
      }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F' } }, '👤 ' + o.title),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, o.subtitle),
        el('div', { style: { fontSize: '12px', color: '#B8863B', marginTop: '2px' } },
          '💰 ' + formatEGP(o.metadata.amount)),
      ]));
    });
  }

  if (appts.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '12px 0 8px 0' },
    }, '📅 المواعيد (' + appts.length + ')'));
    appts.forEach((a) => {
      body.appendChild(el('div', {
        style: {
          padding: '8px', background: '#E3F2FD',
          borderRadius: '6px', marginBottom: '6px', fontSize: '13px',
        },
      }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F' } }, '📅 ' + a.title),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, a.subtitle),
      ]));
    });
  }

  modal.open({
    title: formatArabicDate(ts),
    body,
    closable: true,
    actions: [
      { text: 'إغلاق', variant: 'primary', action: 'close' },
    ],
  });
}

/* ==========================================================================
   5. التنقل
   ========================================================================== */

async function navigate(delta) {
  let m = state.month + delta;
  let y = state.year;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  state.year = y;
  state.month = m;
  await refreshAll();
}

async function goToToday() {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth();
  await refreshAll();
}

async function refreshAll() {
  await loadMonth();
  renderPage();
}

/* ==========================================================================
   6. بناء الصفحة الكاملة
   ========================================================================== */

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  c.appendChild(renderHeader());
  c.appendChild(renderFilters());
  c.appendChild(renderStats());
  c.appendChild(renderGrid());
  c.appendChild(renderLegend());

  /* قسم المواعيد القادمة (async) */
  renderUpcoming().then((node) => {
    if (node) c.appendChild(node);
  });
}

/* ==========================================================================
   7. API عام
   ========================================================================== */

export const calendarPage = {
  async render(container) {
    clear(container);
    state.container = container;

    /* قراءة الإعدادات */
    try {
      const s = await settings.get();
      state.dayOffWeekday = (s.dailyLimit && s.dailyLimit.dayOffWeekday != null)
        ? Number(s.dailyLimit.dayOffWeekday)
        : (DEFAULT_SETTINGS.dailyLimit.dayOffWeekday ?? 0);
    } catch {
      state.dayOffWeekday = 0;
    }

    /* استعادة الفلتر */
    try {
      const f = localStorage.getItem('jalabiya_v3_calendar_filter');
      if (f === 'all' || f === 'orders' || f === 'appointments') state.filter = f;
    } catch {}

    /* الشهر الحالي */
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();

    await loadMonth();
    renderPage();
  },

  destroy() {
    state = {
      container: null,
      year: 0,
      month: 0,
      events: [],
      filter: 'all',
      dayOffWeekday: 0,
      overdueCount: 0,
    };
  },
};
