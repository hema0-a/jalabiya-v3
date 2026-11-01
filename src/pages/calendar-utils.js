/* ==========================================================================
   calendar-utils.js — أدوات تاريخ التقويم (v3.5.24: مفصول عن calendar.js)
   ==========================================================================
   دوال نقية بلا DOM. eventsForDay تستلم الحالة وسيطاً.
   لا يستورد calendar.js (لا دورات استيراد).
   ========================================================================== */

import { DAY_NAMES_SHORT, MONTH_NAMES } from '../core/config.js';

export function monthStartMs(y, m) { return new Date(y, m, 1, 0, 0, 0, 0).getTime(); }
export function monthEndMs(y, m)   { return new Date(y, m + 1, 1, 0, 0, 0, 0).getTime(); }

export function startOfDayMs(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(ts1, ts2) {
  return startOfDayMs(ts1) === startOfDayMs(ts2);
}

export function formatArabicDate(ts) {
  const d = new Date(ts);
  return DAY_NAMES_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' +
    MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
}

export function shortDate(ts) {
  const d = new Date(ts);
  return d.getDate() + '/' + (d.getMonth() + 1);
}


export function eventsForDay(state, ts) {
  return state.events.filter((e) => isSameDay(e.date, ts));
}
