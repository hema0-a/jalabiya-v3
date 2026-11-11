/* ==========================================================================
   calendar.js — تقويم المواعيد (عرض شهري مرئي)
   ==========================================================================
   - يعتمد على services/calendar-events.js للأحداث الموحّدة.
   - يقرأ dayOffWeekday من الإعدادات.
   - 4 فلاتر: طلبات / مواعيد / شخصي (التزامات·مستندات·جمعيات·مهام — v3.18.0) / الكل.
   [v3.5.25] قُسِّمت الصفحة دون تغيير سلوك (على نمط orders*.js):
     calendar.js        — الحالة + تحميل الشهر + التنقل + الواجهة العامة (هذا الملف)
     calendar-utils.js  — أدوات التاريخ (نقية)
     calendar-grid.js   — الرأس والفلاتر والإحصائيات والشبكة والمفتاح
     calendar-day.js    — نافذة تفاصيل اليوم + قسم «القادم»
   الوحدات تستلم ctx ولا تستورد هذا الملف.
   ========================================================================== */

import { clear } from '../core/dom.js';
import { settings } from '../data/repos/settings.js';
import { getCalendarEvents, getOverdueOrdersCount } from '../services/calendar-events.js';
import { monthStartMs, monthEndMs } from './calendar-utils.js';
import { resolveDayOffSettings } from '../core/day-off.js';
import { renderHeader, renderFilters, renderStats, renderGrid, renderLegend } from './calendar-grid.js';
import { renderUpcoming } from './calendar-day.js';

/* --- حالة الصفحة (كائن واحد ثابت الهوية؛ يُعاد ضبطه في destroy) --- */
const state = {
  container: null,
  year: 0,
  month: 0,           // 0-11
  events: [],
  filter: 'all',
  dayOffWeekday: 0,
  overdueCount: 0,
};

const ctx = { state, navigate, goToToday, refresh: refreshAll };

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

  c.appendChild(renderHeader(ctx));
  c.appendChild(renderFilters(ctx));
  c.appendChild(renderStats(ctx));
  c.appendChild(renderGrid(ctx));
  c.appendChild(renderLegend());

  /* قسم المواعيد القادمة (async) */
  renderUpcoming(ctx).then((node) => {
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
      /* v3.5.34: مواصفة الإجازة (أيام أسبوعية متعددة + تواريخ محددة) */
      state.dayOffWeekday = resolveDayOffSettings(s.dailyLimit);
    } catch {
      state.dayOffWeekday = 0;
    }

    /* استعادة الفلتر */
    try {
      const f = localStorage.getItem('jalabiya_v3_calendar_filter');
      if (f === 'all' || f === 'orders' || f === 'appointments' || f === 'personal') state.filter = f;
    } catch {}

    /* الشهر الحالي */
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();

    await loadMonth();
    renderPage();
  },

  destroy() {
    Object.assign(state, {
      container: null,
      year: 0,
      month: 0,
      events: [],
      filter: 'all',
      dayOffWeekday: 0,
      overdueCount: 0,
    });
  },
};
